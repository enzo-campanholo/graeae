import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// Media through dropped connections. A member's socket is routed through the test, which
// can hold its opening or stop passing anything either way, as on a dropped network. The
// media on both sides is fake. Members Kim, Kit and Ines are this file's alone.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

/** The owner in the first room, and `name` invited and about to join from a page of their own. */
async function ownerAndInvited(browser: Browser, baseURL: string | undefined, name: string) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const memberContext = await newBrowser(browser, baseURL);
  const member = await memberContext.newPage();
  return { owner, room: owner.url(), member, code: invite.code };
}

/**
 * Routes `page`'s sockets through the test. Each opens only once `opening` resolves, and
 * nothing passes either way while `online` is false, nor does a socket opened meanwhile
 * reach anything.
 */
async function routed(page: Page) {
  const network = { online: true, opening: Promise.resolve() };
  await page.routeWebSocket(/\/api\/socket/, async (socket) => {
    await network.opening;
    if (!network.online) return;
    const instance = socket.connectToServer();
    socket.onMessage((message) => {
      if (network.online) instance.send(message);
    });
    instance.onMessage((message) => {
      if (network.online) socket.send(message);
    });
    socket.onClose((code, reason) => {
      if (network.online) void instance.close({ code, reason });
    });
  });
  return network;
}

