import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import type { IceServer } from "../../src/shared/socket/index.ts";
import { SETUP_SECRET } from "./app.ts";

// Relay credential renewal, as the page takes it. The instance hands a tab a fresh
// credential 11 hours after its last, which Seam 1 proves; here the test hands it to the
// page itself, over the room's socket routed through the test, since this instance runs
// on the real clock. The media is fake: a journey says whether the tab's connection is on
// the relay, and whether its restart works. Members Otto, Pia and Teo are this file's alone.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

/** A fresh credential, as the relay would mint one. */
const FRESH: IceServer[] = [
  { urls: "stun:relay.fake.invalid:3478" },
  { urls: ["turn:relay.fake.invalid:3478?transport=udp"], username: "fresh", credential: "fresh-secret" },
];

/**
 * Routes `page`'s room sockets through the test, which records what the page sends and
 * can hand the page a message of its own. While `holding` names a request type, a request
 * of that type waits, and goes on once `release` is called.
 */
async function routed(page: Page) {
  const sent: { type: string; request: { type: string; [key: string]: unknown } }[] = [];
  const route = {
    sent,
    /** Hands the page `message` as if the instance sent it. */
    hand: ((message: unknown) => void message) as (message: unknown) => void,
    holding: null as string | null,
    release: () => {},
  };
  await page.routeWebSocket(/\/api\/socket/, (socket) => {
    const instance = socket.connectToServer();
    socket.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as (typeof sent)[number];
      sent.push(parsed);
      if (route.holding !== null && parsed.request?.type === route.holding) {
        route.release = () => instance.send(message);
        return;
      }
      instance.send(message);
    });
    instance.onMessage((message) => socket.send(message));
    socket.onClose((code, reason) => void instance.close({ code, reason }));
    route.hand = (message) => socket.send(JSON.stringify(message));
  });
  return route;
}

