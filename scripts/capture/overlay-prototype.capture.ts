// PROTOTYPE (prototype/overlay), throwaway: each overlay variant over the busy sample
// room (seven shares watched, Marta's webcam live), and over the list of rooms. The fake
// instance gets an owner, three members who joined, an invite nobody used and a second
// room, so the owner page has something to show.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "../../test/browser/app.ts";
import { shoot, SIZES } from "./shoot.ts";

const VARIANTS = [
  { key: "A", slug: "a-sheet" },
  { key: "B", slug: "b-centred" },
  { key: "C", slug: "c-side" },
] as const;

// `vite dev` reads the secrets in `.dev.vars` over the ones given it, so the in-memory
// instance's setup secret is the one there, used here and never printed.
function setupSecret(): string {
  const path = fileURLToPath(new URL("../../.dev.vars", import.meta.url));
  if (!existsSync(path)) return SETUP_SECRET;
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((each) => each.startsWith("SETUP_SECRET="));
  return line ? line.slice("SETUP_SECRET=".length).trim().replace(/^"(.*)"$/, "$1") : SETUP_SECRET;
}

async function settle(page: Page) {
  await page.addStyleTag({ content: "[data-prototype-switcher]{display:none!important}" });
  await page.mouse.move(0, 0);
}

test("the overlay variants", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const ownerContext = await browser.newContext({ baseURL, viewport: SIZES[0] });
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${setupSecret()}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible({ timeout: 30_000 });
  const room = new URL(owner.url()).pathname;

  for (const name of ["Bia", "Caio", "Duda"]) {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await page.waitForURL(/\/r\//);
    await context.close();
  }
  await ownerContext.request.post("/api/owner/invites", { data: { name: "Edu" } });
  await ownerContext.request.post("/api/owner/rooms", { data: { name: "Late shift" } });

  // The room as it is, for comparison.
  await owner.goto(`${room}?sample=busy`);
  await expect(owner.getByRole("heading", { name: "The den" })).toBeVisible();
  await settle(owner);
  await shoot(owner, "room--before");

  for (const { key, slug } of VARIANTS) {
    await owner.goto(`${room}?sample=busy&variant=${key}`);
    await expect(owner.getByRole("heading", { name: "The den" })).toBeVisible();
    const overlay = owner.getByRole("dialog", { name: "Owner" });

    // The gear: People, with Bia picked.
    await owner.getByRole("link", { name: "Owner page" }).click();
    await expect(overlay.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await overlay.getByRole("region", { name: "Members" }).getByRole("button", { name: /Bia/ }).click();
    await settle(owner);
    await shoot(owner, `${slug}--owner-people`);

    // Usage, the widest section.
    await overlay.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Usage" }).click();
    await expect(overlay.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
    await settle(owner);
    await shoot(owner, `${slug}--owner-usage`);

    // A reload keeps the overlay and the room under it; back steps to the last section.
    await owner.reload();
    await expect(overlay.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
    // Without `?sample` in the overlay's address, the real room is the one under it.
    await expect(owner.getByRole("heading", { name: "First room" })).toBeAttached();
    await owner.goBack();
    await expect(overlay.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await owner.goForward();
    await expect(overlay.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();

    // Close goes back to the room, past both sections.
    await owner.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await expect(owner).toHaveURL(new RegExp(`${room}\\?`));

    // "You", from the menu on your avatar.
    await owner.getByRole("button", { name: "You", exact: true }).first().click();
    await owner.getByRole("menuitem", { name: "You" }).click();
    const you = owner.getByRole("dialog", { name: "You" });
    await expect(you.getByRole("heading", { name: "Devices" })).toBeVisible();
    await settle(owner);
    await shoot(owner, `${slug}--you`);
    await owner.keyboard.press("Escape");
    await expect(you).toBeHidden();

    // From the list of rooms, the same way.
    await owner.goto(`/?sample&variant=${key}`);
    await expect(owner.getByRole("heading", { name: "Rooms" })).toBeVisible();
    await owner.getByRole("link", { name: "Owner page" }).click();
    await expect(overlay.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await settle(owner);
    await shoot(owner, `${slug}--owner-over-rooms`);
  }
});
