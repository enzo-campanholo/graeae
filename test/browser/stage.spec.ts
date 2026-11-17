import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// Watching from the bar, and how the stage lays out what is watched. The media on every
// side is fake, so these cover what the owner sees, not pictures. Journeys share one
// instance; these name their members Rui, Sol, Tom, Ugo, Vera, Wil, Xia and Yan, whom no
// other journey uses. Only webcams can be shared from a browser so far, so every share
// here is a webcam.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
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
    if (share) await shareWebcam(page);
    return page;
  }

  return { owner, join };
}

async function shareWebcam(page: Page) {
  await page.getByRole("button", { name: "Share webcam" }).click();
  await expect(page.getByRole("button", { name: "Stop your webcam" })).toBeVisible();
}

async function stopWebcam(page: Page) {
  await page.getByRole("button", { name: "Stop your webcam" }).click();
  await expect(page.getByRole("button", { name: "Share webcam" })).toBeEnabled();
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
  const ugo = await join("Ugo", { share: false });

  const stage = owner.getByRole("main", { name: "Stage" });
  const here = owner.getByRole("region", { name: "Here" });
  const toms = stage.getByRole("img", { name: "Tom's webcam, with no picture" });
  const ugos = stage.getByRole("img", { name: "Ugo's webcam, with no picture" });
  const ugoName = here.getByRole("button", { name: "Ugo", exact: true });

  // On arrival the empty stage offers to watch everything, and it does.
  await stage.getByRole("button", { name: "Watch everything" }).click();
  await expect(toms).toBeVisible();
  // It follows nobody: a share started afterwards does not join by itself.
  await shareWebcam(ugo);
  await expect(here.getByRole("button", { name: "Watch Ugo's webcam" })).toBeVisible();
  await expect(ugos).toHaveCount(0);

  // "Nothing" empties the stage.
  const shortcuts = here.getByRole("group", { name: "Watch" });
  await shortcuts.getByRole("button", { name: "Nothing" }).click();
  await expect(toms).toHaveCount(0);
  await expect(stage.getByText("You're not watching anything yet.")).toBeVisible();

  // "Everything" watches every share, and "Webcams" every webcam.
  await shortcuts.getByRole("button", { name: "Everything" }).click();
  await expect(toms).toBeVisible();
  await expect(ugos).toBeVisible();
  await shortcuts.getByRole("button", { name: "Nothing" }).click();
  await expect(ugos).toHaveCount(0);
  await shortcuts.getByRole("button", { name: "Webcams" }).click();
  await expect(toms).toBeVisible();
  await expect(ugos).toBeVisible();

  // A shortcut ends following, and is one-off itself.
  await ugoName.click();
  await expect(toms).toHaveCount(0);
  await shortcuts.getByRole("button", { name: "Webcams" }).click();
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

  // The rail keeps the share buttons and follows a member in one click.
  await owner.getByRole("button", { name: "Hide the bar" }).click();
  const rail = owner.getByRole("complementary", { name: "People" });
  await expect(rail.getByRole("button", { name: "Share webcam" })).toBeVisible();
  const followTom = rail.getByRole("button", { name: "Follow Tom" });
  await followTom.click();
  await expect(toms).toBeVisible();
  await expect(ugos).toHaveCount(0);
  await expect(followTom).toHaveAttribute("aria-pressed", "true");
  await owner.getByRole("button", { name: "Show the bar" }).click();
  await expect(here.getByRole("button", { name: "Tom", exact: true })).toHaveAttribute("aria-pressed", "true");
});
