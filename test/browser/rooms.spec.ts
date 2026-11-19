import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { SETUP_SECRET } from "./app.ts";

// This journey gives the owner a second room, after which the root address shows the
// owner the list instead of going straight in. It therefore runs after every other
// journey, as its own project (see playwright.config.ts). Its member is Gil, whom no
// other journey uses.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  return context;
}

test("the owner makes and renames rooms, and a member with two finds them on the list", async ({ browser, baseURL }) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const firstPath = new URL(owner.url()).pathname;
  // With one room, the bar has no link back to a list.
  await expect(owner.getByRole("link", { name: "Rooms" })).toHaveCount(0);

  // The owner page's Rooms section opens on the new room's form; picking a room shows its fixed address.
  const admin = await ownerContext.newPage();
  await admin.goto("/owner/rooms");
  await expect(admin.getByRole("heading", { name: "Rooms", exact: true })).toBeVisible();
  const every = admin.getByRole("region", { name: "Every room" });
  await expect(admin.getByRole("form", { name: "New room" })).toBeVisible();
  await every.getByRole("listitem", { name: "First room" }).getByRole("button").click();
  await expect(admin.getByRole("complementary", { name: "First room" }).getByLabel("Address")).toHaveText(
    new RegExp(`${firstPath}$`),
  );

  // Making a room: it is listed and shown, and the owner's open room gains the link back at once.
  await every.getByRole("button", { name: "New room" }).click();
  await admin.getByLabel("Room name").fill("Late shift");
  await admin.getByRole("button", { name: "Create room" }).click();
  await expect(every.getByRole("listitem", { name: "Late shift" })).toBeVisible();
  const late = admin.getByRole("complementary", { name: "Late shift" });
  const lateAddress = (await late.getByLabel("Address").textContent())!.trim();
  await expect(owner.getByRole("link", { name: "Rooms" })).toBeVisible();

  // Renaming it keeps its address.
  await late.getByRole("button", { name: "Rename" }).click();
  await late.getByRole("textbox", { name: "Room name" }).fill("Night shift");
  await late.getByRole("textbox", { name: "Room name" }).press("Enter");
  const night = admin.getByRole("complementary", { name: "Night shift" });
  await expect(night.getByLabel("Address")).toHaveText(lateAddress);
  await expect(every.getByRole("listitem", { name: "Night shift" })).toBeVisible();
  await expect(every.getByRole("listitem")).toHaveCount(2);
  const nightPath = lateAddress.slice(lateAddress.indexOf("/r/"));

  // Gil's invite, with both rooms ticked.
  await admin.getByRole("link", { name: "Invites" }).click();
  const form = admin.getByRole("form", { name: "New invite" });
  await form.getByLabel("Display name").fill("Gil");
  await form.getByRole("checkbox", { name: "Night shift" }).click();
  await form.getByRole("button", { name: "Create and copy link" }).click();
  const link = (await admin.getByLabel("Invite link").textContent())!.trim();

  // Gil joins and lands on the list of rooms, which shows who is present in each.
  const gilContext = await newBrowser(browser, baseURL);
  const gil = await gilContext.newPage();
  await gil.goto(link);
  await gil.getByRole("button", { name: "Join as Gil" }).click();
  await expect(gil).toHaveURL(/\/$/);
  await expect(gil.getByRole("heading", { name: "Rooms" })).toBeVisible();
  const firstLine = gil.getByRole("link", { name: /First room/ });
  const nightLine = gil.getByRole("link", { name: /Night shift/ });
  await expect(firstLine).toContainText("Owner");
  await expect(nightLine).toContainText("No one here");
  await expect(gil.getByRole("link", { name: "Owner page" })).toHaveCount(0);
  // Gil's avatar names Gil and leads to "You", in this tab, as the list's links do.
  await gil.getByRole("button", { name: "You", exact: true }).click();
  await expect(gil.getByRole("menu")).toContainText("Gil");
  await expect(gil.getByRole("menu").getByRole("menuitem", { name: "You" })).toHaveAttribute("href", "/you");
  await expect(gil.getByRole("menu").getByRole("menuitem", { name: "You" })).not.toHaveAttribute("target");
  await gil.keyboard.press("Escape");

  // The list is live, and looking at it makes Gil present nowhere.
  await expect(owner.getByRole("region", { name: "Not here" }).getByText("Gil", { exact: true })).toBeVisible();
  await owner.goto(nightPath);
  await expect(nightLine).toContainText("Owner");
  await expect(firstLine).toContainText("No one here");

  // Into a room from the list: the bar links back, and a rename arrives live.
  await nightLine.click();
  await expect(gil.getByRole("heading", { name: "Night shift" })).toBeVisible();
  await expect(owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Gil" })).toBeVisible();
  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Rooms" }).click();
  await every.getByRole("listitem", { name: "Night shift" }).getByRole("button").click();
  await night.getByRole("button", { name: "Rename" }).click();
  await night.getByRole("textbox", { name: "Room name" }).fill("Late nights");
  await night.getByRole("button", { name: "Save" }).click();
  await expect(gil.getByRole("heading", { name: "Late nights" })).toBeVisible();
  await expect(owner.getByRole("heading", { name: "Late nights" })).toBeVisible();

  await gil.getByRole("link", { name: "Rooms" }).click();
  await expect(gil).toHaveURL(/\/$/);
  await expect(gil.getByRole("link", { name: /Late nights/ })).toContainText("Owner");

  // The owner's list carries the gear.
  await owner.goto("/");
  await expect(owner.getByRole("heading", { name: "Rooms" })).toBeVisible();
  await expect(owner.getByRole("link", { name: /Late nights/ })).toContainText("No one here");
  await expect(owner.getByRole("link", { name: "Owner page" })).toBeVisible();

  // Access, from the room's side: a room shows everyone with a tick for who has it.
  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Rooms" }).click();
  await every.getByRole("listitem", { name: "First room" }).getByRole("button").click();
  const first = admin.getByRole("complementary", { name: "First room" });
  const gilHas = first.getByRole("checkbox", { name: /^Gil/ });
  await expect(gilHas).toBeChecked();
  await expect(first.getByRole("checkbox", { name: /^Owner/ })).toBeDisabled();

  // Unticking asks first, as from People, and the tick goes only once confirmed.
  await gilHas.click();
  const confirm = admin.getByRole("alertdialog", { name: "Remove Gil from First room?" });
  await expect(confirm).toContainText("Gil is not in First room now.");
  await expect(confirm).toContainText("They keep Late nights.");
  await expect(gilHas).toBeChecked();
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(gilHas).not.toBeChecked();

  // Ticking gives it back at once.
  await gilHas.click();
  await expect(gilHas).toBeChecked();
  await gil.goto("/");
  await expect(gil.getByRole("link", { name: /First room/ })).toBeVisible();
});
