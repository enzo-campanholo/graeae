import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { Unavailable } from "../../src/shared/socket/index.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { inBar, SETUP_SECRET } from "./app.ts";

// A receiving connection the browser gave up on, whose replacement is unavailable. Asked
// again while the media server fails, after a wait that doubles from 2 seconds up to 30;
// never again once the instance has nothing to replace. And one whose replacement carried
// nothing, which the instance then lets go of. The owner watches; the owner's socket is
// routed through the test, which records what goes each way and can answer for the
// instance or hold a message. The media is fake. Members Sami, Tiago and Ulla are this
// file's alone.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  // Pages first, so each member leaves cleanly and their shares end before the next journey.
  await Promise.all(opened.flatMap((context) => context.pages().map((page) => page.close())));
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

type Message = { type: string; request?: { type: string; connection?: string }; change?: { type: string; reason?: string } };

/**
 * Routes `page`'s sockets through the test, which records what goes each way: `sent`
 * from the page, with the test's `at` when it was sent, and `heard` from the instance.
 * While `failing` is set, each `replace` is answered unavailable for it by the test and
 * never reaches the instance. While `holding` names a request type, the next request of
 * that type waits until `release`; while `holdingChange` names a media change, the next
 * one waits until `deliver`.
 */
async function routed(page: Page) {
  const route = {
    at: 0,
    sent: [] as (Message & { at: number })[],
    heard: [] as Message[],
    failing: null as Unavailable | null,
    holding: null as string | null,
    release: () => {},
    holdingChange: null as string | null,
    deliver: null as (() => void) | null,
  };
  await page.routeWebSocket(/\/api\/socket/, (socket) => {
    const instance = socket.connectToServer();
    socket.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as Message;
      route.sent.push({ ...parsed, at: route.at });
      if (route.failing !== null && parsed.type === "media" && parsed.request?.type === "replace") {
        socket.send(JSON.stringify({ type: "media", change: { type: "unavailable", connection: "receiving", reason: route.failing } }));
        return;
      }
      if (route.holding !== null && parsed.request?.type === route.holding) {
        route.holding = null;
        route.release = () => instance.send(message);
        return;
      }
      instance.send(message);
    });
    instance.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as Message;
      route.heard.push(parsed);
      if (route.holdingChange !== null && parsed.type === "media" && parsed.change?.type === route.holdingChange) {
        route.holdingChange = null;
        route.deliver = () => socket.send(message);
        return;
      }
      socket.send(message);
    });
    socket.onClose((code, reason) => void instance.close({ code, reason }));
  });
  return route;
}

/** The owner, routed, in the first room, and Sami or Tiago invited and in it too, sharing a webcam. */
async function ownerAndSharer(browser: Browser, baseURL: string | undefined, name: string, before?: (owner: Page) => Promise<void>) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await before?.(owner);
  const route = await routed(owner);
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const sharer = await (await newBrowser(browser, baseURL)).newPage();
  await sharer.goto(`/invite/${invite.code}`);
  await sharer.getByRole("button", { name: `Join as ${name}` }).click();
  await expect(sharer).toHaveURL(room);
  await inBar(sharer).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(sharer).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  const media = (act: (control: FakeMediaControl) => unknown) =>
    owner.evaluate(`(${act.toString()})(globalThis.graeaeFakeMedia)`) as Promise<unknown>;
  return { owner, route, sharer, media };
}

const replaces = (route: Awaited<ReturnType<typeof routed>>) =>
  route.sent.filter((message) => message.type === "media" && message.request?.type === "replace");

/** How many times the page asked for a receiving connection. */
const connects = (route: Awaited<ReturnType<typeof routed>>) =>
  route.sent.filter((message) => message.request?.type === "connect" && message.request.connection === "receiving").length;

test("a tab whose replacements the media server fails asks again 2, 4, 8, 16, 30 and 30 seconds apart, and from 2 again after one succeeds or the connection recovers", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { owner, route, media } = await ownerAndSharer(browser, baseURL, "Sami", (page) => page.clock.install());
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Sami's webcam" }).click();
  const picture = owner.getByRole("main", { name: "Stage" }).getByRole("img", { name: "Sami's webcam, with no picture" });
  await expect(picture).toBeVisible();

  // From here the page's time moves only a second at a time, each followed by a moment in
  // which its messages go and come back, so a wait it starts begins on the second it was
  // asked. A try sent as a wait runs out goes while the second moves on: it counts as the new one.
  await owner.clock.pauseAt((await owner.evaluate(() => Date.now())) + 1_000);
  const tick = async () => {
    route.at += 1;
    await owner.clock.runFor(1_000);
    await new Promise((resolve) => setTimeout(resolve, 150));
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
  const gaps = (tries: { at: number }[]) => tries.slice(1).map((one, index) => one.at - tries[index]!.at);

  // The browser gives the receiving connection up, and the media server fails every replacement.
  route.failing = "failed";
  await media((control) => control.fail("receiving"));
  await settle();
  while (route.at < 95) await tick();
  const failed = replaces(route);
  expect(gaps(failed)).toEqual([2, 4, 8, 16, 30, 30]);

  // The media server is back: the next try, 30 seconds on, goes through, and the watch moves over.
  route.failing = null;
  for (let waited = 0; waited < 40 && (await media((control) => control.replacements)) === 0; waited += 1) await tick();
  expect(await media((control) => control.replacements)).toBe(1);
  expect(replaces(route).at(-1)!.at - failed.at(-1)!.at).toBe(30);
  for (let waited = 0; waited < 10 && !route.heard.some((message) => message.change?.type === "replaced"); waited += 1) await tick();
  expect(route.heard.filter((message) => message.change?.type === "replaced")).toHaveLength(1);
  await expect(picture).toBeVisible();

  // Given up again, the media server failing again: asked again 2 seconds on, then 4.
  const before = replaces(route).length;
  route.failing = "failed";
  await media((control) => control.fail("receiving"));
  await settle();
  for (let waited = 0; waited < 7; waited += 1) await tick();
  expect(gaps(replaces(route).slice(before))).toEqual([2, 4]);

  // Halfway through the 8-second wait the connection recovers by itself, and is given up
  // again a moment later: asked at once, then 2 seconds on, not 16.
  await media((control) => control.recover("receiving"));
  await tick();
  const again = replaces(route).length;
  await media((control) => control.fail("receiving"));
  await settle();
  for (let waited = 0; waited < 7; waited += 1) await tick();
  expect(gaps(replaces(route).slice(again))).toEqual([2, 4]);
});

