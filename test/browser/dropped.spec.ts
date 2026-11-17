import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// Media through dropped connections. A member's socket is routed through the test, which
// can hold its opening or stop passing anything either way, as on a dropped network. The
// media on both sides is fake. Members Kim, Kit and Lou are this file's alone.

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
  const { owner, room, member: lou, code } = await ownerAndInvited(browser, baseURL, "Lou");
  const network = await routed(lou);
  await lou.goto(`/invite/${code}`);
  await lou.getByRole("button", { name: "Join as Lou" }).click();
  await expect(lou).toHaveURL(room);
  const ownerHere = owner.getByRole("region", { name: "Here" });
  const ownerStage = owner.getByRole("main", { name: "Stage" });
  const louStage = lou.getByRole("main", { name: "Stage" });
  await expect(ownerHere.getByRole("button", { name: "Lou" })).toBeVisible();

  // Lou watches the owner's webcam, and shares a webcam and a screen; the owner watches Lou's webcam.
  await owner.getByRole("button", { name: "Share webcam" }).click();
  await lou.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Owner's webcam" }).click();
  const ownersPicture = louStage.getByRole("img", { name: "Owner's webcam, with no picture" });
  await expect(ownersPicture).toBeVisible();
  await lou.getByRole("button", { name: "Share webcam" }).click();
  await lou.getByRole("button", { name: "Share screen" }).click();
  await lou.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(lou.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(lou.getByRole("button", { name: "Screen live" })).toBeDisabled();
  await ownerHere.getByRole("button", { name: "Watch Lou's webcam" }).click();
  const lousPicture = ownerStage.getByRole("img", { name: "Lou's webcam, with no picture" });
  await expect(lousPicture).toBeVisible();
  await expect(lou.getByText("Owner watching")).toBeVisible();
  expect(await fake(lou)).toMatchObject({ connections: 1, asked: [expect.anything()] });

  // Lou's network drops. Her stage keeps what it shows, and says so within a few seconds.
  network.online = false;
  const reconnecting = louStage.getByText("Reconnecting…");
  await expect(reconnecting).toBeVisible({ timeout: 10_000 });
  await expect(ownersPicture).toBeVisible();

  // After about 10 seconds the owner sees the mark on each of Lou's shares, and keeps watching.
  await expect(ownerHere.getByRole("button", { name: "Stop watching Lou's webcam, reconnecting" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(ownerHere.getByRole("button", { name: "Watch Lou's screen, reconnecting" })).toBeVisible();
  await expect(lousPicture).toBeVisible();
  if (process.env.GRAEAE_SCREENSHOTS) {
    for (const colorScheme of ["dark", "light"] as const) {
      for (const [who, page] of [["owner", owner], ["lou", lou]] as const) {
        // The app is dark unless "You" says otherwise, whatever the system prefers.
        await page.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
        await page.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/reconnecting-${who}-${colorScheme}.png` });
      }
    }
  }

  // The grace period runs out: Lou leaves, and her shares end.
  await expect(ownerHere.getByRole("button", { name: /^Lou/ })).toHaveCount(0, { timeout: 30_000 });
  await expect(lousPicture).toHaveCount(0);

  // Lou's network is back. Her stage is as it was, and her shares start again with no picker.
  network.online = true;
  await expect(reconnecting).toHaveCount(0, { timeout: 15_000 });
  await expect(ownersPicture).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Watch Lou's webcam" })).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Watch Lou's screen" })).toBeVisible();
  await expect(lou.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(lou.getByRole("button", { name: "Screen live" })).toBeDisabled();
  expect(await fake(lou)).toMatchObject({ connections: 2, asked: [expect.anything()] });

  // Nobody who watched Lou's webcam before is carried over.
  await expect(lousPicture).toHaveCount(0);
  await expect(lou.getByText("Owner watching")).toHaveCount(0);
  await expect(lou.getByText("No one watching").first()).toBeVisible();

  await lou.close();
  await owner.getByRole("button", { name: "Stop your webcam" }).click();
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
