import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { LOST_CLOSE_CODE } from "../../src/shared/socket/heartbeat.ts";
import { SETUP_SECRET } from "./app.ts";

// Watching a webcam share between two browsers. The media on both sides is fake: the
// page's media client receives nothing and the instance's media server is in memory, so
// this covers what each member sees, not pictures. Journeys share one instance; each here
// names its own member, whom no other journey uses.

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

// Choosing what to watch shows at once that it was taken (ticket 39). On real media a
// watch takes a moment to arrive, and the fakes are instant, so these journeys hold the
// instance's answers on the watcher's socket. Each names its own member, whom no other
// journey uses.

/**
 * The owner and `name`, who shares a webcam, in the first room. The owner's page is on
 * a socket routed through the test: while `holding` names a change, the instance's
 * messages of it wait, in order, until `release`. `drop` loses the socket, and what it
 * held with it; the page reconnects by itself.
 */
async function ownerWatchingThrough(browser: Browser, baseURL: string | undefined, name: string) {
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const made = await ownerContext.request.post("/api/owner/invites", { data: { name } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const member = await (await newBrowser(browser, baseURL)).newPage();
  await member.goto(`/invite/${invite.code}`);
  await member.getByRole("button", { name: `Join as ${name}` }).click();
  await expect(member).toHaveURL(room);
  await member.getByRole("button", { name: "Share webcam" }).click();
  await expect(member.getByText("No one watching")).toBeVisible();

  const route = {
    holding: [] as string[],
    queue: [] as (() => void)[],
    /** Hands the page what was held, in order, and holds nothing more. */
    release() {
      route.holding = [];
      for (const send of route.queue.splice(0)) send();
    },
    drop: () => {},
  };
  await owner.routeWebSocket(/\/api\/socket/, (socket) => {
    const instance = socket.connectToServer();
    route.drop = () => {
      route.holding = [];
      route.queue = [];
      // Lost, not left: the instance keeps the tab for its grace period.
      void instance.close({ code: LOST_CLOSE_CODE, reason: "lost" });
      void socket.close({ code: LOST_CLOSE_CODE, reason: "lost" });
    };
    socket.onMessage((message) => instance.send(message));
    instance.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as { change?: { type?: string } };
      if (route.holding.includes(parsed.change?.type ?? "")) route.queue.push(() => socket.send(message));
      else socket.send(message);
    });
    socket.onClose((code, reason) => void instance.close({ code, reason }));
  });
  await owner.reload();

  const stage = owner.getByRole("main", { name: "Stage" });
  const bar = owner.getByRole("region", { name: "Here" });
  return {
    owner,
    member,
    route,
    stage,
    watch: bar.getByRole("button", { name: `Watch ${name}'s webcam` }),
    lit: bar.getByRole("button", { name: `Stop watching ${name}'s webcam` }),
    connecting: stage.getByRole("img", { name: `${name}'s webcam, connecting` }),
    picture: stage.getByRole("img", { name: `${name}'s webcam, with no picture` }),
    nothing: stage.getByText("You're not watching anything yet."),
  };
}

test("a click on a share's icon lights it and puts the share on the stage at once, connecting until it arrives", async ({
  browser,
  baseURL,
}) => {
  const { member, route, watch, lit, connecting, picture } = await ownerWatchingThrough(browser, baseURL, "Noor");
  route.holding = ["pulled", "watched"];

  await watch.click();
  await expect(lit).toHaveAttribute("aria-pressed", "true");
  await expect(connecting).toBeVisible();
  await expect(picture).toHaveCount(0);

  route.release();
  await expect(picture).toBeVisible();
  await expect(connecting).toHaveCount(0);
  await expect(lit).toHaveAttribute("aria-pressed", "true");
  await expect(member.getByText("Owner watching")).toBeVisible();
});

test("a second click while the share is on its way takes it off at once, and a double-click counts once", async ({
  browser,
  baseURL,
}) => {
  const { owner, member, route, watch, lit, connecting, picture, nothing } = await ownerWatchingThrough(
    browser,
    baseURL,
    "Oda",
  );
  route.holding = ["pulled", "watched"];

  await watch.click();
  await expect(connecting).toBeVisible();
  // The click that says "stop": the share leaves the stage at once, and stays off once
  // the instance has answered the first.
  await lit.click();
  await expect(connecting).toHaveCount(0);
  await expect(nothing).toBeVisible();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  route.release();
  await expect(member.getByText("No one watching")).toBeVisible();
  await owner.waitForTimeout(500);
  await expect(picture).toHaveCount(0);
  await expect(nothing).toBeVisible();

  // A double-click on the icon is one click: the share is watched, and stays.
  await watch.dblclick();
  await expect(picture).toBeVisible();
  await expect(member.getByText("Owner watching")).toBeVisible();
  await owner.waitForTimeout(500);
  await expect(picture).toBeVisible();
  await expect(lit).toHaveAttribute("aria-pressed", "true");
});

test("stopping a share takes it off the stage at once, and watching it again on the way brings it back", async ({
  browser,
  baseURL,
}) => {
  const { member, route, watch, lit, connecting, picture, nothing } = await ownerWatchingThrough(browser, baseURL, "Pia");
  await watch.click();
  await expect(picture).toBeVisible();
  await expect(member.getByText("Owner watching")).toBeVisible();

  route.holding = ["unwatched"];
  await lit.click();
  await expect(picture).toHaveCount(0);
  await expect(nothing).toBeVisible();
  await expect(watch).toHaveAttribute("aria-pressed", "false");

  // Chosen again before the instance has closed the old pull: on the stage at once, and
  // watched afresh once the old pull is closed.
  await watch.click();
  await expect(lit).toHaveAttribute("aria-pressed", "true");
  await expect(picture.or(connecting)).toBeVisible();
  route.release();
  await expect(picture).toBeVisible();
  await expect(member.getByText("Owner watching")).toBeVisible();
});

test("a share let go of on its way stays off when the socket is lost before the instance answers", async ({
  browser,
  baseURL,
}) => {
  const { owner, member, route, watch, lit, connecting, picture, nothing } = await ownerWatchingThrough(
    browser,
    baseURL,
    "Quin",
  );
  route.holding = ["pulled", "watched"];
  await watch.click();
  await expect(connecting).toBeVisible();
  await lit.click();
  await expect(nothing).toBeVisible();
  // The instance pulled it all the same, and its answer is lost with the socket.
  await expect(member.getByText("Owner watching")).toBeVisible();
  route.drop();

  // Back on a new socket, the tab finds it watched, and lets it go.
  await expect(member.getByText("No one watching")).toBeVisible();
  await owner.waitForTimeout(500);
  await expect(picture.or(connecting)).toHaveCount(0);
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  await expect(nothing).toBeVisible();
});
