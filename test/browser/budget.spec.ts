import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { GIGABYTE, type CreateInviteAnswer, type UsageAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { SETUP_SECRET } from "./app.ts";

// The usage budget: the owner's warning strip at 80%, everyone's at 95%, the stopped
// stage at the limit, and the confirm that raises the budget again. The media is fake: the
// journey says what the owner's watching tab has received. Journeys share one instance, so
// the budget is set just above what earlier journeys used, and put back to 1,000 GB at the
// end. Member Rui is this file's alone.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

/** Says what `page`'s media connection has received since it opened. */
async function received(page: Page, bytes: number) {
  await page.evaluate((bytes) => {
    (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.bytes = bytes;
  }, bytes);
}

async function screenshot(page: Page, name: string) {
  if (!process.env.GRAEAE_SCREENSHOTS) return;
  for (const colorScheme of ["dark", "light"] as const) {
    await page.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
    // Past the colours' 150ms transitions and the strip's arrival.
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/${name}-${colorScheme}.png` });
  }
  await page.evaluate(`document.documentElement.classList.toggle("dark", true)`);
}

test("the warnings, the stop at the usage budget, and the confirm that raises it", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Rui" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const rui = await (await newBrowser(browser, baseURL)).newPage();
  await rui.goto(`/invite/${invite.code}`);
  await rui.getByRole("button", { name: "Join as Rui" }).click();
  await expect(rui).toHaveURL(owner.url());
  await rui.getByRole("button", { name: "Share webcam" }).click();
  await expect(rui.getByRole("button", { name: "Webcam live" })).toBeDisabled();

  const ownerStage = owner.getByRole("main", { name: "Stage" });
  const ruiStage = rui.getByRole("main", { name: "Stage" });
  const watchRui = owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Rui's webcam" });
  const picture = ownerStage.getByRole("img", { name: "Rui's webcam, with no picture" });
  await watchRui.click();
  await expect(picture).toBeVisible();

  // The budget, set just above what earlier journeys used: lowering it asks nothing.
  const admin = await ownerContext.newPage();
  await admin.goto("/owner/usage");
  const before = ((await (await ownerContext.request.get("/api/owner/usage")).json()) as UsageAnswer).used;
  const budget = Math.ceil(before / GIGABYTE) + 10;
  const form = admin.getByRole("form", { name: "Usage budget" });
  const field = form.getByRole("spinbutton", { name: "GB a month" });
  try {
    await expect(field).toHaveValue("1000");
    await expect(form.getByText("$0.00 a month")).toBeVisible();
    await field.fill(String(budget));
    await form.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("region", { name: "This month" }).getByLabel("Usage budget")).toHaveText(
      `${budget.toLocaleString("en")} GB`,
    );
    await expect(admin.getByRole("alertdialog")).toHaveCount(0);

    /** Has the owner's watching tab take the month to `share` of the budget, the 5% margin added on top. */
    const reach = (share: number) => received(owner, Math.ceil((budget * share * GIGABYTE - before) / 1.05));

    // 80%: the owner's strip, with the way to Usage; Rui hears nothing.
    await reach(0.82);
    const ownerStrip = ownerStage.getByRole("status").filter({ hasText: "usage budget" });
    await expect(ownerStrip).toHaveText(/Usage is past 80% of this month's usage budget\./, { timeout: 15_000 });
    await expect(ownerStrip.getByRole("link", { name: "Usage" })).toHaveAttribute("href", "/owner/usage");
    await expect(rui.getByText(/usage/i)).toHaveCount(0);
    await expect(picture).toBeVisible();
    await screenshot(owner, "budget-80");

    // 95%: everyone's strip, which says what happens at the limit.
    await reach(0.96);
    const ruiStrip = ruiStage.getByRole("status").filter({ hasText: "usage budget" });
    await expect(ruiStrip).toHaveText(
      /Usage is past 95% of this month's usage budget\. Watching stops for everyone when it runs out\./,
      { timeout: 15_000 },
    );
    await expect(ruiStrip.getByRole("link")).toHaveCount(0);
    await expect(ownerStrip).toHaveText(/past 95%/);
    await expect(picture).toBeVisible();
    await screenshot(rui, "budget-95");

    // The limit: the watching stops, the stage says why, and Rui's share stays live.
    await reach(1.02);
    await expect(ownerStage.getByText("This month's usage budget is used up.")).toBeVisible({ timeout: 15_000 });
    await expect(picture).toHaveCount(0);
    await expect(ownerStage.getByText("Watching stops until the month resets or you raise it. Shares stay live.")).toBeVisible();
    await expect(ownerStage.getByRole("link", { name: "Raise it in Usage" })).toHaveAttribute("href", "/owner/usage");
    await expect(ruiStage.getByText("This month's usage budget is used up.")).toBeVisible();
    await expect(
      ruiStage.getByText("Watching stops until the month resets or the owner raises it. Shares stay live."),
    ).toBeVisible();
    await expect(ownerStage.getByRole("status").filter({ hasText: "usage budget" })).toHaveCount(0);
    await expect(rui.getByRole("button", { name: "Webcam live" })).toBeDisabled();
    // A new watch is refused: the stage stays as it is.
    await watchRui.click();
    await owner.waitForTimeout(1_000);
    await expect(picture).toHaveCount(0);
    await screenshot(owner, "budget-used-up");
    await screenshot(rui, "budget-used-up-member");

    // Raising it takes one confirm that names the most it can add; Cancel changes nothing.
    await admin.reload();
    await field.fill("2000");
    await expect(form.getByText("Up to $50.00 a month")).toBeVisible();
    await form.getByRole("button", { name: "Save" }).click();
    const confirm = admin.getByRole("alertdialog", { name: "Raise the usage budget to 2,000 GB?" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("This can add up to $50.00 a month to your Cloudflare bill.");
    await screenshot(admin, "budget-confirm");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(admin.getByRole("region", { name: "This month" }).getByLabel("Usage budget")).toHaveText(
      `${budget.toLocaleString("en")} GB`,
    );
    await form.getByRole("button", { name: "Save" }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Raise to 2,000 GB" }).click();
    await expect(admin.getByRole("alertdialog")).toHaveCount(0);
    await expect(admin.getByRole("region", { name: "This month" }).getByLabel("Usage budget")).toHaveText("2,000 GB");
    await screenshot(admin, "budget-usage");

    // Watching is allowed again at once.
    await expect(ownerStage.getByText("This month's usage budget is used up.")).toHaveCount(0);
    await expect(ruiStage.getByText("This month's usage budget is used up.")).toHaveCount(0);
    await watchRui.click();
    await expect(picture).toBeVisible();

    // Setting it below what is used says so before it is saved, and stops watching at once.
    await field.fill(String(budget - 5));
    await expect(form.getByRole("status")).toHaveText(/watching stops\s+for everyone once it is saved\./);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(ownerStage.getByText("This month's usage budget is used up.")).toBeVisible({ timeout: 10_000 });
    await expect(picture).toHaveCount(0);
  } finally {
    // Back to 1,000 GB for the journeys after this one.
    await ownerContext.request.put("/api/owner/usage/budget", { data: { gigabytes: 1_000 } });
  }
  await expect(ownerStage.getByText("This month's usage budget is used up.")).toHaveCount(0);
  await expect(ownerStage.getByRole("status").filter({ hasText: "usage budget" })).toHaveCount(0);
});
