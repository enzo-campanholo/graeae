import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// Media through dropped connections. A member's socket is routed through the test, which
// can hold its opening or stop passing anything either way, as on a dropped network. The
// media on both sides is fake. Members Kim and Lou are this file's alone.

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
  void ({} as FakeMediaControl);
});
