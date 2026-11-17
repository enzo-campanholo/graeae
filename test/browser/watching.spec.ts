import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// Watching a webcam share between two browsers. The media on both sides is fake: the
// page's media client receives nothing and the instance's media server is in memory, so
// this covers what each member sees, not pictures. Journeys share one instance; this one
// names its member Jade, whom no other journey uses.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

test("a share is watched in one click, its sharer sees who watches, and it leaves the stage the three ways it can", async ({
  browser,
  baseURL,
}) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Jade" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;

  const jadeContext = await newBrowser(browser, baseURL);
  const jade = await jadeContext.newPage();
  await jade.goto(`/invite/${invite.code}`);
  await jade.getByRole("button", { name: "Join as Jade" }).click();
  await expect(jade).toHaveURL(room);
  await jade.getByRole("button", { name: "Share webcam" }).click();
  await expect(jade.getByText("No one watching")).toBeVisible();

  // Nothing is watched on arrival, and the stage says so.
  const stage = owner.getByRole("main", { name: "Stage" });
  const bar = owner.getByRole("region", { name: "Here" });
  await expect(stage.getByText("You're not watching anything yet.")).toBeVisible();
  const picture = stage.getByRole("img", { name: "Jade's webcam, with no picture" });
  await expect(picture).toHaveCount(0);

  // One click on the icon watches it: on the stage, the icon lit, and Jade sees who watches.
  await bar.getByRole("button", { name: "Watch Jade's webcam" }).click();
  await expect(picture).toBeVisible();
  await expect(stage.getByText("Jade", { exact: true })).toBeVisible();
  const lit = bar.getByRole("button", { name: "Stop watching Jade's webcam" });
  await expect(lit).toHaveAttribute("aria-pressed", "true");
  await expect(jade.getByText("Owner watching")).toBeVisible();

  // The icon again takes it off.
  await lit.click();
  await expect(picture).toHaveCount(0);
  await expect(stage.getByText("You're not watching anything yet.")).toBeVisible();
  await expect(jade.getByText("No one watching")).toBeVisible();

  // "Stop watching" on the share takes it off too.
  await bar.getByRole("button", { name: "Watch Jade's webcam" }).click();
  await expect(picture).toBeVisible();
  await picture.hover();
  await stage.getByRole("button", { name: "Stop watching Jade's webcam" }).click();
  await expect(picture).toHaveCount(0);
  await expect(jade.getByText("No one watching")).toBeVisible();

  // A share that ends leaves the stage of everyone watching it.
  await bar.getByRole("button", { name: "Watch Jade's webcam" }).click();
  await expect(picture).toBeVisible();
  await expect(jade.getByText("Owner watching")).toBeVisible();
  await jade.getByRole("button", { name: "Stop your webcam" }).click();
  await expect(picture).toHaveCount(0);
  await expect(stage.getByText("No one is sharing yet.")).toBeVisible();
});
