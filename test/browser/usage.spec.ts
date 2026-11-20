import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import { inBar, SETUP_SECRET } from "./app.ts";

// Usage: what a watching tab reports, and the owner's meter. The media is fake: a journey
// says what the tab's media connection has received. Journeys share one instance, so the
// meter is read for how much it rises, not for what it shows. Members Lia and Nell are
// this file's alone.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  // Its tabs report every 5 seconds, not once a minute, so the journey need not wait for them.
  await context.addInitScript(() => {
    (globalThis as { graeaeFakeMedia?: Partial<FakeMediaControl> }).graeaeFakeMedia = { reportEvery: 5_000 };
  });
  opened.push(context);
  return context;
}

/** The owner in the first room, and `name` joined from a browser of their own with a webcam live. */
async function ownerAndSharer(browser: Browser, baseURL: string | undefined, name: string) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const memberContext = await newBrowser(browser, baseURL);
  const member = await memberContext.newPage();
  await member.goto(`/invite/${invite.code}`);
  await member.getByRole("button", { name: `Join as ${name}` }).click();
  await expect(member).toHaveURL(owner.url());
  await inBar(member).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(member).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  return { owner, ownerContext, member };
}

/** Says what `page`'s media connection has received since it opened, and whether it is on the relay. */
async function received(page: Page, bytes: number, relayed = false) {
  await page.evaluate(
    ([bytes, relayed]) => {
      const control = (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia;
      control.bytes = bytes;
      control.relayed = relayed;
    },
    [bytes, relayed] as const,
  );
}

/** The usage reports `page` sends on its sockets, as they are sent. */
function reports(page: Page): unknown[] {
  const sent: unknown[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", (frame) => {
      const message = JSON.parse(String(frame.payload)) as { type?: string; request?: unknown };
      if (message.type === "usage") sent.push(message.request);
    }),
  );
  return sent;
}

/** The meter at the foot of the owner page's navigation, in GB, as it reads after a fresh load. */
async function meterReading(page: Page): Promise<number> {
  await page.reload();
  const meter = page.getByRole("complementary").getByRole("meter", { name: "Usage this month" });
  await expect(meter).toBeVisible();
  return Number(await meter.getAttribute("aria-valuenow"));
}

test("a tab reports what its media connection has received, and its final total when the connection is dropped", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { owner, member: lia } = await ownerAndSharer(browser, baseURL, "Lia");
  const sent = reports(owner);
  await owner.reload();
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Lia's webcam" }).click();
  await expect(owner.getByRole("main", { name: "Stage" }).getByRole("img", { name: "Lia's webcam, with no picture" })).toBeVisible();

  // Every few seconds here (once a minute in a real tab), the running total since the connection opened.
  await received(owner, 1_234);
  await expect.poll(() => sent, { timeout: 10_000 }).toContainEqual({ type: "received", bytes: 1_234, relayed: false });
  await received(owner, 5_000, true);
  await expect.poll(() => sent, { timeout: 10_000 }).toContainEqual({ type: "received", bytes: 5_000, relayed: true });

  // Lia's media connection, which only sends, falters until the instance drops it with
  // her share: her tab sends its final total first, and nothing more of that connection.
  const fromLia = reports(lia);
  await lia.reload();
  await inBar(lia).getByRole("button", { name: "Share webcam" }).click();
  await expect(inBar(lia).getByRole("button", { name: "Webcam live" })).toBeDisabled();
  await received(lia, 700);
  await expect.poll(() => fromLia, { timeout: 10_000 }).toContainEqual({ type: "received", bytes: 700, relayed: false });
  await lia.evaluate(() => (globalThis as unknown as { graeaeFakeMedia: FakeMediaControl }).graeaeFakeMedia.falter());
  await expect(inBar(lia).getByRole("button", { name: "Share webcam" })).toBeEnabled({ timeout: 45_000 });
  await expect
    .poll(() => fromLia.at(-1), { timeout: 5_000 })
    .toEqual({ type: "received", bytes: 700, relayed: false, final: true });
  const count = fromLia.length;
  await lia.waitForTimeout(6_000);
  expect(fromLia).toHaveLength(count);

  await lia.close();
  await owner.close();
});

