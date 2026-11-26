import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { inBar, SETUP_SECRET } from "./app.ts";

// A watch refused because the tab's receiving connection is blocked (ticket 68): the page
// replaces the connection, its watches carried onto the new one, and asks again, so one
// click still puts the share on the stage. The owner's socket is routed through the test,
// which refuses the owner's next watch as blocked in the instance's place: the instance
// blocks a connection only on a pull held at its own fake media server, which a journey
// cannot reach. The media is fake. Member Xavi is this file's alone.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.flatMap((context) => context.pages().map((page) => page.close())));
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

type Message = { type: string; request?: { type: string; share?: unknown; connection?: string }; change?: { type: string } };

/**
 * Routes `page`'s sockets through the test, which records what goes each way. While
 * `blocking` is set, the page's next `watch` never reaches the instance: the test refuses
 * it as blocked.
 */
async function routed(page: Page) {
  const route = { sent: [] as Message[], heard: [] as Message[], blocking: false };
  await page.routeWebSocket(/\/api\/socket/, (socket) => {
    const instance = socket.connectToServer();
    socket.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as Message;
      route.sent.push(parsed);
      if (route.blocking && parsed.type === "watching" && parsed.request?.type === "watch") {
        socket.send(JSON.stringify({ type: "media", change: { type: "pull-refused", share: parsed.request.share, blocked: true } }));
        route.blocking = false;
        return;
      }
      instance.send(message);
    });
    instance.onMessage((message) => {
      route.heard.push(JSON.parse(String(message)) as Message);
      socket.send(message);
    });
    socket.onClose((code, reason) => void instance.close({ code, reason }));
  });
  return route;
}

/** The owner, routed, in the first room, and `name` invited and in it too, sharing a webcam and a screen. */
async function ownerAndSharer(browser: Browser, baseURL: string | undefined, name: string) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
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
  await inBar(sharer).getByRole("button", { name: "Share screen" }).click();
  await sharer.getByRole("button", { name: "Choose what to share" }).click();
  await expect(inBar(sharer).getByRole("button", { name: "Screen live" })).toBeDisabled();
  const media = (act: (control: FakeMediaControl) => unknown) =>
    owner.evaluate(`(${act.toString()})(globalThis.graeaeFakeMedia)`) as Promise<unknown>;
  return { owner, route, media };
}

const sentOf = (route: Awaited<ReturnType<typeof routed>>, type: string) =>
  route.sent.filter((message) => message.request?.type === type);

test("a watch refused as blocked replaces the receiving connection, keeping what it carries, and shows on the first click", async ({
  browser,
  baseURL,
}) => {
  const { owner, route, media } = await ownerAndSharer(browser, baseURL, "Xavi");
  const here = owner.getByRole("region", { name: "Here" });
  const stage = owner.getByRole("main", { name: "Stage" });
  await here.getByRole("button", { name: "Watch Xavi's screen" }).click();
  await expect(stage.getByRole("img", { name: "Xavi's screen, with no picture" })).toBeVisible();

  route.blocking = true;
  await here.getByRole("button", { name: "Watch Xavi's webcam" }).click();

  await expect(stage.getByRole("img", { name: "Xavi's webcam, with no picture" })).toBeVisible();
  await expect(stage.getByRole("img", { name: "Xavi's screen, with no picture" })).toBeVisible();
  expect(sentOf(route, "replace")).toHaveLength(1);
  expect(sentOf(route, "watch")).toHaveLength(3);
  expect(route.heard.map((message) => message.change?.type)).toContain("replaced");
  expect(await media((control) => control.connections.receiving)).toBe(2);
});