/** Steers the fake media client on `page`, and reads it back. */
function fake(page: Page, set: Partial<Pick<FakeMediaControl, "relayed" | "bytes" | "restartFails">> = {}) {
  return page.evaluate((set) => {
    const control = (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia;
    Object.assign(control, set);
    return { connections: control.connections, restarts: control.restarts, iceServers: control.iceServers };
  }, set);
}

/**
 * The owner in the first room with a webcam live, and `name` joined through a routed
 * socket, watching it and sharing a webcam that the owner watches.
 */
async function watchingAndSharing(browser: Browser, baseURL: string | undefined, name: string) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  await owner.getByRole("button", { name: "Share webcam" }).click();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const member = await (await newBrowser(browser, baseURL)).newPage();
  const route = await routed(member);
  await member.goto(`/invite/${invite.code}`);
  await member.getByRole("button", { name: `Join as ${name}` }).click();
  await expect(member).toHaveURL(owner.url());

  await member.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Owner's webcam" }).click();
  const ownersPicture = member.getByRole("main", { name: "Stage" }).getByRole("img", { name: "Owner's webcam, with no picture" });
  await expect(ownersPicture).toBeVisible();
  await member.getByRole("button", { name: "Share webcam" }).click();
  await expect(member.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  const ownerHere = owner.getByRole("region", { name: "Here" });
  await ownerHere.getByRole("button", { name: `Watch ${name}'s webcam` }).click();
  const membersPicture = owner.getByRole("main", { name: "Stage" }).getByRole("img", { name: `${name}'s webcam, with no picture` });
  await expect(membersPicture).toBeVisible();
  return { owner, ownerHere, member, route, ownersPicture, membersPicture };
}

/** The requests of `type` in `area` the page has sent. */
function requests(route: Awaited<ReturnType<typeof routed>>, area: string, type: string) {
  return route.sent.filter((message) => message.type === area && message.request.type === type).map((message) => message.request);
}

test("a tab on a direct path takes a fresh credential silently", async ({ browser, baseURL }) => {
  const { owner, member: otto, route, ownersPicture, membersPicture } = await watchingAndSharing(browser, baseURL, "Otto");
  expect(await fake(otto, { bytes: 4000 })).toMatchObject({ connections: 1, restarts: 0 });

  route.hand({ type: "media", change: { type: "renewed", iceServers: FRESH } });

  await expect.poll(async () => (await fake(otto)).iceServers).toEqual(FRESH);
  expect(await fake(otto)).toMatchObject({ connections: 1, restarts: 0 });
  // Nothing is restarted or reconnected, and the usage total carries on.
  await expect.poll(() => requests(route, "usage", "received").at(-1), { timeout: 10_000 }).toEqual({
    type: "received",
    bytes: 4000,
    relayed: false,
  });
  expect(requests(route, "media", "restart")).toEqual([]);
  expect(requests(route, "media", "reconnect")).toEqual([]);
  expect(requests(route, "usage", "received").filter((report) => report.final)).toEqual([]);
  await expect(otto.getByRole("main", { name: "Stage" }).getByText("Reconnecting…")).toHaveCount(0);
  await expect(ownersPicture).toBeVisible();
  await expect(membersPicture).toBeVisible();
  await expect(otto.getByRole("button", { name: "Webcam live" })).toBeDisabled();

  await otto.close();
  await owner.close();
});

test("a tab on the relay sends its final total, then restarts its connection with the fresh credential", async ({
  browser,
  baseURL,
}) => {
  const { owner, member: pia, route, ownersPicture, membersPicture } = await watchingAndSharing(browser, baseURL, "Pia");
  await fake(pia, { relayed: true, bytes: 5000 });

  route.hand({ type: "media", change: { type: "renewed", iceServers: FRESH } });

  await expect
    .poll(() => requests(route, "media", "restart"))
    .toEqual([{ type: "restart", offer: expect.any(String), mid: expect.any(String) }]);
  await expect.poll(async () => (await fake(pia)).restarts).toBe(1);
  expect(await fake(pia)).toMatchObject({ connections: 1, iceServers: FRESH });
  // The final total went out just before the restart.
  const finals = route.sent.findIndex((message) => message.type === "usage" && message.request.final === true);
  const restart = route.sent.findIndex((message) => message.type === "media" && message.request.type === "restart");
  expect(route.sent[finals]?.request).toEqual({ type: "received", bytes: 5000, relayed: true, final: true });
  expect(finals).toBeLessThan(restart);
  // Every share and watch carries on, on the same connection.
  await expect(ownersPicture).toBeVisible();
  await expect(membersPicture).toBeVisible();
  await expect(pia.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(pia.getByText("Owner watching")).toBeVisible();

  // The instance counts from zero after the restart; so do the tab's next totals.
  await fake(pia, { bytes: 8000 });
  await expect.poll(() => requests(route, "usage", "received").at(-1), { timeout: 10_000 }).toEqual({
    type: "received",
    bytes: 3000,
    relayed: true,
  });

  await pia.close();
  await owner.close();
});

test("a tab whose restart fails reconnects the ordinary way, with its shares and watching back", async ({
  browser,
  baseURL,
}) => {
  const { owner, ownerHere, member: teo, route, ownersPicture, membersPicture } = await watchingAndSharing(browser, baseURL, "Teo");
  await fake(teo, { relayed: true, bytes: 6000, restartFails: true });
  route.holding = "reconnect";

  route.hand({ type: "media", change: { type: "renewed", iceServers: FRESH } });

  // The restart fails: the tab sends its final total and asks to reconnect, and its stage says so.
  await expect.poll(() => requests(route, "media", "reconnect")).toHaveLength(1);
  expect(requests(route, "usage", "received").filter((report) => report.final)).toEqual([
    { type: "received", bytes: 6000, relayed: true, final: true },
    { type: "received", bytes: 0, relayed: true, final: true },
  ]);
  const reconnecting = teo.getByRole("main", { name: "Stage" }).getByText("Reconnecting…");
  await expect(reconnecting).toBeVisible();
  await expect(ownersPicture).toBeVisible();

  route.release();

  // A new media connection: Teo's webcam is live again with no picker, and he watches the owner's again.
  await expect(reconnecting).toHaveCount(0);
  await expect.poll(async () => (await fake(teo)).connections).toBe(2);
  await expect(teo.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(ownersPicture).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Watch Teo's webcam" })).toBeVisible();
  // As after any reconnect, the owner's watching of it is not carried over.
  await expect(membersPicture).toHaveCount(0);
  expect(await fake(teo)).toMatchObject({ restarts: 1 });

  await teo.close();
  await owner.close();
});