test("the owner's meter shows what members have watched, members see nothing of it, and the owner sets the reset day", async ({
  browser,
  baseURL,
}) => {
  const { owner, ownerContext, member: nell } = await ownerAndSharer(browser, baseURL, "Nell");
  const admin = await ownerContext.newPage();
  await admin.goto("/owner/people");
  const before = await meterReading(admin);

  // The owner watches Nell's webcam, and receives 40 GB: 40 GB is counted, with no margin on top.
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Nell's webcam" }).click();
  await expect(owner.getByRole("main", { name: "Stage" }).getByRole("img", { name: "Nell's webcam, with no picture" })).toBeVisible();
  await received(owner, 40_000_000_000);
  await expect.poll(async () => (await meterReading(admin)) - before, { timeout: 20_000 }).toBeCloseTo(40, 0);

  // Members see nothing about usage: not in the room, and not the owner page.
  await expect(nell.getByRole("meter")).toHaveCount(0);
  await expect(nell.getByText(/usage/i)).toHaveCount(0);
  await nell.goto("/owner/usage");
  await expect(nell.getByRole("heading", { name: "Nothing here" })).toBeVisible();

  // The Usage section: GB used, the usage budget, and the month projected to its end.
  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Usage", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  const month = admin.getByRole("region", { name: "This month" });
  await expect(month.getByRole("meter", { name: "Usage this month" })).toBeVisible();
  await expect(month.getByLabel("Used")).toHaveText(/^[\d,.]+ GB$/);
  await expect(month.getByLabel("Usage budget")).toHaveText("1,000 GB");
  await expect(month.getByLabel("Projected by the month's end")).toHaveText(/^[\d,.]+ GB$/);
  // The pace beside it, and what the month costs past what Cloudflare includes.
  await expect(month.getByText(/^Members have used \d+% of the usage budget by day \d+ of \d+\.$/)).toBeVisible();
  await expect(month.getByLabel("Included by Cloudflare")).toHaveText("1,000 GB");
  await expect(month.getByLabel("Cost so far")).toHaveText("$0.00");
  if (process.env.GRAEAE_SCREENSHOTS) {
    for (const colorScheme of ["dark", "light"] as const) {
      await admin.evaluate(`document.documentElement.classList.toggle("dark", ${colorScheme === "dark"})`);
      // Past the colours' 150ms transitions.
      await admin.waitForTimeout(400);
      await admin.screenshot({ path: `${process.env.GRAEAE_SCREENSHOTS}/usage-${colorScheme}.png` });
    }
    await admin.evaluate(`document.documentElement.classList.toggle("dark", true)`);
  }

  // The reset day: the 1st until the owner sets another, which moves the month.
  const resets = admin.getByRole("form", { name: "Reset day" });
  const day = resets.getByRole("spinbutton", { name: "Day of the month" });
  await expect(day).toHaveValue("1");
  await day.fill("15");
  await resets.getByRole("button", { name: "Save" }).click();
  await expect(resets.getByText(/^Next reset 15 [A-Z][a-z]+, at midnight UTC\.$/)).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole("form", { name: "Reset day" }).getByRole("spinbutton")).toHaveValue("15");

  // A day that is no day of the month is refused, and the setting stays.
  await admin.getByRole("form", { name: "Reset day" }).getByRole("spinbutton").fill("32");
  await admin.getByRole("form", { name: "Reset day" }).getByRole("button", { name: "Save" }).click();
  await expect(admin.getByRole("form", { name: "Reset day" }).getByRole("alert")).toHaveText(
    "Pick a day from 1 to 31.",
  );

  // Back to the 1st for the journeys after this one.
  await admin.getByRole("form", { name: "Reset day" }).getByRole("spinbutton").fill("1");
  await admin.getByRole("form", { name: "Reset day" }).getByRole("button", { name: "Save" }).click();
  await expect(admin.getByRole("form", { name: "Reset day" }).getByText(/^Next reset 1 [A-Z][a-z]+, at midnight UTC\.$/)).toBeVisible();

  await nell.close();
  await owner.close();
});
