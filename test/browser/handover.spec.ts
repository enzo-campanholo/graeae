import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer, DeviceInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { inBar, SETUP_SECRET } from "./app.ts";

// Hand-over: a member with a share live on one device starts the same kind on another,
// is offered to stop it there and share from here, and the owner watching it is carried
// over. The media on every side is fake, so this covers what each member sees, not
// pictures. Journeys share one instance; these name their members Vera and Elio.

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

test("a share moves to another device on an offer, carrying its viewer, and the first device says why it stopped", async ({
  browser,
  baseURL,
}) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Vera" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;

  // Vera's laptop shares her webcam, and the owner watches it.
  const laptopContext = await newBrowser(browser, baseURL);
  const laptop = await laptopContext.newPage();
  await laptop.goto(`/invite/${invite.code}`);
  await laptop.getByRole("button", { name: "Join as Vera" }).click();
  await expect(laptop).toHaveURL(room);
  await inBar(laptop).getByRole("button", { name: "Share webcam" }).click();
  await expect(laptop.getByText("No one watching")).toBeVisible();
  const stage = owner.getByRole("main", { name: "Stage" });
  const bar = owner.getByRole("region", { name: "Here" });
  await bar.getByRole("button", { name: "Watch Vera's webcam" }).click();
  const picture = stage.getByRole("img", { name: "Vera's webcam, with no picture" });
  await expect(picture).toBeVisible();
  await expect(laptop.getByText("Owner watching")).toBeVisible();

  // Her phone, another of her devices, opens the room.
  const added = await laptopContext.request.post("/api/me/devices");
  const { invite: deviceInvite } = (await added.json()) as DeviceInviteAnswer;
  const phoneContext = await newBrowser(browser, baseURL);
  const phone = await phoneContext.newPage();
  await phone.goto(`/invite/${deviceInvite.code}`);
  await phone.getByRole("button", { name: "Join as Vera" }).click();
  await expect(phone).toHaveURL(room);

  // "Share webcam" there offers to stop it on the laptop and share from here. Cancel leaves it be.
  const offer = phone.getByRole("dialog", { name: "Your webcam is already live" });
  await inBar(phone).getByRole("button", { name: "Share webcam" }).click();
  await expect(offer).toContainText("It's live from another tab or device. Stop it there and share from here?");

  if (process.env.GRAEAE_SCREENSHOTS) {
    for (const colorScheme of ["dark", "light"] as const) {
      // The app is dark unless "You" says otherwise, whatever the system prefers.
      await phone.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
      await phone.waitForTimeout(400); // the panel arrives, and colours settle, before the picture is taken
      await phone.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/hand-over-offer-${colorScheme}.png` });
    }
    await phone.evaluate(`document.documentElement.classList.toggle("dark", true)`);
  }
  await offer.getByRole("button", { name: "Cancel" }).click();
  await expect(offer).toHaveCount(0);
  await expect(laptop.getByText("Owner watching")).toBeVisible();

  // Going on moves it: the phone sends it, the owner still watches, and the laptop says why it stopped.
  await inBar(phone).getByRole("button", { name: "Share webcam" }).click();
  await expect(offer.getByRole("button", { name: "Share from here" })).toBeFocused();
  await phone.keyboard.press("Enter");
  await expect(inBar(phone).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(phone.getByText("Owner watching")).toBeVisible();
  await expect(laptop.getByText("Now sharing from your other device.")).toBeVisible();
  await expect(laptop.getByRole("button", { name: "Stop sharing your webcam" })).toHaveCount(0);
  await expect(inBar(laptop).getByRole("button", { name: "Share webcam" })).toBeEnabled();

  if (process.env.GRAEAE_SCREENSHOTS) {
    for (const colorScheme of ["dark", "light"] as const) {
      // The app is dark unless "You" says otherwise, whatever the system prefers.
      await laptop.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
      await laptop.waitForTimeout(400); // colours settle before the picture is taken
      await laptop.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/handed-over-${colorScheme}.png` });
    }
    await laptop.evaluate(`document.documentElement.classList.toggle("dark", true)`);
  }
  await expect(picture).toBeVisible();
  await expect(bar.getByRole("button", { name: "Stop watching Vera's webcam" })).toHaveAttribute("aria-pressed", "true");

  // A screen share hands over the same way, with the first-time notice on the way to the picker.
  await inBar(laptop).getByRole("button", { name: "Share screen" }).click();
  await laptop.getByRole("button", { name: "Choose what to share" }).click();
  await expect(inBar(laptop).getByRole("button", { name: "Screen live" })).toBeDisabled();
  await inBar(phone).getByRole("button", { name: "Share screen" }).click();
  await phone.getByRole("dialog", { name: "Your screen is already live" }).getByRole("button", { name: "Share from here" }).click();
  await phone.getByRole("button", { name: "Choose what to share" }).click();
  await expect(inBar(phone).getByRole("button", { name: "Screen live" })).toBeDisabled();
  await expect(inBar(laptop).getByRole("button", { name: "Share screen" })).toBeEnabled();

  // The note goes when dismissed.
  await laptop.getByRole("button", { name: "Dismiss" }).click();
  await expect(laptop.getByText("Now sharing from your other device.")).toHaveCount(0);
});

