import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// A webcam share between two browsers. The media on both sides is fake: the page's media
// client captures nothing and the instance's media server is in memory, so this covers
// what each member sees, not pictures. Journeys share one instance; this one names its
// member Iara, whom no other journey uses.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

test("a webcam share goes live in one click, shows on the other member's bar, and stops", async ({
  browser,
  baseURL,
}) => {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Iara" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;

  const iaraContext = await newBrowser(browser, baseURL);
  const iara = await iaraContext.newPage();
  await iara.goto(`/invite/${invite.code}`);
  await iara.getByRole("button", { name: "Join as Iara" }).click();
  await expect(iara).toHaveURL(room);
  const ownerHere = owner.getByRole("region", { name: "Here" });
  await expect(ownerHere.getByRole("button", { name: "Iara" })).toBeVisible();
  const iarasWebcam = ownerHere.getByRole("button", { name: "Watch Iara's webcam" });
  await expect(iarasWebcam).toHaveCount(0);

  // One click, and no dialog: the share is live for both.
  await iara.getByRole("button", { name: "Share webcam" }).click();
  await expect(iara.getByRole("img", { name: "Your webcam, with no picture" })).toBeVisible();
  await expect(iara.getByText("No one watching")).toBeVisible();
  await expect(iara.getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await expect(iarasWebcam).toBeVisible();
  await expect(owner.getByText("You're not watching anything yet.")).toBeVisible();

  // Stop ends it for everyone.
  await iara.getByRole("button", { name: "Stop your webcam" }).click();
  await expect(iara.getByRole("img", { name: "Your webcam, with no picture" })).toHaveCount(0);
  await expect(iarasWebcam).toHaveCount(0);
  await expect(iara.getByRole("button", { name: "Share webcam" })).toBeEnabled();
  await expect(owner.getByText("No one is sharing yet.")).toBeVisible();

  // Sharing again, then leaving: a clean leave ends the share too.
  await iara.getByRole("button", { name: "Share webcam" }).click();
  await expect(iarasWebcam).toBeVisible();
  await iara.close();
  await expect(iarasWebcam).toHaveCount(0);
  await expect(ownerHere.getByRole("button", { name: "Iara" })).toHaveCount(0);
});
