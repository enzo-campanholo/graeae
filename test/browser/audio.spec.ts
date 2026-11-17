import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl, FakePick } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// A viewer's audio controls: every watched share with screen audio plays at once, each
// with its own mute and volume and a "hear only this one", in the watched share's pill of
// controls. The volume set for a member is kept on the device; mute is not. The media is
// fake, so there is no sound to hear: the journeys read the controls, which say what each
// share is played at. Journeys share one instance; these name their members Dani, Eli and
// Fabi, whom no other journey uses.

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

/** The owner in the first room, and a way to bring members into it. */
async function ownerInRoom(browser: Browser, baseURL: string | undefined) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();

  async function join(name: string): Promise<Page> {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    expect(made.status(), "the invite was refused").toBe(200);
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const page = await (await newBrowser(browser, baseURL)).newPage();
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await expect(page).toHaveURL(room);
    await expect(page.getByRole("link", { name: `${name} · you` })).toBeVisible();
    return page;
  }

  return { owner, join };
}

/** Shares `page`'s screen, picking `pick` in the browser's picker. */
async function shareScreen(page: Page, pick: FakePick = { surface: "tab", audio: true }) {
  await page.evaluate((pick) => {
    (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.picker = pick;
  }, pick);
  await page.getByRole("button", { name: "Share screen" }).click();
  await page.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(page.getByRole("button", { name: "Screen live" })).toBeDisabled();
}

/** The tile of `share` ("Dani's screen") on the stage. */
function tile(stage: Locator, share: string): Locator {
  return stage.getByRole("figure").filter({ has: stage.page().getByRole("img", { name: `${share}, with no picture` }) });
}

test("a viewer hears every watched share with sound at once, and sets each one's volume, mutes it, or hears only one", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const [dani, eli, fabi] = [await join("Dani"), await join("Eli"), await join("Fabi")];
  await shareScreen(dani);
  await shareScreen(eli);
  await shareScreen(fabi, { surface: "screen", audio: false });
  await fabi.getByRole("button", { name: "Share webcam" }).click();
  const stage = owner.getByRole("main", { name: "Stage" });

  await owner.getByRole("button", { name: "Everything", exact: true }).click();
  await expect(stage.getByRole("figure")).toHaveCount(4);

  // Both shares with sound play at once, at full volume, neither turned down for the other.
  for (const share of ["Dani's screen", "Eli's screen"]) {
    await expect(stage.getByRole("button", { name: `Mute ${share}` })).toBeVisible();
    await expect(stage.getByRole("slider", { name: `Volume of ${share}` })).toHaveValue("100");
    await expect(stage.getByRole("button", { name: `Hear only ${share}` })).toBeVisible();
  }

  // A share with no sound says "video only" and has no audio controls; nor has a webcam.
  await expect(tile(stage, "Fabi's screen")).toContainText("video only");
  await expect(stage.getByRole("slider")).toHaveCount(2);
  await expect(stage.getByRole("button", { name: /^(Mute|Unmute|Hear only) Fabi's/ })).toHaveCount(0);
  await expect(tile(stage, "Fabi's webcam")).not.toContainText("video only");

  // Each share's volume is its own.
  const daniVolume = stage.getByRole("slider", { name: "Volume of Dani's screen" });
  await daniVolume.fill("40");
  await expect(daniVolume).toHaveValue("40");
  await expect(stage.getByRole("slider", { name: "Volume of Eli's screen" })).toHaveValue("100");

  // Mute and unmute one; the other plays on.
  await stage.getByRole("button", { name: "Mute Eli's screen" }).click();
  await expect(stage.getByRole("button", { name: "Unmute Eli's screen" })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();
  // A muted share says so beneath it, so its silence is never a mystery.
  await expect(tile(stage, "Eli's screen")).toContainText("screen · muted");
  await expect(tile(stage, "Dani's screen")).not.toContainText("muted");
  await stage.getByRole("button", { name: "Unmute Eli's screen" }).click();
  await expect(stage.getByRole("button", { name: "Mute Eli's screen" })).toBeVisible();
  await expect(tile(stage, "Eli's screen")).not.toContainText("muted");

  // Hear only Dani: Eli is muted. Pressed again, every share is heard again.
  await stage.getByRole("button", { name: "Hear only Dani's screen" }).click();
  await expect(stage.getByRole("button", { name: "Unmute Eli's screen" })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();
  await stage.getByRole("button", { name: "Hear every share again" }).click();
  await expect(stage.getByRole("button", { name: "Mute Eli's screen" })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();

  // Hearing only Eli unmutes Eli and mutes Dani; turning Dani's volume brings Dani back.
  await stage.getByRole("button", { name: "Mute Eli's screen" }).click();
  await stage.getByRole("button", { name: "Hear only Eli's screen" }).click();
  await expect(stage.getByRole("button", { name: "Mute Eli's screen" })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Unmute Dani's screen" })).toBeVisible();
  await daniVolume.fill("60");
  await expect(stage.getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();

  // In the strip beneath a focused share, a share with sound keeps its mute.
  await stage.getByRole("button", { name: "Focus Fabi's webcam" }).click();
  await expect(stage.getByRole("list", { name: "Other shares" }).getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();
  await stage.getByRole("list", { name: "Other shares" }).getByRole("button", { name: "Mute Dani's screen" }).click();
  await expect(stage.getByRole("button", { name: "Unmute Dani's screen" })).toBeVisible();
  if (process.env.GRAEAE_SCREENSHOTS) {
    await stage.getByRole("button", { name: "Unmute Dani's screen" }).hover();
    await owner.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/audio-strip.png` });
  }
  await stage.getByRole("button", { name: "Back to the grid" }).click();

  // With one share with sound left, "hear only" has nothing to choose between.
  await stage.getByRole("button", { name: "Stop watching Eli's screen" }).click();
  await expect(stage.getByRole("figure")).toHaveCount(3);
  await expect(stage.getByRole("button", { name: /^Hear only/ })).toHaveCount(0);
  await expect(stage.getByRole("slider", { name: "Volume of Dani's screen" })).toBeVisible();

  // Mute belongs to this watch: a share watched again plays, at the member's volume.
  await stage.getByRole("button", { name: "Stop watching Dani's screen" }).click();
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Dani's screen" }).click();
  await expect(stage.getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();
  await expect(stage.getByRole("slider", { name: "Volume of Dani's screen" })).toHaveValue("60");

  if (process.env.GRAEAE_SCREENSHOTS) {
    await stage.getByRole("button", { name: "Mute Dani's screen" }).hover();
    for (const colorScheme of ["dark", "light"] as const) {
      await owner.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
      await owner.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/audio-${colorScheme}.png` });
    }
    await owner.getByRole("button", { name: "Everything", exact: true }).click();
    await stage.getByRole("slider", { name: "Volume of Eli's screen" }).hover();
    await owner.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/audio-two.png` });
  }
});

test("the volume a viewer sets for a member is kept on the device across a reload; mute is not", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const dani = await join("Dani");
  await shareScreen(dani);
  const stage = owner.getByRole("main", { name: "Stage" });
  const here = owner.getByRole("region", { name: "Here" });

  await here.getByRole("button", { name: "Dani", exact: true }).click();
  await stage.getByRole("slider", { name: "Volume of Dani's screen" }).fill("25");
  await stage.getByRole("button", { name: "Mute Dani's screen" }).click();
  await expect(stage.getByRole("button", { name: "Unmute Dani's screen" })).toBeVisible();

  await owner.reload();
  await here.getByRole("button", { name: "Dani", exact: true }).click();
  await expect(stage.getByRole("slider", { name: "Volume of Dani's screen" })).toHaveValue("25");
  await expect(stage.getByRole("button", { name: "Mute Dani's screen" })).toBeVisible();});
