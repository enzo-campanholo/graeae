// The room and the plain pages with the made-up data of `?sample`, whose shares draw
// pictures, under `vite dev --mode fake-media`. See capture.config.ts.

import { expect, test, type Page } from "@playwright/test";
import { shoot } from "./shoot.ts";

const stageOf = (page: Page) => page.getByRole("main", { name: "Stage" });

/** Opens `path` with the sample `variant` and waits for its page to draw. */
async function open(page: Page, path: string, variant = "") {
  await page.goto(`${path}?sample${variant ? `=${variant}` : ""}`);
  await page.waitForLoadState("networkidle");
}

test("the room, with pictures", async ({ page }) => {
  await open(page, "/r/den", "busy");
  const stage = stageOf(page);
  await expect(page.getByRole("region", { name: "Here", exact: true })).toBeVisible();
  await expect(stage.getByRole("figure")).toHaveCount(7);
  await shoot(page, "room--sample-busy");

  // The hover pill on a picture.
  const tile = stage.getByRole("figure").first();
  await shoot(page, "room--sample-hover", { redo: () => tile.hover() });

  // One share focused, the rest in the strip beneath it.
  await tile.hover();
  await tile.getByRole("button", { name: /^Focus / }).click();
  await expect(stage.getByRole("button", { name: "Back to the grid" })).toBeAttached();
  await page.mouse.move(0, 0);
  await shoot(page, "room--sample-focus");

  await open(page, "/r/den");
  await expect(stageOf(page).getByRole("figure")).toHaveCount(3);
  await shoot(page, "room--sample-three");

  await open(page, "/r/den", "one");
  await expect(stageOf(page).getByRole("figure")).toHaveCount(1);
  await shoot(page, "room--sample-one");

  await open(page, "/r/den", "none");
  await shoot(page, "room--sample-none");

  // The rail: the bar folded.
  await open(page, "/r/den");
  await page.getByRole("button", { name: "Hide the bar" }).click();
  await expect(page.getByRole("button", { name: "Show the bar" })).toBeVisible();
  await shoot(page, "room--sample-rail");
  await page.getByRole("button", { name: "Show the bar" }).click();
});

test("the plain pages, with made-up data", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();
  await shoot(page, "rooms--sample");

  await open(page, "/you");
  await expect(page.getByRole("heading", { name: "You" })).toBeVisible();
  await shoot(page, "you--sample");

  await open(page, "/invite/sample");
  await expect(page.getByRole("button", { name: /^Join as / })).toBeVisible();
  await shoot(page, "invite--sample");
});
