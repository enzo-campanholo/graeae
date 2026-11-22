// Moving around the app feels instant (ticket 33): a page appears whole, the last one
// staying until it can or the hold-back runs out. An overlay opened fresh puts a member's
// one room under it, not the list of rooms (ticket 50). `pnpm perf` times every move;
// these hold the rules in place. The owner page opens in a panel of set measures, its
// navigation narrower than the room's bar (ticket 50), and every owner section puts its
// side column in one place (ticket 36). The room's name, and "Owner" on the owner page,
// head their columns as a page's heading does, under a row of tools (ticket 43).

import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { SETUP_SECRET } from "./app.ts";

// Journeys share one instance. This one only looks, as the owner, who has one room here:
// the journeys that give the owner a second room run after it (see playwright.config.ts).

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function asOwner(browser: Browser, baseURL: string | undefined): Promise<{ owner: Page; room: string }> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  const owner = await context.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  return { owner, room: owner.url() };
}

/** Opens the owner page on People, with the Invites section's list held until `release`. */
async function heldInvites(owner: Page) {
  await owner.goto("/owner/people");
  await expect(owner.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await owner.route("**/api/owner/invites", async (route) => {
    await held;
    await route.continue();
  });
  return {
    release,
    go: () => owner.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Invites" }).click(),
    people: owner.getByRole("heading", { name: "People", level: 1 }),
    invites: owner.getByRole("heading", { name: "Invites", level: 1 }),
    form: owner.getByRole("form", { name: "New invite" }),
    mark: owner.getByRole("status", { name: "Loading" }),
  };
}

/** Once the owner page's panel has finished scaling in, so it is measured at its size. */
const settled = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      (globalThis as unknown as { document: { getAnimations(): { finished: Promise<unknown> }[] } }).document
        .getAnimations()
        .map((animation) => animation.finished),
    ),
  );

test("a move keeps the page as it is until the next one is whole, then shows it at once", async ({
  browser,
  baseURL,
}) => {
  const { owner } = await asOwner(browser, baseURL);
  const { release, go, people, invites, form, mark } = await heldInvites(owner);

  await go();
  // While the list is on its way, People stays as it was: its link still the current one,
  // and the tab's title still its own.
  await expect(people).toBeVisible();
  await expect(invites).toBeHidden();
  await expect(owner.getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
  await expect(owner).toHaveTitle("People · Owner · graeae");

  release();
  // Heading and list arrive in the same frame, with no loading state between them.
  await expect(invites).toBeVisible();
  expect(await form.isVisible(), "the list arrived after its heading").toBe(true);
  expect(await mark.count(), "a loading state showed").toBe(0);
  await expect(people).toBeHidden();
  await expect(owner.getByRole("link", { name: "Invites" })).toHaveAttribute("aria-current", "page");
  await expect(owner).toHaveTitle("Invites · Owner · graeae");
});

test("a move that outlasts the hold-back shows the next page with its loading mark fading in", async ({
  browser,
  baseURL,
}) => {
  const { owner } = await asOwner(browser, baseURL);
  const { release, go, people, invites, form, mark } = await heldInvites(owner);

  await go();
  await expect(invites).toBeVisible();
  await expect(people).toBeHidden();
  await expect(mark).toHaveCSS("opacity", "1");

  release();
  await expect(form).toBeVisible();
  await expect(mark).toHaveCount(0);
});

test("an owner page or \"You\" opened fresh goes over a member's one room, never the list of rooms", async ({
  browser,
  baseURL,
}) => {
  const { owner, room } = await asOwner(browser, baseURL);
  const under = owner.locator("[inert]").filter({ has: owner.getByRole("heading", { name: "First room" }) });

  // The owner page at a typed address: the room goes under it, and the address stays.
  await owner.goto("/owner/people");
  await expect(owner.getByRole("dialog", { name: "Owner" }).getByRole("heading", { name: "People" })).toBeVisible();
  await expect(under).toHaveCount(1);
  await expect(owner).toHaveURL(/\/owner\/people$/);
  await expect(owner.getByRole("heading", { name: "Rooms" })).toHaveCount(0);
  await owner.keyboard.press("Escape");
  await expect(owner).toHaveURL(room);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  await expect(under).toHaveCount(0);

  // After moves within it, one close still goes back past all of them, and Back from the
  // room never opens it again.
  const panel = owner.getByRole("dialog", { name: "Owner" });
  const nav = panel.getByRole("navigation", { name: "Owner page" });
  await owner.goto("/owner/people");
  await nav.getByRole("link", { name: "Invites" }).click();
  await expect(panel.getByRole("heading", { name: "Invites" })).toBeVisible();
  await nav.getByRole("link", { name: "Rooms" }).click();
  await expect(panel.getByRole("heading", { name: "Rooms", level: 1 })).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(owner).toHaveURL(room);
  await expect(panel).toHaveCount(0);
  await expect(under).toHaveCount(0);
  await owner.goBack();
  await expect(owner).not.toHaveURL(/\/owner/);
  await owner.goForward();
  await expect(owner).toHaveURL(room);

  // A double press closes once, opened from the gear too.
  await owner.getByRole("link", { name: "Owner page" }).click();
  await nav.getByRole("link", { name: "Invites" }).click();
  await expect(panel.getByRole("heading", { name: "Invites" })).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).dblclick();
  await expect(panel).toHaveCount(0);
  await expect(owner).toHaveURL(room);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();

  // "You" the same.
  await owner.goto("/you");
  await expect(owner.getByRole("dialog", { name: "You" }).getByLabel("Your devices").getByRole("listitem")).not.toHaveCount(0);
  await expect(under).toHaveCount(1);
  await owner.getByRole("dialog", { name: "You" }).getByRole("button", { name: "Close" }).click();
  await expect(owner).toHaveURL(room);
  await expect(under).toHaveCount(0);
});

