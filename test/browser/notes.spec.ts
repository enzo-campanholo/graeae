import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import type { StatsEntry } from "../../src/app/lib/media/sending.ts";
import { SETUP_SECRET } from "./app.ts";

// The notes a sharer sees on their own share, and the share stepping down by itself on a
// weak upload. The media is fake: a journey feeds the page the browser's statistics of
// its live share, through `window.graeaeFakeMedia.stats`, at times counted from the
// share's start, and they go through the same rule as a real browser's. Journeys share
// one instance; these name their members Quim and Rosa, whom no other journey uses.

/** The page's global, as a journey reads it inside `page.evaluate`. */
type Fake = { graeaeFakeMedia: FakeMediaControl };

const AT_48 = "Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60";
const UPLOAD = "Your upload can't carry 1080p";
const SOFTWARE = "Encoded in software";

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  // Pages first, so each member leaves cleanly and their shares end before the next journey.
  await Promise.all(opened.flatMap((context) => context.pages().map((page) => page.close())));
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

/** The owner in the first room, and a way to bring members into it. */
async function ownerInRoom(browser: Browser, baseURL: string | undefined) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();

  async function join(name: string): Promise<Page> {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    expect(made.status(), "the invite was refused").toBe(200);
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const page = await (await newBrowser(browser, baseURL)).newPage();
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await expect(page).toHaveURL(room);
    await expect(page.getByRole("link", { name: `${name} · you` })).toBeVisible();
    return page;
  }

  return { owner, join };
}

/** Shares `page`'s screen, through the first-time notice. */
async function shareScreen(page: Page) {
  await page.getByRole("button", { name: "Share screen" }).click();
  await page.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(page.getByRole("button", { name: "Screen live" })).toBeDisabled();
}

/**
 * The browser's statistics of `page`'s live screen share, read every 2 seconds from
 * `from` seconds after it started, `count` times, each giving `entries`.
 */
async function readings(page: Page, count: number, entries: StatsEntry[], from: number) {
  await page.evaluate(
    ({ count, entries, from }) => {
      for (let i = 0; i < count; i++)
        (globalThis as unknown as Fake).graeaeFakeMedia.stats("screen", entries, (from + i * 2) * 1000);
    },
    { count, entries, from },
  );
}

/** The two qualities of a Chromium screen share, the 1080p one `f` limited by the upload or not, and `h` running. */
function sent({ fps = 60, limited = false, software = false, f = true } = {}): StatsEntry[] {
  const encoder = { powerEfficientEncoder: !software };
  return [
    { type: "media-source", kind: "video", framesPerSecond: fps },
    { type: "outbound-rtp", kind: "video", rid: "f", active: f, qualityLimitationReason: limited ? "bandwidth" : "none", ...encoder },
    { type: "outbound-rtp", kind: "video", rid: "h", active: true, qualityLimitationReason: "none", ...encoder },
  ];
}

/** Whether `page`'s screen share sends its 1080p quality, and how many offers the page has made. */
async function sending(page: Page) {
  return page.evaluate(() => {
    const fake = (globalThis as unknown as Fake).graeaeFakeMedia;
    return { full: fake.sent.screen?.encodings[0]?.active, offers: fake.offers };
  });
}

