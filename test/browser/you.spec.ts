import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// Journeys share one instance. Its members are Fia and Ari, whom no other journey uses.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

/** A browser of its own, with nothing remembered, that may use the clipboard. */
async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  return context.newPage();
}

test("a member renames themselves, adds a second browser, then forgets it while it is in the room", async ({
  browser,
  baseURL,
}) => {
  const owner = await newBrowser(browser, baseURL);
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await owner.request.post("/api/owner/invites", { data: { name: "Fia" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;

  const fiaRoom = await newBrowser(browser, baseURL);
  await fiaRoom.goto(`/invite/${invite.code}`);
  await fiaRoom.getByRole("button", { name: "Join as Fia" }).click();
  await expect(fiaRoom).toHaveURL(room);
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Fia" })).toBeVisible();

  // Fia's own row opens "You" over the room, where the new name reaches the owner's bar at once.
  await fiaRoom.getByRole("region", { name: "Here" }).getByRole("link", { name: /Fia/ }).click();
  const fia = fiaRoom.getByRole("dialog", { name: "You" });
  await expect(fia.getByRole("heading", { name: "You" })).toBeVisible();
  await expect(fia.getByLabel("Your devices").getByRole("listitem")).toHaveCount(1);
  await expect(fia.getByLabel("Your devices")).toContainText("This device");
  await fia.getByRole("textbox", { name: "Display name" }).fill("Fia R.");
  await fia.getByRole("button", { name: "Save" }).click();
  await expect(fia.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(owner.getByText("Fia R.", { exact: true })).toBeVisible();
  // The room carries on under "You", so the owner still sees Fia here.
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Fia R." })).toBeVisible();

  // Add a device: the link is on the clipboard and shown, and opens the same one-button page.
  await fia.getByRole("button", { name: "Add a device" }).click();
  await expect(fia.getByText("The link is on your clipboard")).toBeVisible();
  await expect(fia.getByText(/expires in 10 minutes/)).toBeVisible();
  const link = await fiaRoom.evaluate<string>("navigator.clipboard.readText()");
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{22}$/);
  await expect(fia.getByLabel("Device link")).toHaveText(link);

  const laptop = await newBrowser(browser, baseURL);
  await laptop.goto(link);
  await laptop.getByRole("button", { name: "Join as Fia R." }).click();
  await expect(laptop).toHaveURL(room);
  await expect(laptop.getByRole("region", { name: "Here" }).getByRole("link", { name: /Fia R\./ })).toContainText(
    "you",
  );
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Fia R." })).toBeVisible();

  // Back on the first browser, the new device is listed and the used link is gone.
  await fia.evaluate("window.dispatchEvent(new Event('focus'))");
  const devices = fia.getByLabel("Your devices").getByRole("listitem");
  await expect(devices).toHaveCount(2);
  await expect(fia.getByLabel("Link for another browser")).toHaveCount(0);

  // Forgetting it closes its room at once: its page is "nothing here", and Fia stays here only
  // through the first browser, still in the room under "You".
  const other = devices.filter({ hasNotText: "This device" });
  await other.getByRole("button", { name: "Forget" }).click();
  await expect(devices).toHaveCount(1);
  await expect(laptop.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Fia R." })).toHaveCount(1);
  await laptop.reload();
  await expect(laptop.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

test("the avatar at the top of the bar opens You and sets the appearance, for a member and the owner", async ({
  browser,
  baseURL,
}) => {
  const owner = await newBrowser(browser, baseURL);
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await owner.request.post("/api/owner/invites", { data: { name: "Ari" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const ari = await newBrowser(browser, baseURL);
  await ari.goto(`/invite/${invite.code}`);
  await ari.getByRole("button", { name: "Join as Ari" }).click();
  await expect(ari).toHaveURL(room);

  // Ari, a member with one room, has no gear: the avatar alone, whose menu names them.
  const bar = ari.getByRole("complementary", { name: "People" });
  await expect(bar.getByRole("link", { name: "Owner page" })).toHaveCount(0);
  await bar.getByRole("button", { name: "You", exact: true }).click();
  const menu = ari.getByRole("menu");
  await expect(menu).toContainText("Ari");
  await expect(menu.getByRole("menuitem", { name: "Owner page" })).toHaveCount(0);

  // The appearance changes here, in the room, and is kept for the "You" page.
  await expect(ari.locator("html")).toHaveClass(/\bdark\b/);
  await menu.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(ari.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect(menu.getByRole("menuitemradio", { name: "Light" })).toBeChecked();

  // "You" opens over the room, so Ari stays in it, and closing goes back to the avatar.
  await menu.getByRole("menuitem", { name: "You" }).click();
  await expect(ari).toHaveURL(/\/you$/);
  const you = ari.getByRole("dialog", { name: "You" });
  await expect(you.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  // The "You" panel has no avatar of its own: its menu would lead to where you are.
  await expect(you.getByRole("button", { name: "You", exact: true })).toHaveCount(0);
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Ari" })).toBeVisible();
  await ari.keyboard.press("Escape");
  await expect(you).toHaveCount(0);
  await expect(ari).toHaveURL(room);
  await expect(bar.getByRole("button", { name: "You", exact: true })).toBeFocused();

  // The owner keeps the gear beside the avatar, so the owner page stays one click away.
  const ownerBar = owner.getByRole("complementary", { name: "People" });
  await expect(ownerBar.getByRole("link", { name: "Owner page" })).toBeVisible();
  await ownerBar.getByRole("button", { name: "You", exact: true }).click();
  await expect(owner.getByRole("menu")).toContainText("Owner");
  await expect(owner.getByRole("menu").getByRole("menuitem", { name: "Owner page" })).toHaveCount(0);
  await owner.keyboard.press("Escape");

  // Folded, the avatar sits at the rail's foot with the same menu.
  await ownerBar.getByRole("button", { name: "Hide the bar" }).click();
  await owner.getByRole("complementary", { name: "People" }).getByRole("button", { name: "You", exact: true }).click();
  await expect(owner.getByRole("menu").getByRole("menuitem", { name: "You" })).toBeVisible();
});
