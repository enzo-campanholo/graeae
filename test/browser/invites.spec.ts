import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { SETUP_SECRET } from "./app.ts";

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

test("an invite, from the owner page to the new member standing in the room", async ({ browser, baseURL }) => {
  const inRoom = await newBrowser(browser, baseURL);
  await inRoom.goto(`/setup#${SETUP_SECRET}`);
  await expect(inRoom.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = inRoom.url();

  // The gear opens the owner page in a new tab, beside the room; its Invites section holds the form.
  const [owner] = await Promise.all([
    inRoom.context().waitForEvent("page"),
    inRoom.getByRole("link", { name: "Owner page" }).click(),
  ]);
  await expect(owner).toHaveURL(/\/owner\/people$/);
  await expect(inRoom).toHaveURL(room);
  await owner.getByRole("link", { name: "Invites" }).click();
  await expect(owner.getByRole("heading", { name: "Invites" })).toBeVisible();

  const form = owner.getByRole("form", { name: "New invite" });
  await expect(form.getByRole("checkbox", { name: "First room" })).toBeChecked();
  await form.getByLabel("Display name").fill("Bia");
  await form.getByRole("button", { name: "Create and copy link" }).click();

  // The link is on the clipboard at the press, and shown with a way to copy it again.
  await expect(owner.getByText("Bia's link is on your clipboard")).toBeVisible();
  const link = await clipboard(owner);
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{22}$/);
  await expect(owner.getByLabel("Invite link")).toHaveText(link);
  await expect(owner.getByRole("button", { name: "Copy again" })).toBeVisible();
  await expect(form.getByLabel("Display name")).toHaveValue("");

  const pending = owner.getByRole("region", { name: "Pending invites" });
  const row = pending.getByRole("listitem", { name: "Bia" });
  await expect(row).toContainText("First room · expires in 7 days");
  await owner.evaluate("navigator.clipboard.writeText('')");
  await row.getByRole("button", { name: "Copy link" }).click();
  await expect.poll(() => clipboard(owner)).toBe(link);

  // The invited person sees one button, and the press takes them into the room.
  const bia = await newBrowser(browser, baseURL);
  await bia.goto(link);
  await bia.getByRole("button", { name: "Join as Bia" }).click();
  await expect(bia).toHaveURL(room);
  await expect(bia.getByRole("heading", { name: "First room" })).toBeVisible();
  await expect(bia.getByRole("link", { name: /Bia/ })).toContainText("you");
  await expect(bia.getByRole("link", { name: "Owner page" })).toHaveCount(0);

  // Remembered from now on, and not let into the owner page.
  await bia.goto("/");
  await expect(bia).toHaveURL(room);
  await bia.goto("/owner/invites");
  await expect(bia.getByRole("heading", { name: "Nothing here" })).toBeVisible();

  // The invite is used up: it shows nothing here, and is no longer waiting.
  const late = await newBrowser(browser, baseURL);
  await late.goto(link);
  await expect(late.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await owner.reload();
  await expect(pending.getByText("No invites waiting.", { exact: false })).toBeVisible();
});

test("the owner cancels an invite, and its link shows nothing here", async ({ browser, baseURL }) => {
  const owner = await newBrowser(browser, baseURL);
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  await owner.goto("/owner/invites");

  await owner.getByLabel("Display name").fill("Caio");
  await owner.getByRole("button", { name: "Create and copy link" }).click();
  const link = (await owner.getByLabel("Invite link").textContent())!.trim();
  const pending = owner.getByRole("region", { name: "Pending invites" });
  await pending.getByRole("listitem", { name: "Caio" }).getByRole("button", { name: "Cancel invite" }).click();

  await expect(pending.getByRole("listitem")).toHaveCount(0);
  await expect(owner.getByLabel("Invite link")).toHaveCount(0);
  const caio = await newBrowser(browser, baseURL);
  await caio.goto(link);
  await expect(caio.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

/** What is on the clipboard of the browser `page` is in. */
function clipboard(page: Page): Promise<string> {
  // Evaluated in the page, as text: the tests' own types are the Workers runtime's.
  return page.evaluate<string>("navigator.clipboard.readText()");
}
