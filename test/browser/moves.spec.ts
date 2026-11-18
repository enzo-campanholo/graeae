// Moving around the app feels instant (ticket 33): a short wait shows no loading state,
// and the home links skip the list of rooms for a member with one room. `pnpm perf` times
// every move; these hold the two rules in place.

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
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

test("a loading state stays out of sight for the first 300ms of a move, then fades in", async ({
  browser,
  baseURL,
}) => {
  const { owner } = await asOwner(browser, baseURL);
  await owner.goto("/owner/people");
  await expect(owner.getByRole("heading", { name: "People", level: 1 })).toBeVisible();

  // The Invites section's list is held back until the test lets it through.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await owner.route("**/api/owner/invites", async (route) => {
    await held;
    await route.continue();
  });

  await owner.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Invites" }).click();
  const mark = owner.getByRole("status", { name: "Loading" });
  // At first the mark is there for assistive technology, but not painted.
  await expect(mark).toHaveCSS("opacity", "0");
  // A wait that outlasts the hold-back shows it.
  await expect(mark).toHaveCSS("opacity", "1");

  release();
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
