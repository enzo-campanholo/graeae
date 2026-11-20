import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { inBar, SETUP_SECRET } from "./app.ts";

// The owner page's People section, with a second browser removed while it is present
// and sharing, and its share leaving the stage of the owner watching it.
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

  // The People section lists Jo, present; picked, Jo shows one room and one device.
  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "People" }).click();
  const members = admin.getByRole("region", { name: "Members" });
  const joRow = members.getByRole("button", { name: /^Jo\b/ });
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

  // Jo shares their webcam in the first room, and the owner watches it there.
  await inBar(jo).getByRole("button", { name: "Share webcam" }).click();
  await expect(jo.getByText("No one watching")).toBeVisible();
  const ownerRoom = await ownerContext.newPage();
  await ownerRoom.goto(jo.url());
  const stage = ownerRoom.getByRole("main", { name: "Stage" });
  const picture = stage.getByRole("img", { name: "Jo's webcam, with no picture" });
  await ownerRoom.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Jo's webcam" }).click();
  await expect(picture).toBeVisible();
  await expect(jo.getByText("Owner watching")).toBeVisible();

  // Unticking the first room asks first; the tick stays until then, and Cancel keeps it.
  await first.click();
  const confirm = admin.getByRole("alertdialog", { name: "Remove Jo from First room?" });
  await expect(confirm).toContainText("Jo is in First room now.");
  await expect(confirm).toContainText("Within about 2 seconds");
  await expect(confirm).toContainText("Their webcam share there ends for everyone watching.");
  await expect(confirm).toContainText("They keep Late nights.");
  await expect(first).toBeChecked();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(first).toBeChecked();
  await expect(jo.getByRole("heading", { name: "First room" })).toBeVisible();

  // Confirmed, Jo's webcam leaves the owner's stage, and Jo's page there becomes "nothing here", with no message.
  await first.click();
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(picture).toHaveCount(0, { timeout: CUT_OFF_MS });
  await expect(stage.getByText("No one is sharing yet.")).toBeVisible();
  await expect(jo.getByRole("heading", { name: "Nothing here" })).toBeVisible({ timeout: CUT_OFF_MS });
  await expect(confirm).toBeHidden();
  await expect(first).not.toBeChecked();
  await expect(second).toBeChecked();

  // Jo goes to the room they kept. Removing them from graeae says what it means.
  await jo.goto("/");
  await expect(jo.getByRole("heading", { name: "Late nights" })).toBeVisible();
  await panel.getByRole("button", { name: "Remove from graeae" }).click();
  const final = admin.getByRole("alertdialog", { name: "Remove Jo from graeae?" });
  // The confirm asks the instance afresh, so it knows where Jo is now.
  await expect(final).toContainText("Jo is in Late nights now.");
  await expect(final).toContainText("They aren't sharing anything.");
  await expect(final).toContainText("Their device is forgotten. Coming back takes a new invite.");
  await final.getByRole("button", { name: "Remove" }).click();
  await expect(jo.getByRole("heading", { name: "Nothing here" })).toBeVisible({ timeout: CUT_OFF_MS });
  await expect(members.getByRole("button", { name: /^Jo\b/ })).toHaveCount(0);
  await expect(members.getByRole("status").filter({ hasText: "removed" })).toHaveText("You removed Jo from graeae. Their devices are forgotten.");

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

test("the owner is warned beneath the list when a cut-off could not be confirmed", async ({ browser, baseURL }) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const admin = await ownerContext.newPage();
  await admin.goto(`/setup#${SETUP_SECRET}`);
  // "Rooms" after the journey before; "First room" when this one runs alone.
  await expect(admin.getByRole("heading", { name: /^(Rooms|First room)$/ })).toBeVisible();
  // The fake media server behind this app cannot be made to fail from here, so the
  // instance's own answer gains what it says when closes have failed for a minute.
  await admin.route("**/api/owner/people", async (route) => {
    const response = await route.fetch();
    const answer = await response.json();
    await route.fulfill({ response, json: { ...answer, unconfirmed: [{ member: "jo", name: "Jo" }] } });
  });

  await admin.goto("/owner/people");

  const warning = admin.getByRole("region", { name: "Members" }).getByRole("status").filter({ hasText: "Still trying" });
  await expect(warning).toHaveText("Still trying to stop what Jo was sharing and watching.");
  if (process.env.GRAEAE_SCREENSHOTS) {
    for (const colorScheme of ["dark", "light"] as const) {
      // The app is dark unless "You" says otherwise, whatever the system prefers.
      await admin.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
      await admin.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/unconfirmed-${colorScheme}.png` });
    }
  }
});
