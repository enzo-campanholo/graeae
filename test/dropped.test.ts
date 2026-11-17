// Media through dropped connections: a lost signaling connection does not interrupt
// media. A sharer's share stays live through the grace period and can gain viewers; a
// "reconnecting" mark shows on a share's icon when the lost tab is the one sending it; a
// tab that comes back after its grace period ran out learns its media connection is gone,
// so the page can rebuild what it watched and shared; and media that falters while the
// signaling connection is fine ends the tab's shares after 30 seconds. Time is the test's.

import { describe, expect, it } from "vitest";
import { startInstance, type TestInstance } from "./harness.ts";
import { addMember, addSecondBrowser, connectMedia, setUpOwner, shareWebcam, startWebcam, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;

/** Moves the clock on by `ms`, with each of `alive` beating every 5 seconds on the way. */
async function pass(instance: TestInstance, ms: number, alive: Tab<unknown>[]) {
  for (let left = ms; left > 0; left -= 5 * SECOND) {
    await instance.clock.advance(Math.min(left, 5 * SECOND));
    for (const tab of alive) await tab.heartbeat();
  }
}

/** The owner and Bia in the first room, each with a tab open; Bia shares her webcam and the owner watches it. */
async function biaSharing() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab } = await openRoom(owner, room);
  const { tab: biaTab, state } = await openRoom(bia, room);
  const biaId = state.people.you.id;
  await ownerTab.next(); // Bia arrived
  await shareWebcam(biaTab);
  await ownerTab.next(); // her webcam started
  const webcam = { member: biaId, kind: "webcam" as const };
  await connectMedia(ownerTab);
  await watch(ownerTab, webcam);
  await biaTab.next(); // the owner is watching
  return { instance, owner, room, bia, biaId, webcam, ownerTab, biaTab };
}

describe("a sharer whose connection drops", () => {
  it("keeps the share live and watched through the grace period, and it can gain viewers", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    const { browser: caio } = await addMember(instance, owner, "Caio");
    const { tab: caioTab } = await openRoom(caio, room);
    await ownerTab.next(); // Caio arrived

    await biaTab.drop();
    await pass(instance, 20 * SECOND, [ownerTab, caioTab]);

    // Nobody stopped watching, and nothing ended: the room only hears Bia and her share are reconnecting.
    const marks = [expect.objectContaining({ type: "presence" }), { type: "shares", change: { type: "reconnecting", share: webcam } }];
    expect(ownerTab.queued().slice(-2)).toEqual(marks);
    expect(ownerTab.queued().filter((message) => message.type === "watching")).toEqual([]);
    expect(caioTab.queued()).toEqual(marks);
    caioTab.queued().forEach(() => void caioTab.next());
    await connectMedia(caioTab);
    await watch(caioTab, webcam);
    expect(instance.media.connections()).toEqual([
      [expect.objectContaining({ mid: "0" })],
      [expect.objectContaining({ mid: expect.any(String) })],
      [expect.objectContaining({ mid: expect.any(String) })],
    ]);
  });
});

describe("the mark on a share's icon", () => {
  it("shows after about 10 seconds when the tab sending it is lost, though another device of the sharer is heard", async () => {
    const { instance, owner, room, bia, webcam, ownerTab, biaTab } = await biaSharing();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const { tab: laptopTab } = await openRoom(laptop, room);
    await ownerTab.next(); // the laptop's device was added
    await biaTab.drop();

    await pass(instance, 9 * SECOND, [ownerTab, laptopTab]);
    expect(ownerTab.queued()).toEqual([]);
    await pass(instance, 1 * SECOND, [ownerTab, laptopTab]);

    // Bia is still heard on her laptop, so her name carries no mark: only the share does.
    expect(ownerTab.queued()).toEqual([{ type: "shares", change: { type: "reconnecting", share: webcam } }]);
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([{ ...webcam, reconnecting: true }]);
    expect(state.presence.reconnecting).toEqual([]);
  });

  it("goes when the sending tab reconnects in time, and the share is the same one, still watched", async () => {
    const { instance, owner, room, bia, webcam, ownerTab, biaTab } = await biaSharing();
    await biaTab.drop();
    await pass(instance, 12 * SECOND, [ownerTab]);
    await ownerTab.next(); // Bia is reconnecting
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "reconnecting", share: webcam } });

    const { tab: again, state } = await openRoom(bia, room);

    expect(state.shares.live).toEqual([webcam]);
    expect(state.watching.watchers).toEqual([{ share: webcam, members: [expect.any(String)] }]);
    expect(await ownerTab.next()).toMatchObject({ type: "presence", change: { type: "reconnected" } });
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "reconnected", share: webcam } });
    await pass(instance, 60 * SECOND, [ownerTab, again]);
    expect(ownerTab.queued()).toEqual([]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);
  });

  it("goes with the share when the grace period runs out", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    await biaTab.drop();
    await pass(instance, 35 * SECOND, [ownerTab]);

    expect(ownerTab.queued()).toContainEqual({ type: "shares", change: { type: "ended", share: webcam } });
    expect(ownerTab.queued()).not.toContainEqual({ type: "shares", change: { type: "reconnected", share: webcam } });
    expect((await openRoom(owner, room)).state.shares.live).toEqual([]);
  });
});

