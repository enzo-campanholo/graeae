// The usage budget: the owner sets it, in GB per month. The owner is warned at 80%,
// everyone present at 95%, and at the limit every watch stops through the cut-off routine
// while every share stays live. Watching is refused until the month resets or the owner
// raises the budget; setting it below what is used stops watching at once.
//
// Usage is driven up through the tabs' own reports, as in `usage.test.ts`, against a small
// budget so a few reports cross it. The owner sets the budget over HTTP, as the Usage
// section does; the tabs hear the warnings over their sockets.

import { describe, expect, it } from "vitest";
import { GIGABYTE, type UsageAnswer } from "../src/shared/api.ts";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import { startInstance, type TestBrowser, type TestInstance } from "./harness.ts";
import { addMember, connectMedia, setUpOwner, shareScreen, shareWebcam, startWatching, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;

/** What the room client sends every few seconds: its media connection's running total received. */
async function report(tab: Tab, received: number) {
  tab.send({ type: "usage", request: { type: "received", bytes: received, relayed: false } });
  await tab.heartbeat();
}

/** The bytes a tab reports for `charged` bytes of usage, the 5% margin being added on top. */
const reportedFor = (charged: number) => Math.ceil(charged / 1.05);

async function usage(owner: TestBrowser): Promise<UsageAnswer> {
  const response = await owner.fetch("/api/owner/usage");
  expect(response.status).toBe(200);
  return response.json<UsageAnswer>();
}

function setBudget(browser: TestBrowser, gigabytes: unknown) {
  return browser.fetch("/api/owner/usage/budget", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gigabytes }),
  });
}

/** Reads `tab`'s messages until `wanted` arrives, and returns every message read on the way, `wanted` last. */
async function until(tab: Tab, wanted: (message: ServerMessage) => boolean): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (wanted(message)) return read;
  }
}

/** The usage changes among what `tab` has been sent and not read yet, read now. */
async function budgetChanges(tab: Tab): Promise<ServerMessage[]> {
  await tab.heartbeat();
  const queued = tab.queued();
  for (let i = 0; i < queued.length; i++) await tab.next();
  return queued.filter((message) => message.type === "usage");
}

const budget = (level: "80%" | "95%" | "used up" | null) => ({ type: "usage", change: { type: "budget", budget: level } });
const unwatched = (share: LiveShare) => ({ type: "watching", change: { type: "unwatched", share } });

/**
 * The owner and Bia in the first room, the usage budget set to 1 GB. Bia shares her
 * webcam and the owner watches it on `tab`; the owner shares a screen that Bia watches.
 */
async function eveningOnABudget() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  expect((await setBudget(owner, 1)).status).toBe(200);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await tab.next(); // Bia arrived
  await shareWebcam(biaTab);
  await tab.next(); // Bia's webcam started
  await shareScreen(tab);
  await biaTab.next(); // the owner's screen share started
  const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
  const ownersScreen: LiveShare = { member: ownerState.people.you.id, kind: "screen" };
  await watch(tab, biasWebcam);
  await biaTab.next(); // Bia hears who watches her webcam
  await watch(biaTab, ownersScreen);
  await tab.next(); // the owner hears who watches the screen
  return { instance, owner, bia, room, tab, biaTab, biasWebcam, ownersScreen };
}

/** The tracks open on the fake media server, each by its name. */
function openNames(instance: TestInstance): string[] {
  return instance.media
    .connections()
    .flat()
    .map((track) => track.name);
}

describe("the usage budget", () => {
  it("is 1,000 GB until the owner sets another, in whole GB, with no upper limit", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    expect((await usage(owner)).budget).toBe(1_000 * GIGABYTE);

    const set = await setBudget(owner, 2_500);
    expect(set.status).toBe(200);
    expect((await set.json<UsageAnswer>()).budget).toBe(2_500 * GIGABYTE);
    expect((await usage(owner)).budget).toBe(2_500 * GIGABYTE);

    expect((await setBudget(owner, 5_000_000)).status).toBe(200);
    expect((await usage(owner)).budget).toBe(5_000_000 * GIGABYTE);
  });

  it("refuses a budget that is not a whole number of GB from 1", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const nothing = await owner.fetch("/no/such/address");

    for (const gigabytes of [0, -5, 1.5, "2000", null, Number.MAX_VALUE]) {
      expect((await setBudget(owner, gigabytes)).status).toBe(nothing.status);
    }
    expect((await usage(owner)).budget).toBe(1_000 * GIGABYTE);
  });

  it("is the owner's alone to set", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const nothing = await bia.fetch("/no/such/address");

    expect((await setBudget(bia, 5_000)).status).toBe(nothing.status);
    expect((await usage(owner)).budget).toBe(1_000 * GIGABYTE);
  });

  it("is kept through a restart of the instance", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    await setBudget(owner, 1_200);

    await instance.restart();

    expect((await usage(owner)).budget).toBe(1_200 * GIGABYTE);
  });
});

