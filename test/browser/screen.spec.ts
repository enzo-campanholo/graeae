import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl, FakePick } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// Screen shares. The media on every side is fake: the page's media client captures
// nothing, and a journey tells it what the browser's picker returns and which browser
// family it is, through `window.graeaeFakeMedia`. So these cover what each member sees,
// not pictures or sound. Journeys share one instance; these name their members Mia, Oli
// and Pia, whom no other journey uses.

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

  async function join(name: string, family: FakeMediaControl["browser"] = "chromium"): Promise<Page> {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    expect(made.status(), "the invite was refused").toBe(200);
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const context = await newBrowser(browser, baseURL);
    // The browser family is fixed before the page's own scripts run.
    await context.addInitScript((browser) => {
      (globalThis as { graeaeFakeMedia?: Partial<FakeMediaControl> }).graeaeFakeMedia = { browser };
    }, family);
    const page = await context.newPage();
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await expect(page).toHaveURL(room);
    await expect(page.getByRole("link", { name: `${name} · you` })).toBeVisible();
    return page;
  }

  return { owner, join };
}

/** What the browser's picker will return on `page`'s next screen share. */
async function picks(page: Page, pick: FakePick) {
  await page.evaluate((pick) => {
    (globalThis as unknown as Fake).graeaeFakeMedia.picker = pick;
  }, pick);
}

/** The browser's own "stop sharing" bar, or the shared tab or window closing. */
async function browserEndsScreen(page: Page) {
  await page.evaluate(() => (globalThis as unknown as Fake).graeaeFakeMedia.endScreen());
}

async function asked(page: Page) {
  return page.evaluate(() => (globalThis as unknown as Fake).graeaeFakeMedia.asked);
}

