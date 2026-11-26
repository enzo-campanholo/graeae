// A receiving connection left with an offer nobody will answer (ticket 68). The media
// server takes no other pull into a session until the browser answers its last offer, and
// closing the pulled tracks does not change that (`docs/media-server.md`). A pull closed
// before its offer reached the tab, outside a replacement, blocks the tab's connection:
// its watches play on, and the tab's next watch pulls nothing into it, but is refused as
// blocked, so the tab replaces the connection and asks again. Tabs are driven only
// through their sockets; the fake media server plays the 406 (`oneOfferAtATime`).

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
  startWatching,
  startWebcam,
  stopWatching,
  stopWebcam,
  watch,
} from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;

/**
 * The owner watching Bia's screen, shared from her laptop with her webcam, which the
 * owner does not watch yet. The connections are made in order: the laptop's sending, the
 * owner's receiving. The media server takes no pull on a connection whose last offer is
 * unanswered, as the real one does.
 */
async function watchingBiasScreen() {
  const instance = await startInstance();
  instance.media.oneOfferAtATime();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab } = await openRoom(owner, room);
  const { tab: laptop, state } = await openRoom(bia, room);
  await settle(ownerTab); // Bia arrived
  await shareWebcam(laptop);
  startScreen(laptop, { audio: null, video: "2" });
  expect(await laptop.next()).toMatchObject({ type: "media", change: { type: "published", kind: "screen" } });
  await settle(laptop);
  await settle(ownerTab);
  const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
  const biasScreen: LiveShare = { member: state.people.you.id, kind: "screen" };
  await connectMedia(ownerTab, "receiving");
  await watch(ownerTab, biasScreen);
  await settle(laptop); // the owner is watching it
  return { instance, owner, bia, room, ownerTab, laptop, biasWebcam, biasScreen };
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

/** Answers `tab`'s pulls until the replacement ends, `replaced` or, carrying nothing, `dropped`; every message it read on the way. */
async function answerUntilDone(tab: Tab): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (isMedia("replaced")(message) || isMedia("dropped")(message)) return read;
    if (isMedia("pulled")(message)) tab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
  }
}

/**
 * Has `tab` watch `share` as the page does when its receiving connection is blocked: the
 * watch is refused as blocked, the tab replaces the connection, answering each step, and
 * asks again. Returns the shares the replacement pulled.
 */
async function watchPastTheBlock(tab: Tab, share: LiveShare): Promise<LiveShare[]> {
  startWatching(tab, share);
  expect(await tab.next()).toEqual({ type: "media", change: { type: "pull-refused", share, blocked: true } });
  tab.send({ type: "media", request: { type: "replace" } });
  expect(await tab.next()).toMatchObject({ type: "media", change: { type: "connected", connection: "receiving" } });
  const steps = await answerUntilDone(tab);
  expect(steps.at(-1)).toEqual({ type: "media", change: { type: "replaced" } });
  await watch(tab, share);
  return steps.flatMap((message) => (message.type === "media" && message.change.type === "pulled" ? [message.change.share] : []));
}

/** The names of the tracks open on each media connection, oldest connection first. */
function names(instance: TestInstance): string[][] {
  return instance.media.connections().map((tracks) => tracks.map((track) => track.name));
}

/** The pulls the media server refused, by the instance's logs: none, when no 406 was ever asked for. */
function refusedPulls(instance: TestInstance) {
  return instance.logs().filter((line) => line.event === "media-server" && line.op === "pull" && line.ok === false);
}

/** The lines the instance wrote of `event`. */
function lines(instance: TestInstance, event: string) {
  return instance.logs().filter((line) => line.source === "instance" && line.event === event);
}

/** Bia's laptop starts its webcam again, and the owner hears it go live. */
async function webcamAgain(laptop: Tab, ownerTab: Tab) {
  startWebcam(laptop);
  await until(laptop, isMedia("published"));
  await until(ownerTab, (message) => message.type === "shares" && message.change.type === "started");
  await settle(laptop);
}

/**
 * Case A: the owner asks to watch Bia's webcam, and she stops it while the media server
 * makes the pull. The pull returns, with an offer the owner never gets.
 */
async function blockedByAnEndedShare() {
  const setup = await watchingBiasScreen();
  const { instance, ownerTab, laptop, biasWebcam } = setup;
  const pull = instance.media.hold("pull", { done: true });
  startWatching(ownerTab, biasWebcam);
  await pull.reached;
  stopWebcam(laptop);
  await until(ownerTab, (message) => message.type === "shares" && message.change.type === "ended");
  pull.release();
  expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
  await settle(laptop);
  return setup;
}