test("a click on Share webcam before the room's socket has opened still shares", async ({ browser, baseURL }) => {
  const { owner, room, member: kim, code } = await ownerAndInvited(browser, baseURL, "Kim");
  await kim.goto(`/invite/${code}`);
  await kim.getByRole("button", { name: "Join as Kim" }).click();
  await expect(kim).toHaveURL(room);

  // A reload whose socket takes a moment to open: the button is there before the room is.
  const network = await routed(kim);
  let open = () => {};
  network.opening = new Promise((resolve) => (open = resolve));
  await kim.reload();
  await kim.getByRole("button", { name: "Share webcam" }).click();
  open();

  await expect(kim.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Kim's webcam" })).toBeVisible();

  // Pages close before their browsers, so each member leaves cleanly.
  await kim.close();
  await owner.close();
});

/** Reads the fake media client's control on `page`. */
function fake(page: Page): Promise<Pick<FakeMediaControl, "asked" | "connections">> {
  return page.evaluate(() => {
    const control = (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia;
    return { asked: control.asked, connections: control.connections };
  });
}

test("a member whose connection drops keeps watching and sharing, and gets both back after the grace period", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const { owner, room, member: ines, code } = await ownerAndInvited(browser, baseURL, "Ines");
  const network = await routed(ines);
  await ines.goto(`/invite/${code}`);
  await ines.getByRole("button", { name: "Join as Ines" }).click();
  await expect(ines).toHaveURL(room);
  const ownerHere = owner.getByRole("region", { name: "Here" });
  const ownerStage = owner.getByRole("main", { name: "Stage" });
  const inesStage = ines.getByRole("main", { name: "Stage" });
  await expect(ownerHere.getByRole("button", { name: "Ines" })).toBeVisible();

  // Ines watches the owner's webcam, and shares a webcam and a screen; the owner watches Ines's webcam.
  await owner.getByRole("button", { name: "Share webcam" }).click();
  await ines.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Owner's webcam" }).click();
  const ownersPicture = inesStage.getByRole("img", { name: "Owner's webcam, with no picture" });
  await expect(ownersPicture).toBeVisible();
  // She also watches the owner's screen, at 720p by choice.
  await owner.getByRole("button", { name: "Share screen" }).click();
  await owner.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await ines.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Owner's screen" }).click();
  const quality = inesStage.getByRole("radiogroup", { name: "Quality of Owner's screen" });
  await quality.getByRole("radio", { name: "720p" }).click();
  await expect(quality.getByRole("radio", { name: "720p" })).toBeChecked();
  await ines.getByRole("button", { name: "Share webcam" }).click();
  await ines.getByRole("button", { name: "Share screen" }).click();
  await ines.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(ines.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(ines.getByRole("button", { name: "Screen live" })).toBeDisabled();
  await ownerHere.getByRole("button", { name: "Watch Ines's webcam" }).click();
  const inesPicture = ownerStage.getByRole("img", { name: "Ines's webcam, with no picture" });
  await expect(inesPicture).toBeVisible();
  await expect(ines.getByText("Owner watching")).toBeVisible();
  expect(await fake(ines)).toMatchObject({ connections: 1, asked: [expect.anything()] });

  // Ines's network drops. Her stage keeps what it shows, and says so within a few seconds.
  network.online = false;
  const reconnecting = inesStage.getByText("Reconnecting…");
  await expect(reconnecting).toBeVisible({ timeout: 10_000 });
  await expect(ownersPicture).toBeVisible();

  // After about 10 seconds the owner sees the mark on each of Ines's shares, and keeps watching.
  await expect(ownerHere.getByRole("button", { name: "Stop watching Ines's webcam, reconnecting" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(ownerHere.getByRole("button", { name: "Watch Ines's screen, reconnecting" })).toBeVisible();
  await expect(inesPicture).toBeVisible();
  if (process.env.GRAEAE_SCREENSHOTS) {
    for (const colorScheme of ["dark", "light"] as const) {
      for (const [who, page] of [["owner", owner], ["ines", ines]] as const) {
        // The app is dark unless "You" says otherwise, whatever the system prefers.
        await page.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
        await page.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/reconnecting-${who}-${colorScheme}.png` });
      }
    }
  }

  // The grace period runs out: Ines leaves, and her shares end.
  await expect(ownerHere.getByRole("button", { name: /^Ines/ })).toHaveCount(0, { timeout: 30_000 });
  await expect(inesPicture).toHaveCount(0);

  // Ines's network is back. Her stage is as it was, and her shares start again with no picker.
  network.online = true;
  await expect(reconnecting).toHaveCount(0, { timeout: 15_000 });
  await expect(ownersPicture).toBeVisible();
  await expect(quality.getByRole("radio", { name: "720p" })).toBeChecked();
  await expect(ownerHere.getByRole("button", { name: "Watch Ines's webcam" })).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Watch Ines's screen" })).toBeVisible();
  await expect(ines.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(ines.getByRole("button", { name: "Screen live" })).toBeDisabled();
  expect(await fake(ines)).toMatchObject({ connections: 2, asked: [expect.anything()] });

  // Nobody who watched Ines's webcam before is carried over.
  await expect(inesPicture).toHaveCount(0);
  await expect(ines.getByText("Owner watching")).toHaveCount(0);
  await expect(ines.getByText("No one watching").first()).toBeVisible();

  await ines.close();
  await owner.close();
});

test("a sharer's tab tells the instance when its media connection falters and recovers", async ({ browser, baseURL }) => {
  const { owner, room, member: kit, code } = await ownerAndInvited(browser, baseURL, "Kit");
  const sent: string[] = [];
  kit.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(String(frame.payload))));
  await kit.goto(`/invite/${code}`);
  await kit.getByRole("button", { name: "Join as Kit" }).click();
  await expect(kit).toHaveURL(room);
  await kit.getByRole("button", { name: "Share webcam" }).click();
  await expect(kit.getByRole("button", { name: "Webcam live" })).toBeDisabled();

  await kit.evaluate(() => (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.falter());
  await expect.poll(() => sent).toContainEqual(JSON.stringify({ type: "media", request: { type: "faltering" } }));
  await kit.evaluate(() => (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.recover());
  await expect.poll(() => sent).toContainEqual(JSON.stringify({ type: "media", request: { type: "recovered" } }));
  await expect(kit.getByRole("button", { name: "Webcam live" })).toBeDisabled();

  await kit.close();
  await owner.close();
});