describe("a tab's media connection across a reconnect", () => {
  it("is not there for a tab that opens the room afresh", async () => {
    const { owner, room } = await biaSharing();
    const { tab } = await openRoom(owner, room);
    expect(tab.received()[0]).toMatchObject({ type: "state", media: { connected: false } });
  });

  it("is still there for a tab that reconnects in time, which keeps its stage", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    await ownerTab.drop();
    await pass(instance, 20 * SECOND, [biaTab]);

    const { tab: again, state } = await openRoom(owner, room);

    expect(again.received()[0]).toMatchObject({ type: "state", media: { connected: true } });
    expect(state.watching.stage).toEqual([webcam]);
  });

  it("is gone for a tab that comes back after its grace period ran out, which can make a new one and watch again", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    await ownerTab.drop();
    await pass(instance, 35 * SECOND, [biaTab]);

    const { tab: again, state } = await openRoom(owner, room);

    expect(again.received()[0]).toMatchObject({ type: "state", media: { connected: false } });
    expect(state.watching.stage).toEqual([]);
    await connectMedia(again);
    await watch(again, webcam);
  });

  it("is handed over again when the tab lost its socket while it was being made", async () => {
    const { instance, room, bia, biaTab } = await biaSharing();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const { tab: laptopTab } = await openRoom(laptop, room);
    const made = instance.media.hold("connect", { done: true });
    laptopTab.send({ type: "media", request: { type: "connect" } });
    await made.reached;
    await laptopTab.drop();
    made.release();
    await biaTab.heartbeat();

    const { tab: again } = await openRoom(laptop, room);
    expect(again.received()[0]).toMatchObject({ type: "state", media: { connected: true } });

    // It never heard the answer, so it asks again, and this time it hears one.
    const iceServers = await connectMedia(again);
    expect(iceServers.length).toBeGreaterThan(0);
  });
});

describe("media that falters while the signaling connection is fine", () => {
  const faltering = { type: "media", request: { type: "faltering" } } as const;
  const recovered = { type: "media", request: { type: "recovered" } } as const;

  it("keeps the share live for 30 seconds while the browser tries to recover, then ends it", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    biaTab.send(faltering);
    await biaTab.heartbeat();

    await pass(instance, 30 * SECOND - 1, [ownerTab, biaTab]);
    expect(ownerTab.queued()).toEqual([]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);

    await instance.clock.advance(1);
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([
      { type: "watching", change: { type: "unwatched", share: webcam } },
      { type: "shares", change: { type: "ended", share: webcam } },
    ]);
    expect(await biaTab.next()).toEqual({ type: "watching", change: { type: "watchers", share: webcam, members: [] } });
    expect(await biaTab.next()).toEqual({ type: "shares", change: { type: "ended", share: webcam } });
    expect(instance.media.connections().flat()).toEqual([]);
  });

  it("leaves the share alone when the browser recovers in time", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    biaTab.send(faltering);
    await pass(instance, 20 * SECOND, [ownerTab, biaTab]);
    biaTab.send(recovered);
    await biaTab.heartbeat();

    await pass(instance, 60 * SECOND, [ownerTab, biaTab]);

    expect(ownerTab.queued()).toEqual([]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);
  });

  it("counts 30 seconds afresh when it falters again after recovering", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    biaTab.send(faltering);
    await pass(instance, 20 * SECOND, [ownerTab, biaTab]);
    biaTab.send(recovered);
    biaTab.send(faltering);
    await pass(instance, 20 * SECOND, [ownerTab, biaTab]);

    expect(ownerTab.queued()).toEqual([]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);
  });
});

describe("a sharer who returns after the grace period ran out", () => {
  it("can start the share again on a new media connection, and nobody who watched it before is carried over", async () => {
    const { instance, owner, room, bia, webcam, ownerTab, biaTab } = await biaSharing();
    await biaTab.drop();
    await pass(instance, 35 * SECOND, [ownerTab]);
    expect(ownerTab.queued()).toContainEqual({ type: "watching", change: { type: "unwatched", share: webcam } });

    const { tab: again, state } = await openRoom(bia, room);
    expect(again.received()[0]).toMatchObject({ media: { connected: false } });
    expect(state.shares.live).toEqual([]);
    await shareWebcam(again);

    await again.heartbeat();
    expect(again.queued()).toEqual([]);
    const { state: ownerState } = await openRoom(owner, room);
    expect(ownerState.shares.live).toEqual([webcam]);
    expect((await openRoom(bia, room)).state.watching.watchers).toEqual([]);
  });

  it("finds the share live from another device if they started it there meanwhile, and cannot start a second", async () => {
    const { instance, room, bia, biaId, ownerTab, biaTab } = await biaSharing();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    await biaTab.drop();
    await pass(instance, 35 * SECOND, [ownerTab]);
    const { tab: laptopTab } = await openRoom(laptop, room);
    await shareWebcam(laptopTab);

    const { tab: again, state } = await openRoom(bia, room);
    expect(state.shares.live).toEqual([{ member: biaId, kind: "webcam" }]);
    await connectMedia(again);
    startWebcam(again);
    expect(await again.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
  });
});
