import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { inBar, SETUP_SECRET } from "./app.ts";

// Media through dropped connections. A member's socket is routed through the test, which
// can hold its opening or stop passing anything either way, as on a dropped network. The
// media on both sides is fake. Members Kim, Kit, Ines, Rhea, Tove and Wren are this
// file's alone.

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
  await inBar(kim).getByRole("button", { name: "Share webcam" }).click();
  open();

  await expect(inBar(kim).getByRole("button", { name: "Webcam live" })).toBeDisabled();
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
  await inBar(owner).getByRole("button", { name: "Share webcam" }).click();
  await ines.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Owner's webcam" }).click();
  const ownersPicture = inesStage.getByRole("img", { name: "Owner's webcam, with no picture" });
  await expect(ownersPicture).toBeVisible();
  // She also watches the owner's screen, sent at two qualities, at 720p by choice.
  await owner.evaluate(() => {
    (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.twoQualities = true;
  });
  await inBar(owner).getByRole("button", { name: "Share screen" }).click();
  await owner.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await ines.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Owner's screen" }).click();
  const quality = inesStage.getByRole("radiogroup", { name: "Quality of Owner's screen" });
  await quality.getByRole("radio", { name: "720p" }).click();
  await expect(quality.getByRole("radio", { name: "720p" })).toBeChecked();
  await inBar(ines).getByRole("button", { name: "Share webcam" }).click();
  await inBar(ines).getByRole("button", { name: "Share screen" }).click();
  await ines.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(inBar(ines).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(inBar(ines).getByRole("button", { name: "Screen live" })).toBeDisabled();
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
  await expect(inBar(ines).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(inBar(ines).getByRole("button", { name: "Screen live" })).toBeDisabled();
  expect(await fake(ines)).toMatchObject({ connections: 2, asked: [expect.anything()] });

  // Nobody who watched Ines's webcam before is carried over.
  await expect(inesPicture).toHaveCount(0);
  await expect(ines.getByText("Owner watching")).toHaveCount(0);
  await expect(ines.getByText("No one watching").first()).toBeVisible();

  await ines.close();
  await owner.close();
});

test("a sharer whose network drops silently for a few seconds keeps her share, her media connection and her viewers", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const { owner, room, member: rhea, code } = await ownerAndInvited(browser, baseURL, "Rhea");
  const network = await routed(rhea);
  await rhea.goto(`/invite/${code}`);
  await rhea.getByRole("button", { name: "Join as Rhea" }).click();
  await expect(rhea).toHaveURL(room);
  const ownerHere = owner.getByRole("region", { name: "Here" });
  await inBar(rhea).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(rhea).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await ownerHere.getByRole("button", { name: "Watch Rhea's webcam" }).click();
  const picture = owner.getByRole("main", { name: "Stage" }).getByRole("img", { name: "Rhea's webcam, with no picture" });
  await expect(picture).toBeVisible();
  await expect(rhea.getByText("Owner watching")).toBeVisible();

  // Her network drops the way a real one does: the instance never hears her socket close.
  network.online = false;
  await expect(ownerHere.getByRole("button", { name: "Stop watching Rhea's webcam, reconnecting" })).toBeVisible({
    timeout: 15_000,
  });
  network.online = true;

  // Back in time, she is the same tab: the share, its connection and its viewer are as they were.
  await expect(ownerHere.getByRole("button", { name: "Stop watching Rhea's webcam" })).toBeVisible({ timeout: 15_000 });
  await expect(rhea.getByRole("main", { name: "Stage" }).getByText("Reconnecting…")).toHaveCount(0);
  await expect(inBar(rhea).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(rhea.getByText("Owner watching")).toBeVisible();
  await expect(picture).toBeVisible();
  expect(await fake(rhea)).toMatchObject({ connections: 1 });

  await rhea.close();
  await owner.close();
});

test("a sharer's tab tells the instance when its media connection falters and recovers", async ({ browser, baseURL }) => {
  const { owner, room, member: kit, code } = await ownerAndInvited(browser, baseURL, "Kit");
  const sent: string[] = [];
  kit.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(String(frame.payload))));
  await kit.goto(`/invite/${code}`);
  await kit.getByRole("button", { name: "Join as Kit" }).click();
  await expect(kit).toHaveURL(room);
  await inBar(kit).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(kit).getByRole("button", { name: "Webcam live" })).toBeDisabled();

  await kit.evaluate(() => (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.falter());
  await expect.poll(() => sent).toContainEqual(JSON.stringify({ type: "media", request: { type: "faltering" } }));
  await kit.evaluate(() => (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.recover());
  await expect.poll(() => sent).toContainEqual(JSON.stringify({ type: "media", request: { type: "recovered" } }));
  await expect(inBar(kit).getByRole("button", { name: "Webcam live" })).toBeDisabled();

  await kit.close();
  await owner.close();
});

