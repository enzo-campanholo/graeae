// A replacement of a tab's receiving connection while something else happens to what it
// watches: a hand-over of a share it watches, an instance evicted between two steps, two
// answers to one step, and the tab leaving. A replacement pulls the tab's watches onto a
// new connection one step at a time, each a `pulled` the tab answers before the next, and
// every offer the tab gets in between is one of those steps. Tabs are driven only
// through their sockets; the fake media server shows which pulls are really open.

import { describe, expect, it, vi } from "vitest";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import { startInstance, type TestInstance } from "./harness.ts";
import {
  addMember,
  addSecondBrowser,
  connectMedia,
  FAKE_ANSWER,
  FAKE_OFFER,
  FAKE_VIDEO_MID,
  setUpOwner,
  shareWebcam,
  startScreen,
  stopWebcam,
  watch,
} from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

/**
 * The owner watching Bia's webcam, shared from her laptop, with her phone, another of
 * her devices, on the same room and ready to share. The connections are made in order:
 * the laptop's sending, the owner's receiving, the phone's sending.
 */
async function watchingBiaOnTwoDevices() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab } = await openRoom(owner, room);
  const { tab: laptop, state } = await openRoom(bia, room);
  await settle(ownerTab); // Bia arrived
  await shareWebcam(laptop);
  await settle(ownerTab); // her webcam went live
  const share: LiveShare = { member: state.people.you.id, kind: "webcam" };
  await connectMedia(ownerTab, "receiving");
  await watch(ownerTab, share);
  const { other } = await addSecondBrowser(instance, bia);
  const { tab: phone } = await openRoom(other, room);
  await connectMedia(phone, "sending");
  await settle(ownerTab);
  await settle(laptop);
  const laptopsTrack = instance.media.connections()[0]![0]!.name;
  return { instance, owner, room, ownerTab, laptop, phone, share, laptopsTrack };
}

/** What the page sends to share its webcam from here, stopping it on the member's other device. */
function handOver(tab: Tab) {
  tab.send({ type: "shares", request: { type: "start", kind: "webcam", offer: FAKE_OFFER, video: FAKE_VIDEO_MID, handOver: true } });
}

/** Lets every request already sent reach the instance and be answered: a heartbeat's answer comes after them all. */
async function settle(tab: Tab) {
  await tab.heartbeat();
  while (tab.queued().length > 0) await tab.next();
}

/** Reads `tab`'s messages up to and including the first that `matches`, returning all of them. */
async function until(tab: Tab, matches: (message: ServerMessage) => boolean): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (matches(message)) return read;
  }
}

const isMedia = (type: string) => (message: ServerMessage) => message.type === "media" && message.change.type === type;

/** Answers `tab`'s pulls until `replaced`, returning every message it read on the way. */
async function answerUntilReplaced(tab: Tab): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (isMedia("replaced")(message)) return read;
    if (isMedia("pulled")(message)) tab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
  }
}

/** The names of the tracks open on each media connection, oldest connection first. */
function names(instance: TestInstance): string[][] {
  return instance.media.connections().map((tracks) => tracks.map((track) => track.name));
}

