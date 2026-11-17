import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// Journeys share one instance. This one's member is Fia, whom no other journey uses.

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

  const fia = await newBrowser(browser, baseURL);
  await fia.goto(`/invite/${invite.code}`);
  await fia.getByRole("button", { name: "Join as Fia" }).click();
  await expect(fia).toHaveURL(room);
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Fia" })).toBeVisible();

  // Fia's own row leads to "You", where the new name reaches the owner's bar at once.
  await fia.getByRole("region", { name: "Here" }).getByRole("link", { name: /Fia/ }).click();
  await expect(fia.getByRole("heading", { name: "You" })).toBeVisible();
  await expect(fia.getByLabel("Your devices").getByRole("listitem")).toHaveCount(1);
  await expect(fia.getByLabel("Your devices")).toContainText("This device");
  await fia.getByRole("textbox", { name: "Display name" }).fill("Fia R.");
  await fia.getByRole("button", { name: "Save" }).click();
  await expect(fia.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(owner.getByText("Fia R.", { exact: true })).toBeVisible();
  // Fia left the room for "You", so the owner sees them under "Not here".
  await expect(owner.getByRole("region", { name: "Not here" })).toContainText("Fia R.");

  // Add a device: the link is on the clipboard and shown, and opens the same one-button page.
  await fia.getByRole("button", { name: "Add a device" }).click();
  await expect(fia.getByText("The link is on your clipboard")).toBeVisible();
  await expect(fia.getByText(/expires in 10 minutes/)).toBeVisible();
  const link = await fia.evaluate<string>("navigator.clipboard.readText()");
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

  // Forgetting it closes its room at once: its page is "nothing here", and Fia is gone from the bar.
  const other = devices.filter({ hasNotText: "This device" });
  await other.getByRole("button", { name: "Forget" }).click();
  await expect(devices).toHaveCount(1);
  await expect(laptop.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await expect(owner.getByRole("region", { name: "Not here" })).toContainText("Fia R.");
  await laptop.reload();
  await expect(laptop.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});
