// A restart of the instance mid-session, as a graeae update or a Cloudflare restart does.
// Every socket drops, and the fake media server keeps its tracks, as the real one would.
// Live shares and watching stay on record, everyone is treated as in their grace period,
// and a sweep closes whatever the media server holds that no record accounts for.

import { describe, expect, it } from "vitest";
import type { LiveShare } from "../src/shared/socket/index.ts";
import { startInstance, type TestInstance } from "./harness.ts";
import { addMember, connectMedia, setUpOwner, shareWebcam, watch } from "./steps.ts";
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
