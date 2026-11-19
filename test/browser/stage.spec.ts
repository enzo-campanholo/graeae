import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { inBar, SETUP_SECRET } from "./app.ts";

// Watching from the bar, and how the stage lays out what is watched. The media on every
// side is fake, so these cover what the owner sees, not pictures. Journeys share one
// instance; these name their members Rui, Sol, Tom, Ugo, Vera, Wil, Xia, Yan, Zoe, Lia,
// Noa, Cleo and Davi, whom no other journey uses. Every share here is a webcam, but for
// Tom's screen in the shortcuts journey, which tells "Watch every webcam" from "Watch
// everything".

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  // Pages first, so each member leaves cleanly and their shares end before the next
  // journey: a closed browser would leave them reconnecting, still sharing.
  await Promise.all(opened.flatMap((context) => context.pages().map((page) => page.close())));
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

/** The owner in the first room, and a way to bring members into it. */
async function ownerInRoom(browser: Browser, baseURL: string | undefined, viewport?: { width: number; height: number }) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  if (viewport) await owner.setViewportSize(viewport);
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();

  /** A member joins from their own browser and shares their webcam, unless told not to. */
  async function join(name: string, { share = true } = {}): Promise<Page> {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    expect(made.status(), "the invite was refused").toBe(200);
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const context = await newBrowser(browser, baseURL);
    const page = await context.newPage();
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await expect(page).toHaveURL(room);
    // The room has arrived over its socket once the bar lists them; a share asked for
    // before that is lost (see the ticket's comments).
    await expect(page.getByRole("link", { name: `${name} · you` })).toBeVisible();
    if (share) await shareWebcam(page);
    return page;
  }

  return { owner, join };
}

async function shareWebcam(page: Page) {
  await inBar(page).getByRole("button", { name: "Share webcam" }).click();
  await expect(page.getByRole("button", { name: "Stop your webcam" })).toBeVisible();
}

/** Shares a screen, through the first-time notice, on the fake picker's default: a tab with its sound. */
async function shareScreen(page: Page) {
  await inBar(page).getByRole("button", { name: "Share screen" }).click();
  await page.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(page.getByRole("button", { name: "Stop your screen" })).toBeVisible();
}

async function stopWebcam(page: Page) {
  await page.getByRole("button", { name: "Stop your webcam" }).click();
  await expect(inBar(page).getByRole("button", { name: "Share webcam" })).toBeEnabled();
}

test("a name watches everything that member shares, and keeps following them until the viewer picks otherwise", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const rui = await join("Rui");
  const sol = await join("Sol");

  const stage = owner.getByRole("main", { name: "Stage" });
  const here = owner.getByRole("region", { name: "Here" });
  const ruis = stage.getByRole("img", { name: "Rui's webcam, with no picture" });
  const sols = stage.getByRole("img", { name: "Sol's webcam, with no picture" });
  await expect(here.getByRole("button", { name: "Watch Sol's webcam" })).toBeVisible();

  // A name replaces the stage with everything that member shares.
  await here.getByRole("button", { name: "Watch Sol's webcam" }).click();
  await expect(sols).toBeVisible();
  const ruiName = here.getByRole("button", { name: "Rui", exact: true });
  await ruiName.click();
  await expect(ruis).toBeVisible();
  await expect(sols).toHaveCount(0);
  await expect(ruiName).toHaveAttribute("aria-pressed", "true");

  // The same name again changes nothing, and never empties the stage.
  await ruiName.click();
  await expect(ruis).toBeVisible();
  await expect(ruiName).toHaveAttribute("aria-pressed", "true");

  // Following: a share Rui starts later joins the stage by itself.
  await stopWebcam(rui);
  await expect(ruis).toHaveCount(0);
  await expect(stage.getByText("Rui isn't sharing anything right now.")).toBeVisible();
  await shareWebcam(rui);
  await expect(ruis).toBeVisible();

  // Another name ends it: Rui's next share stays off the stage.
  const solName = here.getByRole("button", { name: "Sol", exact: true });
  await solName.click();
  await expect(sols).toBeVisible();
  await expect(ruis).toHaveCount(0);
  await expect(ruiName).toHaveAttribute("aria-pressed", "false");
  await stopWebcam(rui);
  await shareWebcam(rui);
  await expect(here.getByRole("button", { name: "Watch Rui's webcam" })).toBeVisible();
  await expect(ruis).toHaveCount(0);

  // A single icon ends it: the icon adds Rui beside Sol, and Sol's next share stays off.
  await here.getByRole("button", { name: "Watch Rui's webcam" }).click();
  await expect(ruis).toBeVisible();
  await expect(sols).toBeVisible();
  await expect(solName).toHaveAttribute("aria-pressed", "false");
  await stopWebcam(sol);
  await shareWebcam(sol);
  await expect(here.getByRole("button", { name: "Watch Sol's webcam" })).toBeVisible();
  await expect(sols).toHaveCount(0);

  // Stop watching ends it.
  await solName.click();
  await expect(sols).toBeVisible();
  await expect(ruis).toHaveCount(0);
  await sols.hover();
  await stage.getByRole("button", { name: "Stop watching Sol's webcam" }).click();
  await expect(sols).toHaveCount(0);
  await expect(solName).toHaveAttribute("aria-pressed", "false");
  await stopWebcam(sol);
  await shareWebcam(sol);
  await expect(here.getByRole("button", { name: "Watch Sol's webcam" })).toBeVisible();
  await expect(sols).toHaveCount(0);
});

