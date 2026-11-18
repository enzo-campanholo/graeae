// The states `?sample` does not have, reached through real journeys on the fake-media
// build, as Seam 2 runs it. Fake media has no pictures, so tiles and previews here are
// empty; the room's look with pictures is in samples.capture.ts. One instance, started
// empty, and one long journey through it, since each state builds on the last.

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { GIGABYTE, type CreateInviteAnswer, type UsageAnswer } from "../../src/shared/api.ts";
import type { FakeMediaControl } from "../../src/app/lib/media/fake-control.ts";
import type { StatsEntry } from "../../src/app/lib/media/sending.ts";
import { SETUP_SECRET } from "../../test/browser/app.ts";
import { shoot } from "./shoot.ts";

type Fake = { graeaeFakeMedia: FakeMediaControl };

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.flatMap((context) => context.pages().map((page) => page.close())));
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 953 } });
  opened.push(context);
  return context;
}

const stageOf = (page: Page) => page.getByRole("main", { name: "Stage" });
const hereOf = (page: Page) => page.getByRole("region", { name: "Here", exact: true });

async function shareWebcam(page: Page) {
  await page.getByRole("button", { name: "Share webcam" }).click();
  await expect(page.getByRole("button", { name: "Stop your webcam" })).toBeVisible();
}

/** Shares a screen through the first-time notice, on the fake picker's default: a tab with its sound. */
async function shareScreen(page: Page) {
  await page.getByRole("button", { name: "Share screen" }).click();
  await page.getByRole("dialog", { name: "Before you pick" }).getByRole("button", { name: "Choose what to share" }).click();
  await expect(page.getByRole("button", { name: "Stop your screen" })).toBeVisible();
}

/** The browser's statistics of `page`'s live screen share, `count` readings 2 seconds apart from `from` seconds. */
async function readings(page: Page, count: number, entries: StatsEntry[], from: number) {
  await page.evaluate(
    ({ count, entries, from }) => {
      for (let i = 0; i < count; i++)
        (globalThis as unknown as Fake).graeaeFakeMedia.stats("screen", entries, (from + i * 2) * 1000);
    },
    { count, entries, from },
  );
}

/** A Chromium screen share's two qualities as the browser reports them. */
function sent({ fps = 60, software = false } = {}): StatsEntry[] {
  const each = { powerEfficientEncoder: !software, qualityLimitationReason: "none" };
  return [
    { type: "media-source", kind: "video", framesPerSecond: fps },
    { type: "outbound-rtp", kind: "video", rid: "f", active: true, ...each },
    { type: "outbound-rtp", kind: "video", rid: "h", active: true, ...each },
  ];
}