test("a sharer is told, on their own share alone, of capture stuck at 48 fps and of software encoding", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const quim = await join("Quim");
  const own = quim.getByRole("figure").filter({ has: quim.getByRole("button", { name: "Stop your screen" }) });
  await expect(quim.getByText(AT_48)).toHaveCount(0);

  await shareScreen(quim);
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Quim's screen" }).click();
  await expect(owner.getByRole("img", { name: "Quim's screen, with no picture" })).toBeVisible();
  await expect(own).toBeVisible();
  await expect(quim.getByText(AT_48)).toHaveCount(0);

  // The capture settles near 48 fps: the note appears on the share, for its sharer alone.
  await readings(quim, 5, sent({ fps: 48 }), 0);
  await expect(own.getByText(AT_48)).toBeVisible();
  await expect(owner.getByText(AT_48)).toHaveCount(0);

  // The monitor is set to 120 Hz and the browser captures 60: the note goes by itself.
  await readings(quim, 5, sent({ fps: 60 }), 10);
  await expect(quim.getByText(AT_48)).toHaveCount(0);

  // Back at 48, it comes back; dismissed, it stays away while the capture stays at 48.
  await readings(quim, 5, sent({ fps: 48 }), 20);
  await expect(own.getByText(AT_48)).toBeVisible();
  await own.getByRole("button", { name: "Dismiss the note on 48 fps" }).click();
  await expect(quim.getByText(AT_48)).toHaveCount(0);
  await readings(quim, 5, sent({ fps: 48 }), 30);
  await expect(quim.getByText(AT_48)).toHaveCount(0);

  // Software encoding: a quiet line with nothing to dismiss, gone once the hardware takes over.
  await readings(quim, 1, sent({ fps: 60, software: true }), 40);
  await expect(own.getByText(SOFTWARE)).toBeVisible();
  await expect(own.getByRole("button", { name: /Dismiss/ })).toHaveCount(0);
  await expect(owner.getByText(SOFTWARE)).toHaveCount(0);
  await readings(quim, 1, sent({ fps: 60 }), 42);
  await expect(quim.getByText(SOFTWARE)).toHaveCount(0);
});

test("on a weak upload a share gives up 1080p, then 60 fps, steps back up, and never ends", async ({
  browser,
  baseURL,
}) => {
  const { owner, join } = await ownerInRoom(browser, baseURL);
  const rosa = await join("Rosa");
  const own = rosa.getByRole("figure").filter({ has: rosa.getByRole("button", { name: "Stop your screen" }) });
  await shareScreen(rosa);
  await owner.getByRole("region", { name: "Here" }).getByRole("button", { name: "Watch Rosa's screen" }).click();
  await expect(owner.getByRole("img", { name: "Rosa's screen, with no picture" })).toBeVisible();
  const { offers } = await sending(rosa);
  expect(await sending(rosa)).toEqual({ full: true, offers });

  // Once the share has settled, three readings in a row limited by the upload stop 1080p,
  // on the live share and with no new offer, and the sharer is told.
  await readings(rosa, 3, sent({ limited: true }), 10);
  await expect(own.getByText(`${UPLOAD}, so this share goes out at 720p.`)).toBeVisible();
  expect(await sending(rosa)).toEqual({ full: false, offers });
  await expect(owner.getByText(UPLOAD)).toHaveCount(0);

  // Still limited once 720p has settled: frame rate drops to 30.
  await readings(rosa, 3, sent({ limited: true, f: false }), 24);
  await expect(own.getByText(`${UPLOAD}, so this share goes out at 720p and 30 fps.`)).toBeVisible();

  // The note never blocks: it is dismissed, and the share is still live and can be stopped.
  await own.getByRole("button", { name: "Dismiss the note on your upload" }).click();
  await expect(rosa.getByText(UPLOAD)).toHaveCount(0);
  await expect(own.getByRole("button", { name: "Stop your screen" })).toBeEnabled();

  // However long it stays weak, the share stays live for its viewer.
  await readings(rosa, 30, sent({ limited: true, f: false }), 30);
  await expect(owner.getByRole("img", { name: "Rosa's screen, with no picture" })).toBeVisible();

  // The upload recovers: 30 seconds later a step back up, and 30 more, 1080p again.
  await readings(rosa, 16, sent({ f: false }), 90);
  await readings(rosa, 16, sent({ f: false }), 122);
  await expect.poll(() => sending(rosa)).toEqual({ full: true, offers });
  await expect(rosa.getByText(UPLOAD)).toHaveCount(0);
  await expect(owner.getByRole("img", { name: "Rosa's screen, with no picture" })).toBeVisible();
});