describe("the warnings", () => {
  /** The owner and Bia each with a tab on the first room, the budget 1 GB; the owner's tab reports. */
  async function twoTabs() {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await setBudget(owner, 1);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab } = await openRoom(owner, room);
    const { tab: biaTab } = await openRoom(bia, room);
    await tab.next(); // Bia arrived
    await connectMedia(tab);
    return { instance, owner, bia, room, tab, biaTab };
  }

  it("reach the owner's tabs at 80%, and no member's", async () => {
    const { tab, biaTab } = await twoTabs();

    await report(tab, reportedFor(0.79 * GIGABYTE));
    expect(await budgetChanges(tab)).toEqual([]);

    await report(tab, reportedFor(0.8 * GIGABYTE));
    expect(await budgetChanges(tab)).toEqual([budget("80%")]);
    expect(await budgetChanges(biaTab)).toEqual([]);
  });

  it("reach everyone present at 95%", async () => {
    const { tab, biaTab } = await twoTabs();

    await report(tab, reportedFor(0.96 * GIGABYTE));

    // Straight past 80%: the owner hears only the later warning.
    expect(await budgetChanges(tab)).toEqual([budget("95%")]);
    expect(await budgetChanges(biaTab)).toEqual([budget("95%")]);
  });

  it("change nothing about what is watched, nor at what quality", async () => {
    const { instance, tab, biaTab } = await eveningOnABudget();
    const preferred = instance.media.preferred();
    const tracks = openNames(instance).toSorted();

    await report(tab, reportedFor(0.99 * GIGABYTE));

    await tab.heartbeat();
    expect(tab.queued()).toEqual([budget("95%")]);
    await biaTab.heartbeat();
    expect(biaTab.queued()).toEqual([budget("95%")]);
    expect(instance.media.preferred()).toEqual(preferred);
    expect(openNames(instance).toSorted()).toEqual(tracks);
  });

  it("are in the state a tab opens with", async () => {
    const { owner, bia, room, tab } = await twoTabs();
    expect((await openRoom(owner, room)).state.usage).toEqual({});

    await report(tab, reportedFor(0.85 * GIGABYTE));
    expect((await openRoom(owner, room)).state.usage).toEqual({ budget: "80%" });
    expect((await openRoom(bia, room)).state.usage).toEqual({});

    await report(tab, reportedFor(0.97 * GIGABYTE));
    expect((await openRoom(bia, room)).state.usage).toEqual({ budget: "95%" });
  });

  it("go when the owner raises the budget, and come back with a lower one", async () => {
    const { owner, tab, biaTab } = await twoTabs();
    await setBudget(owner, 10);
    await report(tab, reportedFor(9.6 * GIGABYTE));
    expect(await budgetChanges(tab)).toEqual([budget("95%")]);
    expect(await budgetChanges(biaTab)).toEqual([budget("95%")]);

    await setBudget(owner, 20);
    expect(await budgetChanges(tab)).toEqual([budget(null)]);
    expect(await budgetChanges(biaTab)).toEqual([budget(null)]);

    // 9.6 GB of 11 GB is 87%: the owner's warning only.
    await setBudget(owner, 11);
    expect(await budgetChanges(tab)).toEqual([budget("80%")]);
    expect(await budgetChanges(biaTab)).toEqual([]);
  });

  it("go when the month resets", async () => {
    const instance = await startInstance({ startAt: new Date("2037-01-31T23:59:50Z") });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await setBudget(owner, 1);
    const { tab } = await openRoom(owner, room);
    await connectMedia(tab);
    await report(tab, reportedFor(0.9 * GIGABYTE));
    expect(await budgetChanges(tab)).toEqual([budget("80%")]);

    await instance.clock.advance(5 * SECOND);
    await tab.heartbeat();
    await instance.clock.advance(5 * SECOND);

    expect(await budgetChanges(tab)).toEqual([budget(null)]);
  });
});