test("a screen share goes straight to the picker after a notice shown once, carries its sound, and ends every way", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const mia = await join("Mia");
  const here = owner.getByRole("region", { name: "Here" });
  const stage = owner.getByRole("main", { name: "Stage" });
  const miasScreen = here.getByRole("button", { name: "Watch Mia's screen" });
  const shareScreen = mia.getByRole("button", { name: "Share screen" });
  const notice = mia.getByRole("dialog", { name: "Before you pick" });

  // The first time on this device, a short notice comes first: click 1 of 4.
  await shareScreen.click();
  await expect(notice).toContainText("A tab or a game's window sends its sound. A whole screen is video only.");
  await expect(notice).not.toContainText("borderless");
  expect(await asked(mia), "the picker opened before the notice was read").toEqual([]);
  // Then the browser's picker, where the member picks a tab and presses Share: 2 more clicks.
  await notice.getByRole("button", { name: "Choose what to share" }).click();
  await expect(notice).toHaveCount(0);
  await expect(mia.getByRole("img", { name: "Your screen, with no picture" })).toBeVisible();
  await expect(mia.getByRole("button", { name: "Screen live" })).toBeDisabled();
  await expect(miasScreen).toBeVisible();
  // graeae asked for the picker's audio checkbox ticked, and for no toggle of its own.
  expect(await asked(mia)).toMatchObject([{ audioSelection: "preferred", systemAudio: "exclude" }]);

  // The sharer's own audio control.
  const audioOff = mia.getByRole("button", { name: "Turn your screen audio off" });
  await audioOff.click();
  await expect(mia.getByRole("button", { name: "Turn your screen audio on" })).toBeVisible();
  expect(await mia.evaluate(() => (globalThis as unknown as Fake).graeaeFakeMedia.screenAudio)).toBe(false);
  await mia.getByRole("button", { name: "Turn your screen audio on" }).click();
  await expect(audioOff).toBeVisible();
  expect(await mia.evaluate(() => (globalThis as unknown as Fake).graeaeFakeMedia.screenAudio)).toBe(true);

  // A name watches the screen and the webcam together. A share with sound says nothing of it.
  await mia.getByRole("button", { name: "Share webcam" }).click();
  await here.getByRole("button", { name: "Mia", exact: true }).click();
  await expect(stage.getByRole("img", { name: "Mia's screen, with no picture" })).toBeVisible();
  await expect(stage.getByRole("img", { name: "Mia's webcam, with no picture" })).toBeVisible();
  await expect(stage.getByText("video only")).toHaveCount(0);
  await expect(mia.getByText("Owner watching")).toHaveCount(2);

  // Stop ends it for everyone.
  await mia.getByRole("button", { name: "Stop your screen" }).click();
  await expect(miasScreen).toHaveCount(0);
  await expect(stage.getByRole("img", { name: "Mia's screen, with no picture" })).toHaveCount(0);

  // Afterwards, straight to the picker: no notice.
  await shareScreen.click();
  await expect(mia.getByRole("img", { name: "Your screen, with no picture" })).toBeVisible();
  await expect(notice).toHaveCount(0);
  // Following Mia, the owner gets the new screen by itself.
  await expect(stage.getByRole("img", { name: "Mia's screen, with no picture" })).toBeVisible();

  // The browser's own "stop sharing" bar ends it too, as does closing the shared tab.
  await browserEndsScreen(mia);
  await expect(mia.getByRole("img", { name: "Your screen, with no picture" })).toHaveCount(0);
  await expect(stage.getByRole("img", { name: "Mia's screen, with no picture" })).toHaveCount(0);
  await expect(shareScreen).toBeEnabled();

  // Closing the picker without picking shares nothing and says nothing.
  await picks(mia, "cancel");
  await shareScreen.click();
  await expect(shareScreen).toBeEnabled();
  await expect(mia.getByText("didn't start")).toHaveCount(0);
  await expect(miasScreen).toHaveCount(0);

  // A whole screen is video only: one line tells the sharer, and viewers see "video only".
  await picks(mia, { surface: "screen", audio: false });
  await shareScreen.click();
  await expect(mia.getByText("Video only. No one hears this share.")).toBeVisible();
  await expect(mia.getByRole("button", { name: "Turn your screen audio off" })).toHaveCount(0);
  await expect(stage.getByRole("img", { name: "Mia's screen, with no picture" })).toBeVisible();
  await expect(stage.getByText("video only")).toBeVisible();

  // One screen share per member: another tab of Mia's cannot start a second.
  const second = await mia.context().newPage();
  await second.goto(owner.url());
  await expect(second.getByRole("button", { name: "Screen live" })).toBeDisabled();
  await second.close();

  // Leaving ends it.
  await mia.close();
  await expect(miasScreen).toHaveCount(0);
  await expect(stage.getByRole("img", { name: "Mia's screen, with no picture" })).toHaveCount(0);
});

test("on Firefox the notice says a screen share is video only, and the collapsed rail still shares a screen", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const oli = await join("Oli", "firefox");
  const here = owner.getByRole("region", { name: "Here" });

  await oli.getByRole("button", { name: "Hide the bar" }).click();
  const rail = oli.getByRole("complementary", { name: "People" });
  await rail.getByRole("button", { name: "Share screen" }).click();
  const notice = oli.getByRole("dialog", { name: "Before you pick" });
  await expect(notice).toContainText(
    "In Firefox a screen share is video only, and it may be less smooth. A Chromium browser such as Chrome does better.",
  );
  await expect(notice).not.toContainText("A tab or a game's window sends its sound");
  await notice.getByRole("button", { name: "Choose what to share" }).click();

  // Firefox is asked for no audio, so even a window comes back video only.
  await expect(here.getByRole("button", { name: "Watch Oli's screen" })).toBeVisible();
  expect(await asked(oli)).toMatchObject([{ audio: false }]);
  await oli.getByRole("button", { name: "Show the bar" }).click();
  await expect(oli.getByText("Video only. No one hears this share.")).toBeVisible();
  await expect(oli.getByRole("button", { name: "Screen live" })).toBeDisabled();
});