describe("a hand-over during a replacement of the watcher's receiving connection", () => {
  it("reaches the watcher as one of the replacement's steps, never as a move in between", async () => {
    const { instance, owner, room, ownerTab, phone, share, laptopsTrack } = await watchingBiaOnTwoDevices();
    ownerTab.send({ type: "media", request: { type: "replace" } });
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "connected", connection: "receiving" } });
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "pulled", share } });

    // Bia hands her webcam over to her phone while the owner has yet to answer.
    handOver(phone);
    await until(phone, isMedia("published"));
    await settle(phone);
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    const heard = await answerUntilReplaced(ownerTab);

    expect(heard.filter(isMedia("moved"))).toEqual([]);
    expect(heard.filter(isMedia("pulled"))).toEqual([{ type: "media", change: expect.objectContaining({ type: "pulled", share }) }]);
    const phonesTrack = names(instance)[2]![0]!;
    await vi.waitFor(() => expect(names(instance)[1]).toEqual([]));
    // The replacement holds one pull, of the phone's share, and nothing holds the laptop's.
    expect(names(instance)[3]).toEqual([phonesTrack]);
    expect(names(instance).flat()).not.toContain(laptopsTrack);
    await ownerTab.drop();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([share]);
  });

  it("pulls the new share onto the watcher's current connection when its pull to the old one returns after the replacement", async () => {
    const { instance, owner, room, ownerTab, phone, share, laptopsTrack } = await watchingBiaOnTwoDevices();
    // The move's pull, onto the owner's receiving connection, waits for the media server.
    const pull = instance.media.hold("pull");
    handOver(phone);
    await pull.reached;
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await until(ownerTab, isMedia("connected"));
    expect(await answerUntilReplaced(ownerTab)).toEqual([{ type: "media", change: { type: "replaced" } }]);

    pull.release();
    const [moved] = await until(ownerTab, (message) => message.type === "media");
    expect(moved).toMatchObject({ type: "media", change: { type: "moved", share } });
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "answered" } });

    // The offer was the new connection's, and it has the answer; the old one holds nothing.
    const phonesTrack = names(instance)[2]![0]!;
    await vi.waitFor(() => expect(names(instance)[1]).toEqual([]));
    expect(names(instance)[3]).toEqual([phonesTrack]);
    expect(instance.media.answers()[3]).toEqual([FAKE_ANSWER]);
    expect(names(instance).flat()).not.toContain(laptopsTrack);
    await ownerTab.drop();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([share]);
  });

  it("takes the share off the watcher's stage when the new one ends while the old pull closes", async () => {
    const { instance, owner, room, ownerTab, phone, share } = await watchingBiaOnTwoDevices();
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await until(ownerTab, isMedia("connected"));
    await until(ownerTab, isMedia("pulled"));

    // The hand-over closes the laptop's tracks, then the owner's pull of them, which waits.
    const [ownTracks, ownersPull] = [instance.media.hold("close"), instance.media.hold("close")];
    handOver(phone);
    await ownTracks.reached;
    ownTracks.release();
    await ownersPull.reached;
    stopWebcam(phone);
    await until(phone, (message) => message.type === "shares" && message.change.type === "ended");
    ownersPull.release();
    await vi.waitFor(() => expect(instance.logs().map((line) => line.event)).toContain("handover.done"));

    // The watcher hears at once, not at the replacement's next step.
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toContainEqual({ type: "watching", change: { type: "unwatched", share } });
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    const heard = await answerUntilReplaced(ownerTab);
    expect(heard.filter(isMedia("pulled"))).toEqual([]);
    await vi.waitFor(() => expect(names(instance).flat()).toEqual([]));
    await ownerTab.drop();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([]);
  });

  it("takes the share off the watcher's stage when the replacement that was to pull it is let go of and no other can be made", async () => {
    const { instance, owner, room, ownerTab, phone, share } = await watchingBiaOnTwoDevices();
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await until(ownerTab, isMedia("connected"));
    await until(ownerTab, isMedia("pulled"));
    handOver(phone);
    await until(phone, isMedia("published"));
    await settle(phone);

    // The tab asks again, as on its next socket, and the media server makes nothing.
    instance.media.fail("connect");
    ownerTab.send({ type: "media", request: { type: "replace" } });
    const heard = await until(ownerTab, isMedia("unavailable"));

    expect(heard).toContainEqual({ type: "watching", change: { type: "unwatched", share } });
    await ownerTab.drop();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([]);
  });
});

/** The owner watching Bia's webcam and her screen, and Caio on the room too. */
async function watchingTwoOfBias() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { browser: caio } = await addMember(instance, owner, "Caio");
  const { tab: ownerTab } = await openRoom(owner, room);
  const { tab: biaTab, state } = await openRoom(bia, room);
  const { tab: caioTab } = await openRoom(caio, room);
  await settle(biaTab); // Caio arrived
  await shareWebcam(biaTab);
  startScreen(biaTab, { audio: null, video: "1" });
  await until(biaTab, (message) => message.type === "shares");
  await settle(ownerTab);
  const webcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
  const screen: LiveShare = { member: state.people.you.id, kind: "screen" };
  await connectMedia(ownerTab, "receiving");
  await watch(ownerTab, webcam);
  await watch(ownerTab, screen);
  await settle(biaTab);
  await settle(caioTab);
  return { instance, owner, room, ownerTab, biaTab, caioTab, webcam, screen };
}

