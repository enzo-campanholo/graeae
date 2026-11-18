import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// Journeys share one instance, so members from other journeys may be in the room's
// "Not here" list too. This one names its member Edu, whom no other journey uses.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

test("two members see each other arrive, leave and come back in the bar", async ({ browser, baseURL }) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const ownerHere = owner.getByRole("region", { name: "Here" });
  const ownerAway = owner.getByRole("region", { name: "Not here" });
  await expect(ownerHere.getByRole("link", { name: /Owner/ })).toContainText("you");

  // The owner's invite, made the way the owner page makes it.
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Edu" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;

  // Edu joins and lands in the room: each sees the other present.
  const eduContext = await newBrowser(browser, baseURL);
  const edu = await eduContext.newPage();
  await edu.goto(`/invite/${invite.code}`);
  await edu.getByRole("button", { name: "Join as Edu" }).click();
  await expect(edu).toHaveURL(room);
  const eduHere = edu.getByRole("region", { name: "Here" });
  await expect(eduHere.getByRole("link", { name: /Edu/ })).toContainText("you");
  await expect(eduHere.getByRole("button", { name: "Owner" })).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toBeVisible();
  await expect(ownerAway.getByText("Edu", { exact: true })).toHaveCount(0);

  // A second tab, then closing one of the two: Edu is listed once and still here.
  const second = await eduContext.newPage();
  await second.goto(room);
  await expect(second.getByRole("region", { name: "Here" }).getByRole("link", { name: /Edu/ })).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toHaveCount(1);
  await second.close();
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toBeVisible();

  // Closing the last tab moves Edu to "Not here" at once; coming back moves them up again.
  await edu.close();
  await expect(ownerAway.getByText("Edu", { exact: true })).toBeVisible();
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toHaveCount(0);
  const back = await eduContext.newPage();
  await back.goto(room);
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toBeVisible();

  // Edu's own name opens "You" in a new tab, so Edu stays here.
  const [you] = await Promise.all([eduContext.waitForEvent("page"), back.getByRole("link", { name: /Edu/ }).click()]);
  await expect(you).toHaveURL(/\/you$/);
  await you.close();
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toBeVisible();

  // Navigating away within the app is a clean leave too: here, the browser's Back and
  // Forward moving the page to "You", since Edu's links out of the room open new tabs.
  await back.evaluate("history.pushState(null, '', '/you'); dispatchEvent(new PopStateEvent('popstate'))");
  await expect(back).toHaveURL(/\/you$/);
  await expect(ownerAway.getByText("Edu", { exact: true })).toBeVisible();
  await back.goBack();
  await expect(ownerHere.getByRole("button", { name: "Edu" })).toBeVisible();

  // The folded bar keeps the present members as initials.
  await foldBar(owner);
  await expect(owner.getByRole("button", { name: "Follow Edu" })).toHaveText("E");
});

async function foldBar(page: Page) {
  await page.getByRole("button", { name: "Hide the bar" }).click();
  await expect(page.getByRole("button", { name: "Show the bar" })).toBeVisible();
}
