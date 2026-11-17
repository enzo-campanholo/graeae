import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// The quality a viewer watches a screen share at: "Auto", "1080p" or "720p" on a share
// that goes out at two qualities, and a "720p" mark on one received at the lower one.
// The media is fake: a journey says which browser family a member's page runs in,
// whether its Chromium screen share goes out at two qualities (one today, ticket 17), and
// which quality the shares a page watches arrive at, through `window.graeaeFakeMedia`.
// Journeys share one instance; these name their members Kai, Lou and Noor, whom no other
// journey uses.

/** The page's global, as a journey reads it inside `page.evaluate`. */
type Fake = { graeaeFakeMedia: FakeMediaControl };

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

/** The owner in the first room, and a way to bring members into it on a browser family. */
async function ownerInRoom(browser: Browser, baseURL: string | undefined) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();

  async function join(
    name: string,
    family: FakeMediaControl["browser"] = "chromium",
    { twoQualities = false } = {},
  ): Promise<Page> {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    expect(made.status(), "the invite was refused").toBe(200);
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const context = await newBrowser(browser, baseURL);
    // The browser family and the qualities are fixed before the page's own scripts run.
    await context.addInitScript(
      ({ browser, twoQualities }) => {
        (globalThis as { graeaeFakeMedia?: Partial<FakeMediaControl> }).graeaeFakeMedia = { browser, twoQualities };
      },
      { browser: family, twoQualities },
    );
    const page = await context.newPage();
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await expect(page).toHaveURL(room);
    await expect(page.getByRole("link", { name: `${name} · you` })).toBeVisible();
    return page;
  }

  return { owner, join };
}

/** Shares `page`'s screen, through the first-time notice. */
async function shareScreen(page: Page) {
  await page.getByRole("button", { name: "Share screen" }).click();
  await page.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(page.getByRole("button", { name: "Screen live" })).toBeDisabled();
}

/** Every share `page` watches arrives at `quality` from now on. */
async function receive(page: Page, quality: "1080p" | "720p") {
  await page.evaluate((quality) => (globalThis as unknown as Fake).graeaeFakeMedia.receive(quality), quality);
}

test("a viewer chooses the quality of a Chromium screen share sent at two qualities, and sees a 720p mark while it arrives at 720p", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const kai = await join("Kai", "chromium", { twoQualities: true });
  const here = owner.getByRole("region", { name: "Here" });
  const stage = owner.getByRole("main", { name: "Stage" });
  await shareScreen(kai);
  await kai.getByRole("button", { name: "Share webcam" }).click();

  await here.getByRole("button", { name: "Kai", exact: true }).click();
  await expect(stage.getByRole("img", { name: "Kai's screen, with no picture" })).toBeVisible();
  await expect(stage.getByRole("img", { name: "Kai's webcam, with no picture" })).toBeVisible();

  // The screen share has the choice, at Auto; the webcam has one quality and no choice.
  const quality = stage.getByRole("radiogroup", { name: "Quality of Kai's screen" });
  await expect(quality.getByRole("radio", { name: "Auto" })).toBeChecked();
  await expect(quality.getByRole("radio")).toHaveText(["Auto", "1080p", "720p"]);
  await expect(stage.getByRole("radiogroup")).toHaveCount(1);
  await expect(stage.getByText("Received at 720p")).toHaveCount(0);

  // Under Auto, the media server steps this viewer down on a weak link: the mark says so,
  // on the screen share alone.
  await receive(owner, "720p");
  await expect(stage.getByText("Received at 720p")).toHaveCount(1);
  await expect(stage.getByRole("figure").filter({ hasText: "screen" })).toContainText("720p");

  // Choosing 1080p goes through the instance and stays chosen.
  await quality.getByRole("radio", { name: "1080p" }).click();
  await expect(quality.getByRole("radio", { name: "1080p" })).toBeChecked();
  await receive(owner, "1080p");
  await expect(stage.getByText("Received at 720p")).toHaveCount(0);

  // 720p, by the keyboard: the choice is one stop in the tab order, moved with the arrows.
  await quality.getByRole("radio", { name: "1080p" }).focus();
  await owner.keyboard.press("ArrowRight");
  await expect(quality.getByRole("radio", { name: "720p" })).toBeChecked();
  await expect(quality.getByRole("radio", { name: "720p" })).toBeFocused();
  await receive(owner, "720p");
  await expect(stage.getByText("Received at 720p")).toHaveCount(1);

  // Watched again, it starts at Auto.
  await stage.getByRole("button", { name: "Stop watching Kai's screen" }).click();
  await expect(stage.getByRole("img", { name: "Kai's screen, with no picture" })).toHaveCount(0);
  await here.getByRole("button", { name: "Watch Kai's screen" }).click();
  await expect(quality.getByRole("radio", { name: "Auto" })).toBeChecked();
});

test("a Firefox screen share has one quality: no choice and no mark", async ({ browser, baseURL }) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const lou = await join("Lou", "firefox");
  const stage = owner.getByRole("main", { name: "Stage" });
  await shareScreen(lou);

  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Lou", exact: true }).click();
  await expect(stage.getByRole("img", { name: "Lou's screen, with no picture" })).toBeVisible();
  await receive(owner, "720p");

  await expect(stage.getByRole("radiogroup")).toHaveCount(0);
  await expect(stage.getByText("Received at 720p")).toHaveCount(0);
});

test("a Chromium screen share sent at one quality, as today, has no choice and no mark", async ({ browser, baseURL }) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const noor = await join("Noor");
  const stage = owner.getByRole("main", { name: "Stage" });
  await shareScreen(noor);

  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Noor", exact: true }).click();
  await expect(stage.getByRole("img", { name: "Noor's screen, with no picture" })).toBeVisible();
  await receive(owner, "720p");

  await expect(stage.getByRole("radiogroup")).toHaveCount(0);
  await expect(stage.getByText("Received at 720p")).toHaveCount(0);
});