test("a sharer's tab restarts a media connection the browser gave up on, until a restart finds a path", async ({ browser, baseURL }) => {
  const { owner, room, member: tove, code } = await ownerAndInvited(browser, baseURL, "Tove");
  const sent: string[] = [];
  tove.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(String(frame.payload))));
  await tove.goto(`/invite/${code}`);
  await tove.getByRole("button", { name: "Join as Tove" }).click();
  await expect(tove).toHaveURL(room);
  await inBar(tove).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(tove).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Tove's webcam" }).click();
  await expect(tove.getByText("Owner watching")).toBeVisible();
  const media = (act: (control: FakeMediaControl) => unknown) =>
    tove.evaluate(`(${act.toString()})(globalThis.graeaeFakeMedia)`) as Promise<unknown>;
  const restarts = () => media((control) => control.restarts) as Promise<number>;
  const faltering = JSON.stringify({ type: "media", request: { type: "faltering" } });
  const recovered = JSON.stringify({ type: "media", request: { type: "recovered" } });

  // The browser looking for another path by itself is left to it.
  await media((control) => control.falter());
  await expect.poll(() => sent).toContainEqual(faltering);
  await tove.waitForTimeout(1_500);
  expect(await restarts()).toBe(0);

  // The browser gives up: the tab restarts the connection, and tries again while no restart finds a path.
  await media((control) => (control.restartFails = true));
  await media((control) => control.fail());
  await expect.poll(restarts, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  expect(sent).not.toContainEqual(recovered);

  // The network is back: the next restart finds a path, and nothing was ended or carried anywhere.
  await media((control) => (control.restartFails = false));
  await expect.poll(() => sent, { timeout: 10_000 }).toContainEqual(recovered);
  await expect(inBar(tove).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(tove.getByText("Owner watching")).toBeVisible();
  expect(await media((control) => control.connections)).toBe(1);
  const settled = await restarts();
  await tove.waitForTimeout(2_000);
  expect(await restarts()).toBe(settled);

  await tove.close();
  await owner.close();
});

test("a sharer's tab stops restarting a failed media connection once the instance has ended its share", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { owner, room, member: wren, code } = await ownerAndInvited(browser, baseURL, "Wren");
  await wren.goto(`/invite/${code}`);
  await wren.getByRole("button", { name: "Join as Wren" }).click();
  await expect(wren).toHaveURL(room);
  await inBar(wren).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(wren).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  const media = (act: (control: FakeMediaControl) => unknown) =>
    wren.evaluate(`(${act.toString()})(globalThis.graeaeFakeMedia)`) as Promise<unknown>;
  const restarts = () => media((control) => control.restarts) as Promise<number>;

  // The network stays down: no restart finds a path, and after 30 seconds the instance ends the share.
  await media((control) => (control.restartFails = true));
  await media((control) => control.fail());
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Wren's webcam" })).toBeVisible();
  await expect(inBar(wren).getByRole("button", { name: "Share webcam" })).toBeEnabled({ timeout: 45_000 });
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Wren's webcam" })).toHaveCount(0);

  // The connection is gone, so nothing is restarted any more.
  const tried = await restarts();
  expect(tried).toBeGreaterThanOrEqual(2);
  await wren.waitForTimeout(5_000);
  expect(await restarts()).toBe(tried);

  await wren.close();
  await owner.close();
});