test("the shortcuts and the empty stage's offer are one-off picks, and the rail still follows in one click", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const tom = await join("Tom");
  await shareScreen(tom);
  const ugo = await join("Ugo", { share: false });

  const stage = owner.getByRole("main", { name: "Stage" });
  const here = owner.getByRole("region", { name: "Here" });
  const toms = stage.getByRole("img", { name: "Tom's webcam, with no picture" });
  const tomsScreen = stage.getByRole("img", { name: "Tom's screen, with no picture" });
  const ugos = stage.getByRole("img", { name: "Ugo's webcam, with no picture" });
  const ugoName = here.getByRole("button", { name: "Ugo", exact: true });

  // The shortcuts sit in the "Here" heading. The one whose pick the stage holds is lit,
  // and none is while the stage holds something else.
  const shortcuts = here.getByRole("group", { name: "Watch" });
  const picks = ["Watch every webcam", "Watch everything", "Watch nothing"] as const;
  const lit = async (pick: (typeof picks)[number] | null) => {
    for (const each of picks)
      await expect(shortcuts.getByRole("button", { name: each })).toHaveAttribute("aria-pressed", String(each === pick));
  };
  await lit("Watch nothing");

  // On arrival the empty stage offers to watch everything, and it does.
  await stage.getByRole("button", { name: "Watch everything" }).click();
  await expect(toms).toBeVisible();
  await expect(tomsScreen).toBeVisible();
  await lit("Watch everything");
  // It follows nobody: a share started afterwards does not join by itself.
  await shareWebcam(ugo);
  await expect(here.getByRole("button", { name: "Watch Ugo's webcam" })).toBeVisible();
  await expect(ugos).toHaveCount(0);
  await lit(null);

  // "Nothing" empties the stage.
  await shortcuts.getByRole("button", { name: "Watch nothing" }).click();
  await expect(toms).toHaveCount(0);
  await expect(stage.getByText("You're not watching anything yet.")).toBeVisible();
  await lit("Watch nothing");

  // "Everything" watches every share, and "Webcams" every webcam and nothing else.
  await shortcuts.getByRole("button", { name: "Watch everything" }).click();
  await expect(toms).toBeVisible();
  await expect(tomsScreen).toBeVisible();
  await expect(ugos).toBeVisible();
  await lit("Watch everything");
  await shortcuts.getByRole("button", { name: "Watch nothing" }).click();
  await expect(ugos).toHaveCount(0);
  await expect(tomsScreen).toHaveCount(0);
  await shortcuts.getByRole("button", { name: "Watch every webcam" }).click();
  await expect(toms).toBeVisible();
  await expect(ugos).toBeVisible();
  await expect(tomsScreen).toHaveCount(0);
  await lit("Watch every webcam");

  // A shortcut ends following, and is one-off itself.
  await ugoName.click();
  await expect(toms).toHaveCount(0);
  await lit(null);
  // Following a member who shares nothing empties the stage, and lights no pick: the
  // stage follows a person, not "nothing".
  await stopWebcam(ugo);
  await expect(ugos).toHaveCount(0);
  await expect(stage.getByText("Ugo isn't sharing anything right now.")).toBeVisible();
  await lit(null);
  await shareWebcam(ugo);
  await expect(ugos).toBeVisible();
  await shortcuts.getByRole("button", { name: "Watch every webcam" }).click();
  await expect(toms).toBeVisible();
  await expect(ugoName).toHaveAttribute("aria-pressed", "false");
  await stopWebcam(ugo);
  await expect(ugos).toHaveCount(0);
  await shareWebcam(ugo);
  await expect(here.getByRole("button", { name: "Watch Ugo's webcam" })).toBeVisible();
  await expect(ugos).toHaveCount(0);
  await stopWebcam(tom);
  await shareWebcam(tom);
  await expect(here.getByRole("button", { name: "Watch Tom's webcam" })).toBeVisible();
  await expect(toms).toHaveCount(0);

  // The rail keeps the share buttons and follows a member in one click: Tom's screen and webcam.
  await owner.getByRole("button", { name: "Hide the bar" }).click();
  const rail = owner.getByRole("complementary", { name: "People" });
  await expect(rail.getByRole("button", { name: "Share screen" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Share webcam" })).toBeVisible();
  const followTom = rail.getByRole("button", { name: "Follow Tom" });
  await followTom.click();
  await expect(toms).toBeVisible();
  await expect(tomsScreen).toBeVisible();
  await expect(ugos).toHaveCount(0);
  await expect(followTom).toHaveAttribute("aria-pressed", "true");
  await owner.getByRole("button", { name: "Show the bar" }).click();
  await expect(here.getByRole("button", { name: "Tom", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("watched shares fill an even grid, one can be focused over a strip of the rest, and any can go fullscreen", async ({
  browser,
  baseURL,
}) => {
  // Seven members join and share before anything is watched, which takes a while.
  test.setTimeout(120_000);
  // A maximised browser on a 1080p monitor.
  const { owner, join } = await ownerInRoom(browser, baseURL, { width: 1920, height: 953 });
  const names = ["Vera", "Wil", "Xia", "Yan", "Zoe", "Lia", "Noa"];
  for (const name of names) await join(name);

  const stage = owner.getByRole("main", { name: "Stage" });
  const here = owner.getByRole("region", { name: "Here" });
  const picture = (name: string) => stage.getByRole("img", { name: `${name}'s webcam, with no picture` });
  const watch = async (...who: string[]) => {
    for (const name of who) await here.getByRole("button", { name: `Watch ${name}'s webcam` }).click();
    for (const name of who) await expect(picture(name)).toBeVisible();
  };

  /** How many shares sit side by side in the stage's top row. */
  async function columns(): Promise<number> {
    const boxes = await Promise.all((await stage.getByRole("figure").all()).map((tile) => tile.boundingBox()));
    const top = Math.min(...boxes.map((box) => box!.y));
    return boxes.filter((box) => Math.abs(box!.y - top) < 2).length;
  }

  // One share: one column, as large as the stage's height allows, and not limited by the bar.
  await watch("Vera");
  expect(await columns()).toBe(1);
  await settled(owner);
  const area = (await stage.boundingBox())!;
  const one = (await picture("Vera").boundingBox())!;
  // The caption under each picture is part of the scale (`--caption` in app.css).
  const caption = Number.parseFloat(
    await owner.evaluate<string>(`getComputedStyle(document.documentElement).getPropertyValue("--caption")`),
  );
  expect(caption, "the scale sets a caption height").toBeGreaterThan(0);
  expect(one.width, "the share is limited by the stage's width").toBeLessThan(area.width - 24 - 4);
  expect(one.height, "the share does not fill the stage's height").toBeGreaterThan(area.height - 24 - caption - 4);

  // Two columns up to four shares, three up to six, four beyond.
  await watch("Wil", "Xia");
  await expect.poll(columns).toBe(2);
  await watch("Yan", "Zoe");
  await expect.poll(columns).toBe(3);
  await watch("Lia", "Noa");
  await expect.poll(columns).toBe(4);
  await owner.getByRole("group", { name: "Watch" }).getByRole("button", { name: "Watch nothing" }).click();
  await expect(stage.getByRole("figure")).toHaveCount(0);

  // Focus makes one share large, with the others in a strip beneath it.
  await watch("Vera", "Wil", "Xia");
  await picture("Vera").hover();
  await stage.getByRole("button", { name: "Focus Vera's webcam" }).click();
  const strip = stage.getByRole("list", { name: "Other shares" });
  await expect(strip.getByRole("button", { name: "Focus Wil's webcam" })).toBeVisible();
  await expect(strip.getByRole("button", { name: "Focus Xia's webcam" })).toBeVisible();
  await expect(strip.getByRole("button", { name: "Focus Vera's webcam" })).toHaveCount(0);
  await settled(owner);
  const focused = (await picture("Vera").boundingBox())!;
  const small = (await picture("Wil").boundingBox())!;
  expect(focused.height).toBeGreaterThan(small.height * 3);
  expect(small.y).toBeGreaterThan(focused.y + focused.height);

  // A share in the strip is focused in one click, and the focused one goes back to the grid.
  await strip.getByRole("button", { name: "Focus Wil's webcam" }).click();
  await expect(strip.getByRole("button", { name: "Focus Vera's webcam" })).toBeVisible();
  await expect(strip.getByRole("button", { name: "Focus Wil's webcam" })).toHaveCount(0);
  await picture("Wil").hover();
  await stage.getByRole("button", { name: "Back to the grid" }).click();
  await expect(strip).toHaveCount(0);
  await expect.poll(columns).toBe(2);

  // Every watched share goes fullscreen from its button or a double-click, and back.
  /** Whether the share's picture fills the whole screen. */
  const fills = async (name: string) => {
    const box = await picture(name).boundingBox();
    return !!box && box.width === 1920 && box.height === 953;
  };
  await picture("Xia").hover();
  await stage.getByRole("button", { name: "Show Xia's webcam fullscreen" }).click();
  await expect.poll(() => fills("Xia")).toBe(true);
  await picture("Xia").hover();
  await expect(stage.getByRole("button", { name: "Leave fullscreen" })).toBeVisible();
  await picture("Xia").dblclick();
  await expect.poll(() => fills("Xia")).toBe(false);
  await picture("Wil").dblclick();
  await expect.poll(() => fills("Wil")).toBe(true);
  await picture("Wil").hover();
  await stage.getByRole("button", { name: "Leave fullscreen" }).click();
  await expect.poll(() => fills("Wil")).toBe(false);
});

/** Waits for the page's animations, such as a tile's arrival, to finish, so what is measured holds still. */
async function settled(page: Page) {
  await page.evaluate("Promise.all(document.getAnimations().map((animation) => animation.finished))");
}

test("while no one shares, the empty stage offers sharing as the bar does, the screen's first-time notice beside it", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const stage = owner.getByRole("main", { name: "Stage" });
  const bar = owner.getByRole("complementary", { name: "People" });
  await expect(stage.getByRole("heading", { name: "No one is sharing yet." })).toBeVisible();

  // One click shares the webcam, as in the bar.
  await stage.getByRole("button", { name: "Share webcam" }).click();
  await expect(owner.getByRole("button", { name: "Stop your webcam" })).toBeVisible();
  await expect(stage.getByRole("heading", { name: "Only you are sharing." })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Webcam live" })).toBeDisabled();

  // Share screen names its key. Its first-time notice opens on the stage, where it was
  // pressed, not in the bar's foot, and going on from it shares the screen.
  const shareScreen = stage.getByRole("button", { name: "Share screen" });
  await expect(shareScreen).toHaveAttribute("aria-keyshortcuts", "S");
  await shareScreen.click();
  const notice = stage.getByRole("dialog", { name: "Before you pick" });
  await expect(notice).toBeVisible();
  await expect(bar.getByRole("dialog")).toHaveCount(0);
  await notice.getByRole("button", { name: "Choose what to share" }).click();
  await expect(owner.getByRole("button", { name: "Stop your screen" })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Screen live" })).toBeDisabled();

  // Once someone else shares, the stage offers what they share instead of sharing.
  await join("Cleo");
  await expect(stage.getByRole("button", { name: "Watch Cleo's webcam" })).toBeVisible();
  await expect(stage.getByRole("button", { name: /^Share / })).toHaveCount(0);
});

test("with shares live, the empty stage offers each one by name, and a click watches that one alone", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  await join("Cleo");
  await join("Davi");
  const stage = owner.getByRole("main", { name: "Stage" });
  const here = owner.getByRole("region", { name: "Here" });
  await expect(stage.getByRole("heading", { name: "You're not watching anything yet." })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Watch Cleo's webcam" })).toBeVisible();

  await stage.getByRole("button", { name: "Watch Davi's webcam" }).click();
  await expect(stage.getByRole("img", { name: "Davi's webcam, with no picture" })).toBeVisible();
  await expect(stage.getByRole("img", { name: "Cleo's webcam, with no picture" })).toHaveCount(0);
  // The same watch as the row's icon, which lights.
  await expect(here.getByRole("button", { name: "Stop watching Davi's webcam" })).toBeVisible();
});
