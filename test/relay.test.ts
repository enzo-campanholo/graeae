// Relay credential renewal: a tab's credential lasts 12 hours, and 11 hours after it was
// minted the instance hands that tab a fresh one. A tab on the relay restarts its media
// connection with it, through the instance; if the restart fails, it lets go of its media
// connection and makes a new one, the ordinary reconnect path. Time is the test's.
//
// Passing hours costs the test a heartbeat every few seconds, so one test proves the real
// 12 and 11 hours, and the rest run on lives of 12 and 11 minutes, as on a test deploy.

import { describe, expect, it } from "vitest";
import { startInstance, type TestInstance } from "./harness.ts";
import { addMember, connectMedia, FAKE_OFFER, setUpOwner, shareWebcam, startWebcam, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Lives of 12 and 11 minutes, as the owner may set them on a test deploy. */
const SHORT = { credentialSeconds: 12 * 60, renewalAfterMs: 11 * MINUTE };

/**
 * Moves the clock on by `ms`, with each of `alive` beating every 9 seconds on the way, so
 * none falls silent.
 */
async function pass(instance: TestInstance, ms: number, alive: Tab<unknown>[]) {
  for (let left = ms; left > 0; left -= 9 * SECOND) {
    await instance.clock.advance(Math.min(left, 9 * SECOND));
    for (const tab of alive) await tab.heartbeat();
  }
}

/** The media changes `tab` has been sent and not read, read now. Everything else it was sent is read too. */
function mediaChanges(tab: Tab) {
  const changes = tab.queued().flatMap((message) => (message.type === "media" ? [message.change] : []));
  tab.queued().forEach(() => void tab.next());
  return changes;
}

/** The owner in the first room with a tab open and its media connection made. */
async function ownerConnected(relayLives = SHORT) {
  const instance = await startInstance({ relayLives });
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { tab } = await openRoom(owner, room);
  const first = await connectMedia(tab);
  return { instance, owner, room, tab, first };
}

describe("the fresh credential", () => {
  it("comes 11 hours after the connection's was minted, lasting 12 hours", { timeout: 120_000 }, async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const { tab } = await openRoom(owner, await setUpOwner(owner));
    const first = await connectMedia(tab);

    await pass(instance, 11 * HOUR - 10 * SECOND, [tab]);
    expect(mediaChanges(tab)).toEqual([]);
    await pass(instance, 10 * SECOND, [tab]);

    const changes = mediaChanges(tab);
    expect(changes).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
    const fresh = changes[0]!.type === "renewed" ? changes[0]!.iceServers : [];
    expect(fresh).not.toEqual(first);
    expect(instance.media.credentials()).toEqual([
      { iceServers: first, ttlSeconds: 12 * 60 * 60 },
      { iceServers: fresh, ttlSeconds: 12 * 60 * 60 },
    ]);
  });

  it("comes again 11 minutes after each fresh one, on lives of 12 and 11 minutes", async () => {
    const { instance, tab } = await ownerConnected();

    await pass(instance, 11 * MINUTE, [tab]);
    expect(mediaChanges(tab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
    await pass(instance, 11 * MINUTE - 10 * SECOND, [tab]);
    expect(mediaChanges(tab)).toEqual([]);
    await pass(instance, 10 * SECOND, [tab]);
    expect(mediaChanges(tab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
    expect(instance.media.credentials().map((credential) => credential.ttlSeconds)).toEqual([720, 720, 720]);
  });

  it("is each tab's own, counted from its own connection", async () => {
    const { instance, owner, room, tab: ownerTab } = await ownerConnected();
    const { browser: bia } = await addMember(instance, owner, "Bia");
    await pass(instance, 3 * MINUTE, [ownerTab]);
    const { tab: biaTab } = await openRoom(bia, room);
    await connectMedia(biaTab);

    await pass(instance, 8 * MINUTE, [ownerTab, biaTab]);
    expect(mediaChanges(ownerTab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
    expect(mediaChanges(biaTab)).toEqual([]);
    await pass(instance, 3 * MINUTE, [ownerTab, biaTab]);
    expect(mediaChanges(ownerTab)).toEqual([]);
    expect(mediaChanges(biaTab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
  });

  it("goes to a tab that was lost when it came due once it is back within its grace period", async () => {
    const { instance, owner, room, tab } = await ownerConnected();
    await pass(instance, 11 * MINUTE - 5 * SECOND, [tab]);
    await tab.drop();
    await instance.clock.advance(15 * SECOND);

    const { tab: back, state } = await openRoom(owner, room);
    expect(state.people.you.owner).toBe(true);
    await instance.clock.advance(0);
    await back.heartbeat();
    expect(mediaChanges(back)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
  });

  it("is tried again a minute later when the relay refuses it", async () => {
    const { instance, tab } = await ownerConnected();
    instance.media.fail("relayCredential");

    await pass(instance, 11 * MINUTE + 50 * SECOND, [tab]);
    expect(mediaChanges(tab)).toEqual([]);
    await pass(instance, 10 * SECOND, [tab]);
    expect(mediaChanges(tab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
  });

  it("is not owed to a tab whose grace period ran out: its new connection has a new credential, renewed 11 minutes on", async () => {
    const { instance, owner, room, tab } = await ownerConnected();
    await pass(instance, 5 * MINUTE, [tab]);
    await tab.drop();
    await instance.clock.advance(35 * SECOND);

    const { tab: again, state } = await openRoom(owner, room);
    expect(state).toBeDefined();
    const fresh = await connectMedia(again);
    expect(instance.media.credentials()).toEqual([
      expect.anything(),
      { iceServers: fresh, ttlSeconds: 12 * 60 },
    ]);

    // 11 minutes and 10 seconds in, the old connection's moment has gone by unmarked.
    await pass(instance, 5 * MINUTE + 35 * SECOND, [again]);
    expect(mediaChanges(again)).toEqual([]);
    // 11 minutes after the new one.
    await pass(instance, 5 * MINUTE + 25 * SECOND, [again]);
    expect(mediaChanges(again)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
    expect(instance.media.credentials()).toHaveLength(3);
  });
});

/** The owner and Bia in the first room, each sharing a webcam and watching the other's. */
async function bothSharingAndWatching(relayLives = SHORT) {
  const instance = await startInstance({ relayLives });
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state } = await openRoom(bia, room);
  const ownerWebcam = { member: ownerState.people.you.id, kind: "webcam" as const };
  const biaWebcam = { member: state.people.you.id, kind: "webcam" as const };
  await ownerTab.next(); // Bia arrived
  await shareWebcam(ownerTab);
  await biaTab.next(); // the owner's webcam started
  await shareWebcam(biaTab);
  await ownerTab.next(); // Bia's webcam started
  await watch(ownerTab, biaWebcam);
  await biaTab.next(); // the owner watches
  await watch(biaTab, ownerWebcam);
  await ownerTab.next(); // Bia watches
  return { instance, owner, room, bia, ownerTab, biaTab, ownerWebcam, biaWebcam };
}

describe("a restart on the relay", () => {
  it("hands the media server the tab's restart offer and the tab its answer, with every share and watch carrying on", async () => {
    const { instance, owner, room, biaTab, ownerWebcam, biaWebcam } = await bothSharingAndWatching();
    const tracks = instance.media.connections();

    biaTab.send({ type: "media", request: { type: "restart", offer: FAKE_OFFER } });

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "restarted", answer: expect.any(String) } });
    expect(instance.media.calls("restart")).toBe(1);
    expect(instance.media.connections()).toEqual(tracks);
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([ownerWebcam, biaWebcam]);
    expect(state.watching.watchers).toEqual([{ share: ownerWebcam, members: [biaWebcam.member] }]);
  });

  it("is refused when the media server fails it, and nothing ends", async () => {
    const { instance, owner, room, biaTab, ownerWebcam, biaWebcam } = await bothSharingAndWatching();
    instance.media.fail("restart");

    biaTab.send({ type: "media", request: { type: "restart", offer: FAKE_OFFER } });

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "restart-refused" } });
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([ownerWebcam, biaWebcam]);
  });

  it("is refused to a tab with no media connection", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const { tab } = await openRoom(owner, await setUpOwner(owner));

    tab.send({ type: "media", request: { type: "restart", offer: FAKE_OFFER } });

    expect(await tab.next()).toEqual({ type: "media", change: { type: "restart-refused" } });
    expect(instance.media.calls("restart")).toBe(0);
  });
});

describe("the reconnect after a failed restart", () => {
  it("ends what the tab's media connection carried and lets it go, so the tab can make a new one", async () => {
    const { instance, ownerTab, biaTab, ownerWebcam, biaWebcam } = await bothSharingAndWatching();

    biaTab.send({ type: "media", request: { type: "reconnect" } });

    // Last, once everything on it is closed, the tab hears its connection is let go of.
    await biaTab.heartbeat();
    const heard = biaTab.queued();
    expect(heard.at(-1)).toEqual({ type: "media", change: { type: "dropped" } });
    expect(heard).toEqual(
      expect.arrayContaining([
        { type: "watching", change: { type: "unwatched", share: ownerWebcam } },
        { type: "shares", change: { type: "ended", share: biaWebcam } },
      ]),
    );
    heard.forEach(() => void biaTab.next());
    expect(ownerTab.queued()).toEqual(
      expect.arrayContaining([
        { type: "watching", change: { type: "unwatched", share: biaWebcam } },
        { type: "shares", change: { type: "ended", share: biaWebcam } },
        { type: "watching", change: { type: "watchers", share: ownerWebcam, members: [] } },
      ]),
    );
    // Only the owner's webcam is left open, on the owner's connection.
    expect(instance.media.connections().flat()).toEqual([expect.objectContaining({ mid: "0" })]);

    // The tab makes a new connection, with a new credential, and shares and watches again.
    const fresh = await connectMedia(biaTab);
    expect(instance.media.credentials().at(-1)).toEqual({ iceServers: fresh, ttlSeconds: 12 * 60 });
    startWebcam(biaTab);
    expect(await biaTab.next()).toMatchObject({ type: "media", change: { type: "published", kind: "webcam" } });
    expect(await biaTab.next()).toEqual({ type: "shares", change: { type: "started", share: biaWebcam } });
    await watch(biaTab, ownerWebcam);
  });

  it("starts a new 11 minutes from the new connection", async () => {
    const { instance, ownerTab, biaTab } = await bothSharingAndWatching();
    await pass(instance, 5 * MINUTE, [ownerTab, biaTab]);
    biaTab.send({ type: "media", request: { type: "reconnect" } });
    await pass(instance, 9 * SECOND, [ownerTab, biaTab]);
    mediaChanges(biaTab);
    await connectMedia(biaTab);

    await pass(instance, 6 * MINUTE + 9 * SECOND, [ownerTab, biaTab]);
    expect(mediaChanges(ownerTab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
    expect(mediaChanges(biaTab)).toEqual([]);
    await pass(instance, 5 * MINUTE, [ownerTab, biaTab]);
    expect(mediaChanges(biaTab)).toEqual([{ type: "renewed", iceServers: expect.any(Array) }]);
  });
});