test("the owner page opens in a panel 32px from the window's edges, at most 1280 by 880, its navigation 240px wide", async ({
  browser,
  baseURL,
}) => {
  const { owner } = await asOwner(browser, baseURL);
  const panel = owner.getByRole("dialog", { name: "Owner" });
  const nav = panel.getByRole("complementary").filter({ has: owner.getByRole("navigation", { name: "Owner page" }) });

  for (const [width, height, expected] of [
    [1920, 953, { width: 1280, height: 880 }],
    [1366, 768, { width: 1280, height: 768 - 64 }],
    [1200, 700, { width: 1200 - 64, height: 700 - 64 }],
  ] as const) {
    await owner.setViewportSize({ width, height });
    await owner.goto("/owner/invites");
    await expect(nav).toBeVisible();
    await settled(owner);
    const box = (await panel.boundingBox())!;
    expect({ width: box.width, height: box.height }, `${width}x${height}`).toEqual(expected);
    // Centred.
    expect(box.x).toBeCloseTo((width - box.width) / 2, 0);
    expect(box.y).toBeCloseTo((height - box.height) / 2, 0);
    expect((await nav.boundingBox())!.width).toBe(240);
  }
});

/** How `element` is set: its size, weight and tracking. */
// These run in the page; the tests' own types have no DOM, so they name what they use.
interface PageGlobals {
  getComputedStyle(node: unknown): { fontSize: string; fontWeight: string; letterSpacing: string };
  document: { createRange(): { selectNodeContents(node: unknown): void; getBoundingClientRect(): { left: number } } };
}

const typeSetting = (element: Locator) =>
  element.evaluate((node) => {
    const style = (globalThis as unknown as PageGlobals).getComputedStyle(node);
    return { size: style.fontSize, weight: style.fontWeight, tracking: style.letterSpacing };
  });

/** Where `element`'s words start, past any padding. */
const wordsStart = (element: Locator) =>
  element.evaluate((node) => {
    const range = (globalThis as unknown as PageGlobals).document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().left;
  });

test("the room's name heads the bar under its tools, as large as a page's heading, and the owner page's name heads its navigation the same way", async ({
  browser,
  baseURL,
}) => {
  const { owner } = await asOwner(browser, baseURL);
  const bar = owner.getByRole("complementary", { name: "People" });
  const name = bar.getByRole("heading", { name: "First room", level: 1 });
  const here = bar.getByRole("heading", { name: /^Here/ });
  const tools = (await bar.getByRole("button", { name: "Hide the bar" }).boundingBox())!;
  const nameBox = (await name.boundingBox())!;

  // Under the tools, above the people, its words on the line the people's heading starts from.
  expect(nameBox.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  expect(nameBox.y + nameBox.height).toBeLessThanOrEqual((await here.boundingBox())!.y);
  const peopleLine = await wordsStart(here);
  expect(await wordsStart(name)).toBeCloseTo(peopleLine, 1);

  // Set as the heading of an owner section is, so it reads as the page's own heading and
  // not as one more name in the list under it.
  const nameSetting = await typeSetting(name);

  await owner.goto("/owner/people");
  const sectionHeading = owner.getByRole("heading", { name: "People", level: 1 });
  await expect(sectionHeading).toBeVisible();
  expect(nameSetting).toEqual(await typeSetting(sectionHeading));

  // The owner page's navigation: "Owner" under a row the height of the bar's tools, set
  // the same, its words on the line the navigation's icons start from.
  const side = owner.getByRole("complementary").filter({ has: owner.getByRole("navigation", { name: "Owner page" }) });
  const ownerName = side.getByText("Owner", { exact: true });
  const top = (await side.boundingBox())!.y;
  expect((await ownerName.boundingBox())!.y).toBeGreaterThanOrEqual(top + tools.height);
  const icon = (await side.getByRole("navigation").getByRole("link", { name: "People" }).locator("svg").boundingBox())!;
  expect(await wordsStart(ownerName)).toBeCloseTo(icon.x, 0);
  expect(await typeSetting(ownerName)).toEqual(nameSetting);
});

test("every owner section puts its side column at the same place", async ({ browser, baseURL }) => {
  const { owner } = await asOwner(browser, baseURL);
  await owner.setViewportSize({ width: 1920, height: 953 });
  // Each section's inspector as it opens: People with nobody picked, Invites and Rooms on
  // their "New" forms.
  const sides = {
    people: owner.getByRole("complementary", { name: "Member" }),
    invites: owner.getByRole("complementary", { name: "New invite" }),
    rooms: owner.getByRole("complementary", { name: "New room" }),
    usage: owner.getByRole("complementary", { name: "Usage settings" }),
  };

  const placed = new Map<string, { x: number; width: number }>();
  for (const [section, side] of Object.entries(sides)) {
    await owner.goto(`/owner/${section}`);
    await expect(side).toBeVisible();
    await settled(owner);
    const { x, width } = (await side.boundingBox())!;
    placed.set(section, { x, width });
  }

  const people = placed.get("people");
  for (const [section, box] of placed) expect(box, section).toEqual(people);
});
