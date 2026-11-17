// Media through dropped connections: a lost signaling connection does not interrupt
// media. A sharer's share stays live through the grace period and can gain viewers; a
// "reconnecting" mark shows on a share's icon when the lost tab is the one sending it; a
// tab that comes back after its grace period ran out learns its media connection is gone,
// so the page can rebuild what it watched and shared; and media that falters while the
// signaling connection is fine ends the tab's shares after 30 seconds. Time is the test's.

import { describe, expect, it } from "vitest";
import { startInstance, type TestInstance } from "./harness.ts";
import { addMember, addSecondBrowser, connectMedia, setUpOwner, shareWebcam, watch } from "./steps.ts";
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
    const { instance, owner, room, bia, biaId, webcam, ownerTab, biaTab } = await biaSharing();
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
    void biaId;
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
