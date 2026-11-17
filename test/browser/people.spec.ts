import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { SETUP_SECRET } from "./app.ts";

// The owner page's People section, with a second browser removed while it is present.
// It needs the owner's two rooms, so it runs in the "several rooms" project after
// rooms.spec.ts (see playwright.config.ts). Its member is Jo, whom no other journey uses.

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

/** About 2 seconds is the promise for a removal; a little slack for a loaded machine. */
const CUT_OFF_MS = 3_000;

test("the owner grants a room, then removes a present member from a room and from graeae", async ({
  browser,
  baseURL,
}) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const admin = await ownerContext.newPage();
  await admin.goto(`/setup#${SETUP_SECRET}`);
  await expect(admin.getByRole("heading", { name: "Rooms" })).toBeVisible();

  // Jo is invited to the first room alone, and lands in it.
  await admin.goto("/owner/invites");
  const form = admin.getByRole("form", { name: "New invite" });
  await form.getByLabel("Display name").fill("Jo");
  await form.getByRole("button", { name: "Create and copy link" }).click();
  const link = (await admin.getByLabel("Invite link").textContent())!.trim();
  const joContext = await newBrowser(browser, baseURL);
  const jo = await joContext.newPage();
  await jo.goto(link);
  await jo.getByRole("button", { name: "Join as Jo" }).click();
  await expect(jo.getByRole("heading", { name: "First room" })).toBeVisible();
  await expect(jo.getByRole("link", { name: "Rooms" })).toHaveCount(0);

  // The People section lists Jo, present, with one room and one device.
  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "People" }).click();
  const members = admin.getByRole("region", { name: "Members" });
  const joRow = members.getByRole("button", { name: /^Jo\b/ });
  await expect(joRow).toContainText("First room");
  await expect(joRow).toContainText("Here now");
  await joRow.click();
  const panel = admin.getByRole("complementary", { name: "Jo" });
  await expect(panel.getByText("Present in First room")).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(3); // two rooms, one device

  // Ticking the second room grants it at once, and Jo's bar gains the link back.
  const second = panel.getByRole("checkbox", { name: /^Late nights/ });
  const first = panel.getByRole("checkbox", { name: /^First room/ });
  await second.click();
  await expect(second).toBeChecked();
  await expect(jo.getByRole("link", { name: "Rooms" })).toBeVisible();

  // Unticking the first room asks first; the tick stays until then, and Cancel keeps it.
  await first.click();
  const confirm = admin.getByRole("alertdialog", { name: "Remove Jo from First room?" });
  await expect(confirm).toContainText("Jo is in First room now.");
  await expect(confirm).toContainText("within about 2 seconds");
  await expect(confirm).toContainText("They keep Late nights.");
  await expect(first).toBeChecked();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(first).toBeChecked();
  await expect(jo.getByRole("heading", { name: "First room" })).toBeVisible();

  // Confirmed, Jo's page there becomes "nothing here", with no message.
  await first.click();
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(jo.getByRole("heading", { name: "Nothing here" })).toBeVisible({ timeout: CUT_OFF_MS });
  await expect(confirm).toBeHidden();
  await expect(first).not.toBeChecked();
  await expect(joRow).toContainText("Late nights");

  // Jo goes to the room they kept. Removing them from graeae says what it means.
  await jo.goto("/");
  await expect(jo.getByRole("heading", { name: "Late nights" })).toBeVisible();
  await panel.getByRole("button", { name: "Remove from graeae" }).click();
  const final = admin.getByRole("alertdialog", { name: "Remove Jo from graeae?" });
  // The confirm asks the instance afresh, so it knows where Jo is now.
  await expect(final).toContainText("Jo is present in Late nights.");
  await expect(final).toContainText("Their device is forgotten. Coming back takes a new invite.");
  await final.getByRole("button", { name: "Remove" }).click();
  await expect(jo.getByRole("heading", { name: "Nothing here" })).toBeVisible({ timeout: CUT_OFF_MS });
  await expect(members.getByRole("button", { name: /^Jo\b/ })).toHaveCount(0);
  await expect(members.getByRole("status")).toHaveText("Jo is removed from graeae, and their devices are forgotten.");

  // The browser is a stranger now, everywhere.
  await jo.goto("/you");
  await expect(jo.getByRole("heading", { name: "Nothing here" })).toBeVisible();

  // The owner's own entry has no untick and no "Remove from graeae".
  await members.getByRole("button", { name: /^Owner\b/ }).click();
  const own = admin.getByRole("complementary", { name: "Owner" });
  await expect(own.getByRole("checkbox", { name: /^First room/ })).toBeDisabled();
  await expect(own.getByRole("checkbox", { name: /^First room/ })).toBeChecked();
  await expect(own.getByRole("button", { name: "Remove from graeae" })).toHaveCount(0);
  await expect(own.getByRole("button", { name: "Let back in" })).toHaveCount(0);
});
