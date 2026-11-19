// Moving around the app feels instant (ticket 33): a page appears whole, the last one
// staying until it can or the hold-back runs out, and the home links skip the list of
// rooms for a member with one room. `pnpm perf` times every move; these hold the rules
// in place. A move also keeps the side column one width, from the room's bar to the owner
// page's navigation (ticket 35), and every owner section puts its side column in one
// place (ticket 36). The room's name, and "Owner" on the owner page, head that column as
// a page's heading does, under its tools (ticket 43).

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

test("the home links take a member with one room straight into it, without the list of rooms", async ({
  browser,
  baseURL,
}) => {
  const { owner, room } = await asOwner(browser, baseURL);
  const sockets: string[] = [];
  owner.on("websocket", (socket) => sockets.push(new URL(socket.url()).pathname));

  // The owner page's house.
  await owner.goto("/owner/people");
  await owner.locator("aside header").getByRole("link", { name: "Rooms" }).click();
  await expect(owner).toHaveURL(room);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();

  // The mark on the "You" page.
  await owner.goto("/you");
  await expect(owner.getByLabel("Your devices").getByRole("listitem")).not.toHaveCount(0);
  await owner.getByRole("link", { name: "graeae" }).click();
  await expect(owner).toHaveURL(room);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();

  // The list of rooms has a socket of its own; it was never opened.
  expect(sockets).not.toContain("/api/socket");
});

test("the side bar is one width from the room to the owner page", async ({ browser, baseURL }) => {
  const { owner } = await asOwner(browser, baseURL);
  const bar = (await owner.getByRole("complementary", { name: "People" }).boundingBox())!;

  await owner.goto("/owner/invites");
  const ownerSide = owner
    .getByRole("complementary")
    .filter({ has: owner.getByRole("navigation", { name: "Owner page" }) });
  await expect(ownerSide).toBeVisible();

  expect((await ownerSide.boundingBox())!.width).toBe(bar.width);
});

/** How `element` is set: its size, weight and tracking. */
const typeOf = (element: Locator) =>
  element.evaluate(
    "(node) => { const s = getComputedStyle(node); return { size: s.fontSize, weight: s.fontWeight, tracking: s.letterSpacing }; }",
  ) as Promise<{ size: string; weight: string; tracking: string }>;

/** Where `element`'s words start, past any padding. */
const wordsStart = (element: Locator) =>
  element.evaluate(
    "(node) => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().left; }",
  ) as Promise<number>;

test("the room's name heads the bar under its tools, as large as a page's heading, and the owner page's name heads its navigation the same way", async ({
  browser,
  baseURL,
}) => {
  const { owner } = await asOwner(browser, baseURL);
  const bar = owner.getByRole("complementary", { name: "People" });
  const name = bar.getByRole("heading", { name: "First room", level: 1 });
  const here = bar.getByRole("heading", { name: /^Here/ });
  const tools = (await bar.getByRole("button", { name: "Hide the bar" }).boundingBox())!;
  const room = (await name.boundingBox())!;

  // Under the tools, above the people, its words on the line the people's heading starts from.
  expect(room.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  expect(room.y + room.height).toBeLessThanOrEqual((await here.boundingBox())!.y);
  const line = await wordsStart(here);
  expect(await wordsStart(name)).toBe(line);

  // Set as the heading of an owner section is, so it reads as the page's own heading and
  // not as one more name in the list under it.
  const roomType = await typeOf(name);

  await owner.goto("/owner/people");
  const people = owner.getByRole("heading", { name: "People", level: 1 });
  await expect(people).toBeVisible();
  expect(roomType).toEqual(await typeOf(people));

  // The owner page's navigation: "Owner" under the house, set the same and on the same line.
  const side = owner.getByRole("complementary").filter({ has: owner.getByRole("navigation", { name: "Owner page" }) });
  const house = (await side.locator("header").getByRole("link", { name: "Rooms" }).boundingBox())!;
  const ownerName = side.getByText("Owner", { exact: true });
  expect((await ownerName.boundingBox())!.y).toBeGreaterThanOrEqual(house.y + house.height);
  expect(await wordsStart(ownerName)).toBe(line);
  expect(await typeOf(ownerName)).toEqual(roomType);
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
    const { x, width } = (await side.boundingBox())!;
    placed.set(section, { x, width });
  }

  const people = placed.get("people");
  for (const [section, box] of placed) expect(box, section).toEqual(people);
});