test("a tab with nothing to replace asks no more, and its next watch makes a new receiving connection", async ({
  browser,
  baseURL,
}) => {
  const { owner, route, sharer, media } = await ownerAndSharer(browser, baseURL, "Tiago");
  const here = owner.getByRole("region", { name: "Here" });
  const stage = owner.getByRole("main", { name: "Stage" });

  // The owner's first watch is made a receiving connection, then held on its way while
  // Tiago stops sharing: the instance refuses the pull and lets go of the connection, and
  // its `dropped` is slow to reach the tab.
  route.holding = "watch";
  await here.getByRole("button", { name: "Watch Tiago's webcam" }).click();
  await expect.poll(() => route.holding).toBeNull();
  await sharer.getByRole("button", { name: "Stop sharing your webcam" }).click();
  await expect(here.getByRole("button", { name: "Watch Tiago's webcam" })).toHaveCount(0);
  route.holdingChange = "dropped";
  route.release();
  await expect.poll(() => route.deliver).not.toBeNull();
  expect(route.heard.filter((message) => message.change?.type === "pull-refused")).toHaveLength(1);

  // The browser gives up the connection the tab believes it still has: the instance has nothing to replace.
  await media((control) => control.fail("receiving"));
  await expect
    .poll(() => route.heard.filter((message) => message.change?.type === "unavailable"))
    .toEqual([{ type: "media", change: { type: "unavailable", connection: "receiving", reason: "nothing to replace" } }]);
  route.deliver!();

  // It asks no more, past the 2 seconds after which a failed one asks again.
  await owner.waitForTimeout(5_000);
  expect(replaces(route)).toHaveLength(1);
  await expect(stage.getByRole("img")).toHaveCount(0);

  // Tiago shares again, and the owner's watch asks for a new receiving connection, and shows it.
  expect(connects(route)).toBe(1);
  await inBar(sharer).getByRole("button", { name: "Share webcam" }).click();
  await here.getByRole("button", { name: "Watch Tiago's webcam" }).click();
  await expect(stage.getByRole("img", { name: "Tiago's webcam, with no picture" })).toBeVisible();
  expect(connects(route)).toBe(2);
  expect(await media((control) => control.connections.receiving)).toBe(2);
  expect(replaces(route)).toHaveLength(1);
});
test("a tab whose replacement carries nothing lets go of it, and a watch asked for meanwhile makes a new receiving connection and shows on the first click", async ({
  browser,
  baseURL,
}) => {
  const { owner, route, media } = await ownerAndSharer(browser, baseURL, "Ulla");
  const here = owner.getByRole("region", { name: "Here" });
  const stage = owner.getByRole("main", { name: "Stage" });

  // The owner watches Ulla's webcam and stops, so the receiving connection carries nothing.
  await here.getByRole("button", { name: "Watch Ulla's webcam" }).click();
  await expect(stage.getByRole("img", { name: "Ulla's webcam, with no picture" })).toBeVisible();
  await here.getByRole("button", { name: "Stop watching Ulla's webcam" }).click();
  await expect(stage.getByRole("img")).toHaveCount(0);

  // The browser gives it up, and the owner clicks Watch while its replacement is on its way.
  route.holding = "replace";
  await media((control) => control.fail("receiving"));
  await expect.poll(() => route.holding).toBeNull();
  await here.getByRole("button", { name: "Watch Ulla's webcam" }).click();
  route.release();

  // The replacement carried nothing, so it ends dropped, and the watch waiting its turn makes a new connection.
  await expect(stage.getByRole("img", { name: "Ulla's webcam, with no picture" })).toBeVisible();
  const changes = route.heard.filter((message) => message.type === "media").map((message) => message.change?.type);
  expect(changes).toContain("dropped");
  expect(changes).not.toContain("replaced");
  expect(changes).not.toContain("pull-refused");
  expect(replaces(route)).toHaveLength(1);
  expect(connects(route)).toBe(2);
});