test("every state of the room and the owner page the samples lack", async ({ browser, baseURL }) => {
  test.setTimeout(480_000);

  // A stranger: every address is "nothing here", a refused setup secret included.
  const stranger = await (await newBrowser(browser, baseURL)).newPage();
  await stranger.goto("/somewhere-else");
  await expect(stranger.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await shoot(stranger, "nothing-here--stranger");

  // Setup. This instance has every secret, so the answer gains two missing ones, as a
  // deploy without them would say; the owner is made all the same.
  const ownerContext = await newBrowser(browser, baseURL);
  await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const owner = await ownerContext.newPage();
  await owner.route("**/api/setup", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), missing: ["TURN_KEY_ID", "TURN_KEY_TOKEN"] } });
  });
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "This browser is yours, but secrets are missing" })).toBeVisible();
  await shoot(owner, "setup--secrets-missing");
  await owner.unroute("**/api/setup");
  await owner.getByRole("button", { name: "Go to the room" }).click();
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  await shoot(owner, "room--owner-alone");

  /** A member joins from their own browser. `gated` routes their socket through a switch that can go dead. */
  async function join(name: string, gated?: { online: boolean }): Promise<Page> {
    const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
    expect(made.status(), "the invite was refused").toBe(200);
    const { invite } = (await made.json()) as CreateInviteAnswer;
    const page = await (await newBrowser(browser, baseURL)).newPage();
    if (gated)
      await page.routeWebSocket(/\/api\/socket/, (socket) => {
        if (!gated.online) return;
        const instance = socket.connectToServer();
        socket.onMessage((message) => gated.online && instance.send(message));
        instance.onMessage((message) => gated.online && socket.send(message));
        socket.onClose((code, reason) => {
          if (gated.online) void instance.close({ code, reason });
        });
      });
    await page.goto(`/invite/${invite.code}`);
    await page.getByRole("button", { name: `Join as ${name}` }).click();
    await expect(page).toHaveURL(room);
    await expect(page.getByRole("link", { name: `${name} · you` })).toBeVisible();
    return page;
  }

  // Four members: Bia and Caio share screens with sound, Bia and Duda webcams.
  const bia = await join("Bia");
  await shareScreen(bia);
  await shareWebcam(bia);
  const caio = await join("Caio");
  await shareScreen(caio);
  const dudaLine = { online: true };
  const duda = await join("Duda", dudaLine);
  await shareWebcam(duda);
  await join("Eli");

  // The owner's first screen share asks first.
  await owner.getByRole("button", { name: "Share screen" }).click();
  const notice = owner.getByRole("dialog", { name: "Before you pick" });
  await expect(notice).toBeVisible();
  await shoot(owner, "room--screen-notice");
  await notice.getByRole("button", { name: "Cancel" }).click();
  await shareWebcam(owner);

  // Watching everything: four shares, no pictures.
  const stage = stageOf(owner);
  await owner.getByRole("button", { name: "Everything", exact: true }).click();
  await expect(stage.getByRole("figure")).toHaveCount(4);
  await owner.mouse.move(0, 0);
  await shoot(owner, "room--everything");

  // The hover pill on a screen with sound, beside another with sound: mute, volume, "Hear only".
  const biaScreen = stage
    .getByRole("figure")
    .filter({ has: owner.getByRole("img", { name: "Bia's screen, with no picture" }) });
  await shoot(owner, "room--hover-sound", { redo: () => biaScreen.hover() });
  await biaScreen.hover();
  await stage.getByRole("button", { name: "Mute Bia's screen" }).click();
  await owner.mouse.move(0, 0);
  await shoot(owner, "room--muted-caption");
  await biaScreen.hover();
  await stage.getByRole("button", { name: "Unmute Bia's screen" }).click();

  // Focused, with the strip, and the strip's smaller pill.
  await biaScreen.hover();
  await stage.getByRole("button", { name: "Focus Bia's screen" }).click();
  await expect(stage.getByRole("button", { name: "Back to the grid" })).toBeAttached();
  await owner.mouse.move(0, 0);
  await shoot(owner, "room--focus");
  const stripTile = stage.getByRole("figure").last();
  await shoot(owner, "room--focus-strip-hover", { redo: () => stripTile.hover() });
  await stage.getByRole("figure").first().hover();
  await stage.getByRole("button", { name: "Back to the grid" }).click();

  // The rail, with everyone in it.
  await owner.getByRole("button", { name: "Hide the bar" }).click();
  await expect(owner.getByRole("button", { name: "Show the bar" })).toBeVisible();
  await owner.mouse.move(0, 0);
  await shoot(owner, "room--rail");
  await owner.getByRole("button", { name: "Show the bar" }).click();

  // The sharer's side: own previews with their watchers, and the notes.
  const own = bia.getByRole("figure").filter({ has: bia.getByRole("button", { name: "Stop your screen" }) });
  await expect(bia.getByText("Owner watching").first()).toBeVisible();
  await shoot(bia, "room--sharer");
  await readings(bia, 5, sent({ fps: 48, software: true }), 0);
  await expect(own.getByText(/Capturing at 48 fps/)).toBeVisible();
  await shoot(bia, "room--sharer-notes");

  // A second tab of Bia's, offered the webcam she shares from the first.
  const biaTab = await bia.context().newPage();
  await biaTab.goto(room);
  await expect(biaTab.getByRole("link", { name: "Bia · you" })).toBeVisible();
  await biaTab.getByRole("button", { name: "Share webcam" }).click();
  await expect(biaTab.getByRole("dialog", { name: "Your webcam is already live" })).toBeVisible();
  await shoot(biaTab, "room--handover-offer");
  await biaTab.getByRole("dialog", { name: "Your webcam is already live" }).getByRole("button", { name: "Cancel" }).click();
  await biaTab.close();

  // Duda's line goes dead: her own tab shows "Reconnecting…" after about 3 seconds, and the
  // others see her as reconnecting after about 10.
  dudaLine.online = false;
  await expect(duda.getByText("Reconnecting…")).toBeVisible({ timeout: 15_000 });
  await shoot(duda, "room--reconnecting-pill");
  await expect(hereOf(owner).getByRole("button", { name: /^Duda/ })).toContainText("· reconnecting", { timeout: 20_000 });
  await owner.mouse.move(0, 0);
  await shoot(owner, "room--member-reconnecting");
  dudaLine.online = true;
  await expect(hereOf(owner).getByRole("button", { name: /^Duda/ })).not.toContainText("reconnecting", { timeout: 15_000 });

  // The owner page, with everyone present.
  const admin = await ownerContext.newPage();
  await admin.goto("/owner/people");
  const members = admin.getByRole("region", { name: "Members" });
  await expect(members.getByRole("button", { name: /^Bia\b/ })).toContainText("Here now");
  await shoot(admin, "owner--people");
  await members.getByRole("button", { name: /^Bia\b/ }).click();
  const panel = admin.getByRole("complementary", { name: "Bia" });
  await expect(panel).toBeVisible();
  await shoot(admin, "owner--people-member");
  await panel.getByRole("checkbox", { name: /^First room/ }).click();
  const untick = admin.getByRole("alertdialog", { name: "Remove Bia from First room?" });
  await expect(untick).toBeVisible();
  await shoot(admin, "owner--untick-confirm");
  await untick.getByRole("button", { name: "Cancel" }).click();
  await panel.getByRole("button", { name: "Remove from graeae" }).click();
  const removal = admin.getByRole("alertdialog", { name: "Remove Bia from graeae?" });
  await expect(removal).toBeVisible();
  await shoot(admin, "owner--removal-modal");
  await removal.getByRole("button", { name: "Cancel" }).click();

  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Invites" }).click();
  const form = admin.getByRole("form", { name: "New invite" });
  await form.getByLabel("Display name").fill("Fê");
  await form.getByRole("button", { name: "Create and copy link" }).click();
  await expect(admin.getByText("Fê's link is on your clipboard")).toBeVisible();
  const link = (await admin.getByLabel("Invite link").textContent())!.trim();
  await shoot(admin, "owner--invites");

  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Rooms" }).click();
  await admin.getByLabel("Room name").fill("Late shift");
  await admin.getByRole("button", { name: "Create room" }).click();
  await expect(admin.getByRole("region", { name: "Every room" }).getByRole("listitem", { name: "Late shift" })).toBeVisible();
  await shoot(admin, "owner--rooms");

  await admin.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: "Usage" }).click();
  const budgetForm = admin.getByRole("form", { name: "Usage budget" });
  const budgetField = budgetForm.getByRole("spinbutton", { name: "GB a month" });
  await expect(budgetField).toHaveValue("1000");
  await shoot(admin, "owner--usage");
  await budgetField.fill("2000");
  await budgetForm.getByRole("button", { name: "Save" }).click();
  const raise = admin.getByRole("alertdialog");
  await expect(raise).toBeVisible();
  await shoot(admin, "owner--raise-confirm");
  await raise.getByRole("button", { name: "Cancel" }).click();

  // The plain pages, with real data: two rooms now, so the root lists them.
  await admin.goto("/");
  await expect(admin.getByRole("link", { name: /Late shift/ })).toBeVisible();
  await shoot(admin, "rooms--list");
  await admin.goto("/you");
  await expect(admin.getByRole("heading", { name: "You" })).toBeVisible();
  await shoot(admin, "you--owner");
  const fe = await (await newBrowser(browser, baseURL)).newPage();
  await fe.goto(link);
  await expect(fe.getByRole("button", { name: "Join as Fê" })).toBeVisible();
  await shoot(fe, "invite--fresh");

  // Last, as it stops watching for everyone: the usage budget's strips and the stopped stage.
  const before = ((await (await ownerContext.request.get("/api/owner/usage")).json()) as UsageAnswer).used;
  const budget = Math.ceil(before / GIGABYTE) + 10;
  await admin.goto("/owner/usage");
  await budgetField.fill(String(budget));
  await budgetForm.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByRole("region", { name: "This month" }).getByLabel("Usage budget")).toHaveText(
    `${budget.toLocaleString("en")} GB`,
  );
  const reach = (share: number) =>
    owner.evaluate((bytes) => ((globalThis as unknown as Fake).graeaeFakeMedia.bytes = bytes), Math.ceil(budget * share * GIGABYTE - before));
  const strip = (page: Page) => stageOf(page).getByRole("status").filter({ hasText: "usage budget" });

  await reach(0.82);
  await expect(strip(owner)).toHaveText(/past 80%/, { timeout: 15_000 });
  await owner.mouse.move(0, 0);
  await shoot(owner, "room--budget-80-owner");
  await shoot(admin, "owner--usage-past-80");
  await reach(0.96);
  await expect(strip(caio)).toHaveText(/past 95%/, { timeout: 15_000 });
  await shoot(caio, "room--budget-95-member");
  await reach(1.02);
  await expect(stageOf(owner).getByText("This month's usage budget is used up.")).toBeVisible({ timeout: 15_000 });
  await shoot(owner, "room--budget-used-up-owner");
  await expect(stageOf(caio).getByText("This month's usage budget is used up.")).toBeVisible();
  await shoot(caio, "room--budget-used-up-member");
});