/** Checks the owner ends with both of Bia's shares on the stage, both pulled onto a new connection, and no pull refused. */
async function bothOnANewConnection(setup: Awaited<ReturnType<typeof watchingBiasScreen>>, ownerTab: Tab) {
  const { instance, owner, room, biasWebcam, biasScreen } = setup;
  // The old connection holds nothing; the newest, the replacement, holds both pulls.
  await vi.waitFor(() => expect(names(instance)[1]).toEqual([]));
  const sent = names(instance)[0]!;
  expect(names(instance).at(-1)!.toSorted()).toEqual(sent.toSorted());
  expect(refusedPulls(instance)).toEqual([]);
  await ownerTab.drop();
  const { state } = await openRoom(owner, room, { tab: ownerTab.id });
  expect(state.watching.stage).toEqual([biasScreen, biasWebcam]);
}

describe("a receiving connection left with an offer nobody will answer", () => {
  it("is replaced on the next watch when the share ended while the media server made the pull", async () => {
    const setup = await blockedByAnEndedShare();
    const { instance, ownerTab, laptop, biasWebcam, biasScreen } = setup;
    expect(lines(instance, "media.blocked")).toEqual([
      expect.objectContaining({ why: "the share ended or the connection was replaced meanwhile", share: biasWebcam }),
    ]);

    await webcamAgain(laptop, ownerTab);
    expect(await watchPastTheBlock(ownerTab, biasWebcam)).toEqual([biasScreen]);

    // The replacement says why it was made.
    expect(lines(instance, "media.replacing")).toEqual([expect.objectContaining({ blocked: true })]);
    await bothOnANewConnection(setup, ownerTab);
  });

  it("is replaced on the next watch when the tab's socket dropped while the media server made the pull", async () => {
    const setup = await watchingBiasScreen();
    const { instance, owner, room, ownerTab, biasWebcam, biasScreen } = setup;
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    await pull.reached;
    await ownerTab.drop();
    pull.release();
    await vi.waitFor(() => expect(lines(instance, "media.blocked")).toHaveLength(1));

    // Back within its grace period, on the same connection, with the screen still on the stage.
    const { tab: back, state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([biasScreen]);
    expect(names(instance)[1]).toHaveLength(1);
    expect(await watchPastTheBlock(back, biasWebcam)).toEqual([biasScreen]);
    await bothOnANewConnection(setup, back);
  });

  it("is replaced on the next watch when a hand-over's new share ended while the move's pull was made", async () => {
    const setup = await watchingBiasScreen();
    const { instance, bia, room, ownerTab, laptop, biasWebcam, biasScreen } = setup;
    await watch(ownerTab, biasWebcam);
    await settle(laptop);
    const { other } = await addSecondBrowser(instance, bia);
    const { tab: phone } = await openRoom(other, room);
    await connectMedia(phone, "sending");
    await settle(ownerTab);
    await settle(laptop);

    // Bia hands her webcam over to her phone, and stops it there while the owner's move is pulled.
    const pull = instance.media.hold("pull", { done: true });
    phone.send({ type: "shares", request: { type: "start", kind: "webcam", offer: FAKE_OFFER, video: FAKE_VIDEO_MID, handOver: true } });
    await until(phone, isMedia("published"));
    await pull.reached;
    stopWebcam(phone);
    await vi.waitFor(() => expect(lines(instance, "share.ending")).toHaveLength(1));
    pull.release();
    await until(ownerTab, (message) => message.type === "watching" && message.change.type === "unwatched");
    expect(lines(instance, "media.blocked")).toEqual([
      expect.objectContaining({ why: "the new share ended while the watch was moved to it" }),
    ]);
    // The connection still carries the screen: kept, and nothing more is said.
    await ownerTab.heartbeat();
    expect(ownerTab.queued().filter((message) => message.type === "media")).toEqual([]);
    await settle(ownerTab);
    await settle(phone);

    await webcamAgain(phone, ownerTab);
    expect(await watchPastTheBlock(ownerTab, biasWebcam)).toEqual([biasScreen]);
    // The phone's webcam and the laptop's screen, both pulled onto the replacement.
    await vi.waitFor(() => expect(names(instance)[1]).toEqual([]));
    expect(names(instance).at(-1)!.toSorted()).toEqual([...names(instance)[0]!, ...names(instance)[2]!].toSorted());
    expect(refusedPulls(instance)).toEqual([]);
    await ownerTab.drop();
    const { state } = await openRoom(setup.owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([biasScreen, biasWebcam]);
  });

  it("is replaced on the next watch when the instance stopped while the media server made the pull", async () => {
    const setup = await watchingBiasScreen();
    const { instance, owner, room, ownerTab, biasWebcam, biasScreen } = setup;
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    await pull.reached;

    await instance.restart();
    const { tab: back, state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual([biasScreen]);
    // The sweep closes the pull, and blocks the connection.
    await vi.waitFor(() => expect(lines(instance, "media.blocked")).toHaveLength(1));
    expect(names(instance)[1]).toHaveLength(1);

    expect(await watchPastTheBlock(back, biasWebcam)).toEqual([biasScreen]);
    await bothOnANewConnection(setup, back);
  });

  it("touches nothing until the next watch", async () => {
    const { instance, ownerTab, laptop } = await blockedByAnEndedShare();
    const screensPull = names(instance)[1];
    const connects = instance.media.calls("connect");

    for (let passed = 0; passed < 2 * 60 * SECOND; passed += 5 * SECOND) {
      await instance.clock.advance(5 * SECOND);
      await ownerTab.heartbeat();
      await laptop.heartbeat();
    }

    expect(ownerTab.queued()).toEqual([]);
    expect(instance.media.calls("connect")).toBe(connects);
    expect(names(instance)[1]).toEqual(screensPull);
    expect(lines(instance, "media.replacing")).toEqual([]);
  });

  it("is still replaced on the next watch after the instance is evicted", async () => {
    const setup = await blockedByAnEndedShare();
    const { instance, ownerTab, laptop, biasWebcam, biasScreen } = setup;

    await instance.evict();
    await webcamAgain(laptop, ownerTab);

    expect(await watchPastTheBlock(ownerTab, biasWebcam)).toEqual([biasScreen]);
    await bothOnANewConnection(setup, ownerTab);
  });

  it("is still replaced on the next watch after the instance restarts", async () => {
    const setup = await blockedByAnEndedShare();
    const { instance, owner, bia, room, ownerTab, laptop, biasWebcam, biasScreen } = setup;

    const swept = lines(instance, "restart.swept").length;
    await instance.restart();
    const { tab: back } = await openRoom(owner, room, { tab: ownerTab.id });
    const { tab: laptopBack } = await openRoom(bia, room, { tab: laptop.id });
    await vi.waitFor(() => expect(lines(instance, "restart.swept")).toHaveLength(swept + 1));
    await settle(back);
    await webcamAgain(laptopBack, back);

    expect(await watchPastTheBlock(back, biasWebcam)).toEqual([biasScreen]);
    await bothOnANewConnection(setup, back);
  });

  it("is no longer blocked once replaced for another reason", async () => {
    const { instance, ownerTab, laptop, biasWebcam } = await blockedByAnEndedShare();

    // The browser gives up on the connection, and the tab replaces it.
    ownerTab.send({ type: "media", request: { type: "replace" } });
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "connected", connection: "receiving" } });
    await answerUntilDone(ownerTab);
    await webcamAgain(laptop, ownerTab);

    await watch(ownerTab, biasWebcam);
    expect(refusedPulls(instance)).toEqual([]);
  });

  it("is let go of when it carries nothing else, and the next watch makes a new one", async () => {
    const instance = await startInstance();
    instance.media.oneOfferAtATime();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: laptop, state } = await openRoom(bia, room);
    await settle(ownerTab);
    await shareWebcam(laptop);
    await settle(ownerTab);
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    await connectMedia(ownerTab, "receiving");
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    await pull.reached;
    stopWebcam(laptop);
    await until(ownerTab, (message) => message.type === "shares" && message.change.type === "ended");
    pull.release();

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "dropped", connection: "receiving" } });
    await webcamAgain(laptop, ownerTab);
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasWebcam);
    expect(refusedPulls(instance)).toEqual([]);
  });

  it("is let go of on the next watch once its other watches have ended, and the tab makes a new one", async () => {
    const { instance, ownerTab, laptop, biasWebcam, biasScreen } = await blockedByAnEndedShare();
    // The owner stops watching the screen: its pull closes on the blocked connection.
    stopWatching(ownerTab, biasScreen);
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasScreen } });
    await webcamAgain(laptop, ownerTab);

    startWatching(ownerTab, biasWebcam);
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "dropped", connection: "receiving" } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam, blocked: true } });
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasWebcam);
    expect(refusedPulls(instance)).toEqual([]);
  });
});