describe("an instance evicted during a replacement", () => {
  it("goes on with the next step when the tab answers, its socket kept open", async () => {
    const { instance, owner, room, ownerTab, caioTab, webcam, screen } = await watchingTwoOfBias();
    const oldPulls = [...names(instance)[1]!].sort();
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await until(ownerTab, isMedia("connected"));
    const [first] = await until(ownerTab, isMedia("pulled"));

    await instance.evict();
    // Caio's tab is lost while the instance is away, so it wakes to sweep every connection.
    await caioTab.drop();
    await settle(ownerTab);
    await vi.waitFor(() => expect(instance.logs().filter((line) => line.event === "restart.swept")).toHaveLength(2));
    expect(instance.logs().filter((line) => line.event === "sweep.closed" || line.event === "sweep.gone")).toEqual([]);
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    const rest = await answerUntilReplaced(ownerTab);

    const pulled = [first!, ...rest]
      .filter(isMedia("pulled"))
      .map((message) => message.type === "media" && message.change.type === "pulled" && message.change.share);
    expect(pulled).toEqual(expect.arrayContaining([webcam, screen]));
    expect(pulled).toHaveLength(2);
    await vi.waitFor(() => expect(names(instance)[1]).toEqual([]));
    expect([...names(instance)[2]!].sort()).toEqual(oldPulls);
    await ownerTab.drop();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual(expect.arrayContaining([webcam, screen]));
  });
});

describe("the steps of a replacement", () => {
  it("begin once the tab has heard the replacement is made, whatever it answers before", async () => {
    const { instance, ownerTab, share } = await watchingBiaOnTwoDevices();
    const pulls = instance.media.calls("pull");
    const credential = instance.media.hold("relayCredential");
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await credential.reached;
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "answered" } });
    credential.release();

    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "connected", connection: "receiving" } });
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "pulled", share } });
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    await answerUntilReplaced(ownerTab);
    expect(instance.media.calls("pull")).toBe(pulls + 1);
  });

  it("go one at a time: two answers during one step start one pull", async () => {
    const { instance, ownerTab, webcam, screen } = await watchingTwoOfBias();
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await until(ownerTab, isMedia("connected"));
    const [first] = await until(ownerTab, isMedia("pulled"));
    const pulls = instance.media.calls("pull");

    const pull = instance.media.hold("pull");
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "answered" } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "answered" } });
    await pull.reached;
    pull.release();
    const [second] = await until(ownerTab, isMedia("pulled"));
    // Each share once, one per step.
    const shares = [first, second].map((message) => message?.type === "media" && message.change.type === "pulled" && message.change.share);
    expect(shares).toEqual(expect.arrayContaining([webcam, screen]));
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    expect(await answerUntilReplaced(ownerTab)).toEqual([
      { type: "media", change: { type: "answered" } },
      { type: "media", change: { type: "replaced" } },
    ]);

    expect(instance.media.calls("pull")).toBe(pulls + 1);
    await vi.waitFor(() => expect(names(instance)[1]).toEqual([]));
    expect(names(instance)[2]).toHaveLength(2);
  });
});

describe("a tab that leaves during a replacement", () => {
  /** How the owner's tab goes, once the replacement has reached `when`. */
  const ways = [
    { when: "pulled", how: "close" },
    { when: "pulled", how: "grace" },
    { when: "pull", how: "close" },
    { when: "connect", how: "close" },
  ] as const;

  it.each(ways)("leaves no replacement connection on record and no pull on it, gone by $how at its $when", async ({ when, how }) => {
    const { instance, owner, room, ownerTab, biaTab } = await watchingTwoOfBias();
    const held = when === "pulled" ? null : instance.media.hold(when);
    ownerTab.send({ type: "media", request: { type: "replace" } });
    if (held) await held.reached;
    else {
      await until(ownerTab, isMedia("connected"));
      await until(ownerTab, isMedia("pulled"));
    }

    if (how === "close") await ownerTab.close();
    else {
      await ownerTab.drop();
      for (let passed = 0; passed < 40_000; passed += 5000) {
        await instance.clock.advance(5000);
        await biaTab.heartbeat();
      }
    }
    // The call held returns to find the tab gone: the replacement it made, or the pull, is closed.
    const returned = { pull: "watch.ended", connect: "media.connected", pulled: null }[when];
    const before = instance.logs().filter((line) => line.event === returned).length;
    held?.release();
    if (returned) await vi.waitFor(() => expect(instance.logs().filter((line) => line.event === returned).length).toBeGreaterThan(before));

    await vi.waitFor(() => expect(names(instance).slice(1).flat()).toEqual([]));
    // Only Bia's tab has a media connection on record: the instance, started again, finds no other.
    await settle(biaTab);
    await instance.restart();
    await openRoom(owner, room);
    const restored = instance.logs().filter((line) => line.event === "restart.restored").at(-1);
    expect(restored).toMatchObject({ recorded: 1 });
  });
});