describe("at the limit", () => {
  it("every watch stops through the cut-off, every share stays live, and then everyone hears the budget is used up", async () => {
    const { instance, tab, biaTab, biasWebcam, ownersScreen } = await eveningOnABudget();

    await report(tab, reportedFor(1 * GIGABYTE));

    const ownerHeard = await until(tab, (message) => message.type === "usage" && message.change.budget === "used up");
    // The tabs hear their watching end before they hear why: told last, as the cut-off does.
    expect(ownerHeard).toContainEqual(unwatched(biasWebcam));
    expect(ownerHeard.filter((message) => message.type === "shares")).toEqual([]);
    const biaHeard = await until(biaTab, (message) => message.type === "usage" && message.change.budget === "used up");
    expect(biaHeard).toContainEqual(unwatched(ownersScreen));
    expect(biaHeard.filter((message) => message.type === "shares")).toEqual([]);

    // The shares' own tracks are all that is left: a webcam, and a screen with its audio.
    expect(openNames(instance)).toHaveLength(3);
  });

  it("refuses new watching, and never refuses a share", async () => {
    const { bia, room, tab, biaTab, biasWebcam } = await eveningOnABudget();
    await report(tab, reportedFor(1.2 * GIGABYTE));
    await until(tab, (message) => message.type === "usage" && message.change.budget === "used up");

    startWatching(tab, biasWebcam);
    expect(await tab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });

    // A share started now goes live as ever, from a tab already open or a new one.
    await until(biaTab, (message) => message.type === "usage");
    const { tab: biaSecond } = await openRoom(bia, room);
    expect((await openRoom(bia, room)).state.usage).toEqual({ budget: "used up" });
    await shareScreen(biaSecond);
  });

  it("refuses a watch whose pull was under way when the stop came", async () => {
    const { instance, owner, tab, biasWebcam } = await eveningOnABudget();
    // The owner stops watching, then asks again while the media server holds the pull.
    tab.send({ type: "watching", request: { type: "unwatch", share: biasWebcam } });
    await until(tab, (message) => message.type === "watching" && message.change.type === "unwatched");
    const held = instance.media.hold("pull");
    startWatching(tab, biasWebcam);
    await held.reached;

    await setBudget(owner, 1);
    await report(tab, reportedFor(1 * GIGABYTE));
    await until(tab, (message) => message.type === "usage" && message.change.budget === "used up");
    held.release();

    expect(await tab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(openNames(instance)).toHaveLength(3);
  });

  it("stops the watching of a tab in its grace period too", async () => {
    const { instance, owner, room, tab, biaTab, biasWebcam } = await eveningOnABudget();
    await report(tab, reportedFor(0.5 * GIGABYTE));
    await tab.drop();

    // Bia's tab carries on and takes the month to its limit.
    await report(biaTab, reportedFor(0.6 * GIGABYTE));
    await until(biaTab, (message) => message.type === "usage" && message.change.budget === "used up");

    expect(openNames(instance)).toHaveLength(3);
    // The owner's browser reconnects in time and finds an empty stage.
    await instance.clock.advance(2 * SECOND);
    const { state } = await openRoom(owner, room);
    expect(state.watching.stage).toEqual([]);
    expect(state.shares.live).toContainEqual(expect.objectContaining(biasWebcam));
    expect(state.usage).toEqual({ budget: "used up" });
  });
});

describe("changing the budget", () => {
  it("raising it allows watching again at once", async () => {
    const { owner, tab, biaTab, biasWebcam } = await eveningOnABudget();
    await report(tab, reportedFor(1 * GIGABYTE));
    await until(tab, (message) => message.type === "usage" && message.change.budget === "used up");

    expect((await setBudget(owner, 2)).status).toBe(200);
    expect(await budgetChanges(tab)).toEqual([budget(null)]);
    await until(biaTab, (message) => message.type === "usage" && message.change.budget === null);

    await watch(tab, biasWebcam);
  });

  it("setting it below what is already used stops watching at once", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab } = await openRoom(owner, room);
    const { tab: biaTab, state } = await openRoom(bia, room);
    await tab.next();
    await shareWebcam(biaTab);
    await tab.next();
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    await connectMedia(tab);
    await watch(tab, biasWebcam);
    await report(tab, reportedFor(3 * GIGABYTE));
    expect(await budgetChanges(tab)).toEqual([]);

    expect((await setBudget(owner, 2)).status).toBe(200);

    const heard = await until(tab, (message) => message.type === "usage");
    expect(heard).toEqual([unwatched(biasWebcam), budget("used up")]);
    expect(openNames(instance)).toHaveLength(1);
  });

  it("the month resetting allows watching again", async () => {
    const instance = await startInstance({ startAt: new Date("2037-01-31T23:59:50Z") });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await setBudget(owner, 1);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab } = await openRoom(owner, room);
    const { tab: biaTab, state } = await openRoom(bia, room);
    await tab.next();
    await shareWebcam(biaTab);
    await tab.next();
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    await connectMedia(tab);
    await report(tab, reportedFor(1 * GIGABYTE));
    await until(tab, (message) => message.type === "usage" && message.change.budget === "used up");

    await instance.clock.advance(5 * SECOND);
    await tab.heartbeat();
    await biaTab.heartbeat();
    await instance.clock.advance(5 * SECOND);

    expect(await budgetChanges(tab)).toEqual([budget(null)]);
    await watch(tab, biasWebcam);
  });
});
