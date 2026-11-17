// A restart of the instance mid-session, as a graeae update or a Cloudflare restart does.
// Every socket drops, and the fake media server keeps its tracks, as the real one would.
// Live shares and watching stay on record, everyone is treated as in their grace period,
// and a sweep closes whatever the media server holds that no record accounts for.

import { describe, expect, it, vi } from "vitest";
import type { LiveShare } from "../src/shared/socket/index.ts";
import { startInstance, type TestInstance } from "./harness.ts";
import { addMember, connectMedia, setUpOwner, shareWebcam, startWatching, startWebcam, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;

/** Moves the clock on by `ms`, with each of `alive` beating every 5 seconds on the way. */
async function pass(instance: TestInstance, ms: number, alive: Tab[]) {
  for (let left = ms; left > 0; left -= 5 * SECOND) {
    await instance.clock.advance(Math.min(left, 5 * SECOND));
    for (const tab of alive) await tab.heartbeat();
  }
}

/** The owner watching Bia's webcam, each with a tab open on the first room. */
async function ownerWatchingBia() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  await shareWebcam(biaTab);
  await ownerTab.next(); // her webcam went live
  const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
  await connectMedia(ownerTab);
  await watch(ownerTab, biasWebcam);
  await biaTab.next(); // the owner is watching
  return { instance, owner, bia, room, biasWebcam, ownerId: ownerState.people.you.id, biaId: biasWebcam.member };
}

describe("a restart of the instance mid-session", () => {
  it("keeps everyone present, sharing and watching while they reconnect within the grace period", async () => {
    const { instance, owner, bia, room, biasWebcam, ownerId, biaId } = await ownerWatchingBia();

    await instance.restart();
    await instance.clock.advance(2 * SECOND);
    const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
    const { state: biaState } = await openRoom(bia, room);

    expect(ownerState.presence).toEqual({ present: [ownerId, biaId], reconnecting: [] });
    expect(ownerState.shares.live).toEqual([biasWebcam]);
    expect(ownerState.watching.stage).toEqual([biasWebcam]);
    expect(biaState.watching.watchers).toEqual([{ share: biasWebcam, members: [ownerId] }]);
    // Bia came back as the same member, so nobody heard her leave or arrive.
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([]);
    expect(instance.media.connections().map((tracks) => tracks.length)).toEqual([1, 1]);
  });

  it("cuts off as usual whoever is not back when the grace period runs out", async () => {
    const { instance, owner, room, biasWebcam, biaId } = await ownerWatchingBia();

    await instance.restart();
    await instance.clock.advance(2 * SECOND);
    const { tab: ownerTab } = await openRoom(owner, room);
    await pass(instance, 25 * SECOND, [ownerTab]);
    expect(ownerTab.queued()).toEqual([{ type: "presence", change: { type: "reconnecting", member: biaId } }]);
    await ownerTab.next();

    // 30 seconds from the restart.
    await pass(instance, 5 * SECOND, [ownerTab]);

    expect(ownerTab.queued()).toEqual([
      { type: "presence", change: { type: "left", member: biaId } },
      { type: "watching", change: { type: "unwatched", share: biasWebcam } },
      { type: "shares", change: { type: "ended", share: biasWebcam } },
    ]);
    expect(instance.media.connections().flat()).toEqual([]);
  });

  it("ends the watching of a share whose sharer is not back in time, for a viewer who is", async () => {
    const { instance, owner, room, biasWebcam } = await ownerWatchingBia();

    await instance.restart();
    const { tab: ownerTab, state } = await openRoom(owner, room);
    expect(state.watching.stage).toEqual([biasWebcam]);
    await pass(instance, 30 * SECOND, [ownerTab]);

    const { state: later } = await openRoom(owner, room);
    expect(later.shares.live).toEqual([]);
    expect(later.watching.stage).toEqual([]);
  });
});

/** The owner and Bia, each with a tab open on the first room and its media connection made. */
async function ownerAndBia() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  await connectMedia(biaTab);
  await connectMedia(ownerTab);
  const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
  return { instance, owner, bia, room, ownerTab, biaTab, biasWebcam, ownerId: ownerState.people.you.id };
}

/** Has `tab`, whose media connection is made, start its webcam, and `other` hear it go live. */
async function goLive(tab: Tab, other: Tab) {
  startWebcam(tab);
  expect(await tab.next()).toMatchObject({ type: "media", change: { type: "published" } });
  expect(await tab.next()).toMatchObject({ type: "shares", change: { type: "started" } });
  expect(await other.next()).toMatchObject({ type: "shares", change: { type: "started" } });
}

describe("the sweep after a restart", () => {
  it("clears the record of a share the instance stopped in the middle of starting, before the media server heard of it", async () => {
    const { instance, bia, room, biaTab } = await ownerAndBia();
    const publish = instance.media.hold("publish");
    startWebcam(biaTab);
    await publish.reached;

    await instance.restart();
    const { tab: back, state } = await openRoom(bia, room);

    expect(state.shares.live).toEqual([]);
    // Nothing of the half-made share is left to refuse a new one.
    await vi.waitFor(async () => {
      startWebcam(back);
      expect(await back.next()).toMatchObject({ type: "media", change: { type: "published" } });
    });
    expect(instance.media.connections().flat()).toHaveLength(1);
  });

  it("closes a share's track the media server made just as the instance stopped, which never went live", async () => {
    const { instance, bia, room, biaTab } = await ownerAndBia();
    const publish = instance.media.hold("publish", { done: true });
    startWebcam(biaTab);
    await publish.reached;
    expect(instance.media.connections().flat()).toHaveLength(1);

    await instance.restart();
    const { state } = await openRoom(bia, room);

    expect(state.shares.live).toEqual([]);
    await vi.waitFor(() => expect(instance.media.connections().flat()).toEqual([]));
  });

  it("closes a pull the media server made just as the instance stopped, and the share stays off the stage", async () => {
    const { instance, owner, room, ownerTab, biaTab, biasWebcam } = await ownerAndBia();
    await goLive(biaTab, ownerTab);
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    await pull.reached;
    expect(instance.media.connections().flat()).toHaveLength(2);

    await instance.restart();
    const { tab: back, state } = await openRoom(owner, room);

    expect(state.watching.stage).toEqual([]);
    await vi.waitFor(() => expect(instance.media.connections().map((tracks) => tracks.length)).toEqual([1, 0]));
    // And the owner can watch it afresh.
    await watch(back, biasWebcam);
  });
});

describe("the sweep at a cut-off", () => {
  it("closes a pulled track the media server made although it reported the pull failed", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await ownerAndBia();
    await goLive(biaTab, ownerTab);
    instance.media.fail("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.connections().map((tracks) => tracks.length)).toEqual([1, 1]);

    await ownerTab.close();

    await vi.waitFor(() => expect(instance.media.connections().map((tracks) => tracks.length)).toEqual([1, 0]));
  });
});