/**
 * Routes `page`'s sockets through the test, which records what goes each way. While
 * `holding` names a request type, the next request of that type waits until `release`.
 */
async function routed(page: Page) {
  type Message = { type: string; request?: { type: string }; change?: { type: string } };
  const route = { sent: [] as Message[], heard: [] as Message[], holding: null as string | null, release: () => {} };
  await page.routeWebSocket(/\/api\/socket/, (socket) => {
    const instance = socket.connectToServer();
    socket.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as Message;
      route.sent.push(parsed);
      if (route.holding !== null && parsed.request?.type === route.holding) {
        route.holding = null;
        route.release = () => instance.send(message);
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

test("a watcher whose receiving connection is replaced as the share it watches is handed over ends up watching the new share", async ({
  browser,
  baseURL,
}) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  const route = await routed(owner);
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Elio" } });
  const { invite } = (await made.json()) as CreateInviteAnswer;

  // Elio's laptop shares his webcam, the owner watches it, and his phone opens the room.
  const laptopContext = await newBrowser(browser, baseURL);
  const laptop = await laptopContext.newPage();
  await laptop.goto(`/invite/${invite.code}`);
  await laptop.getByRole("button", { name: "Join as Elio" }).click();
  await expect(laptop).toHaveURL(room);
  await inBar(laptop).getByRole("button", { name: "Share webcam" }).click();
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Elio's webcam" }).click();
  const picture = owner.getByRole("main", { name: "Stage" }).getByRole("img", { name: "Elio's webcam, with no picture" });
  await expect(picture).toBeVisible();
  const added = await laptopContext.request.post("/api/me/devices");
  const { invite: deviceInvite } = (await added.json()) as DeviceInviteAnswer;
  const phone = await (await newBrowser(browser, baseURL)).newPage();
  await phone.goto(`/invite/${deviceInvite.code}`);
  await phone.getByRole("button", { name: "Join as Elio" }).click();
  await expect(phone).toHaveURL(room);

  // The owner's browser gives up on its receiving connection, and its ask for a new one
  // is slow to arrive: the hand-over's offer for the old connection reaches the tab first.
  route.holding = "replace";
  const media = (act: (control: FakeMediaControl) => unknown) =>
    owner.evaluate(`(${act.toString()})(globalThis.graeaeFakeMedia)`) as Promise<unknown>;
  await media((control) => control.fail("receiving"));
  await expect.poll(() => route.holding).toBeNull();
  await inBar(phone).getByRole("button", { name: "Share webcam" }).click();
  await phone.getByRole("dialog", { name: "Your webcam is already live" }).getByRole("button", { name: "Share from here" }).click();
  await expect(laptop.getByText("Now sharing from your other device.")).toBeVisible();
  const heard = (type: string) => route.heard.filter((message) => message.type === "media" && message.change?.type === type);
  await expect.poll(() => heard("moved")).toHaveLength(1);
  const answered = () => route.sent.filter((message) => message.request?.type === "answer").length;
  const [answersBefore, pullsBefore] = [answered(), heard("pulled").length];
  route.release();

  // The replacement pulls the new share onto the new connection as one of its steps, and
  // the old connection's offer is left be: the tab answers each step and nothing else.
  await expect.poll(() => heard("replaced")).toHaveLength(1);
  await expect.poll(() => media((control) => control.replacements)).toBe(1);
  await owner.waitForTimeout(1_000);
  expect(heard("pulled").length - pullsBefore).toBe(1);
  expect(answered() - answersBefore).toBe(1);
  await expect(picture).toBeVisible();
  await expect(owner.getByRole("main", { name: "Stage" }).getByText("Reconnecting…")).toHaveCount(0);
  await expect(phone.getByText("Owner watching")).toBeVisible();
});
