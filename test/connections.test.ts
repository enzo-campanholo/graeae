// A tab's two media connections (ADR 0005): it sends its shares on one and receives its
// watches on the other, each made the first time it is needed. The receiving connection is
// never restarted: it is replaced, the instance pulling each watch again onto a new one and
// closing the old pulls. Tabs are driven only through their sockets; what the media server
// holds is read from the fake, one list of tracks per connection, oldest connection first.

import { describe, expect, it, vi } from "vitest";
import type { LiveShare } from "../src/shared/socket/index.ts";
import { startInstance, type TestBrowser } from "./harness.ts";
import {
  addMember,
  connectMedia,
  FAKE_ANSWER,
  setUpOwner,
  shareWebcam,
  startScreen,
  startWatching,
  watch,
} from "./steps.ts";
import { addressOf, openRoom, type Tab } from "./sockets.ts";

/** Has `tab`, already sharing its webcam, share its screen too, with no sound, and `other` hear it go live. */
async function alsoShareScreen(tab: Tab, other: Tab) {
  startScreen(tab, { audio: null, video: "2" });
  expect(await tab.next()).toMatchObject({ type: "media", change: { type: "published", kind: "screen" } });
  expect(await tab.next()).toMatchObject({ type: "shares", change: { type: "started" } });
  expect(await other.next()).toMatchObject({ type: "shares", change: { type: "started" } });
}

/** The connections the instance tells `tab`, opened again, that it holds. */
async function connectedOn(browser: TestBrowser, room: string, tab: Tab) {
  const { tab: back } = await openRoom(browser, room, { tab: tab.id });
  const [first] = back.received();
  if (first?.type !== "state") throw new Error(`expected the state, got ${JSON.stringify(first)}`);
  return first.media.connected;
}

/** The owner and Bia in the first room, each sharing a webcam and watching the other's. */
async function eachSharingAndWatching() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  const ownersWebcam: LiveShare = { member: ownerState.people.you.id, kind: "webcam" };
  const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
  await shareWebcam(ownerTab);
  await biaTab.next(); // the owner's webcam went live
  await shareWebcam(biaTab);
  await ownerTab.next(); // Bia's webcam went live
  await connectMedia(ownerTab, "receiving");
  await watch(ownerTab, biasWebcam);
  await biaTab.next(); // the owner is watching
  await connectMedia(biaTab, "receiving");
  await watch(biaTab, ownersWebcam);
  await ownerTab.next(); // Bia is watching
  return { instance, owner, bia, room, ownerTab, biaTab, ownersWebcam, biasWebcam };
}

/** The names of the tracks open on each connection, oldest connection first. */
function names(instance: { media: { connections(): { name: string }[][] } }) {
  return instance.media.connections().map((tracks) => tracks.map((track) => track.name));
}

/** Answers each of the replacement's pulls in turn, returning the shares pulled, until `replaced`. */
async function answerReplacement(tab: Tab): Promise<LiveShare[]> {
  const pulled: LiveShare[] = [];
  for (;;) {
    const message = await tab.next();
    if (message.type === "media" && message.change.type === "replaced") return pulled;
    if (message.type !== "media" || message.change.type !== "pulled") throw new Error(`expected a pull, got ${JSON.stringify(message)}`);
    pulled.push(message.change.share);
    tab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    expect(await tab.next()).toEqual({ type: "media", change: { type: "answered" } });
  }
}

describe("a tab that shares and watches", () => {
  it("sends on one media connection and receives on another, each pull going from the sharer's sending connection to the viewer's receiving one", async () => {
    const { instance, owner, room, ownerTab } = await eachSharingAndWatching();

    // Made in order: the owner's sending, Bia's sending, the owner's receiving, Bia's receiving.
    const [ownersSending, biasSending, ownersReceiving, biasReceiving] = names(instance);
    expect(ownersSending).toHaveLength(1);
    expect(biasSending).toHaveLength(1);
    expect(ownersReceiving).toEqual(biasSending);
    expect(biasReceiving).toEqual(ownersSending);

    // And the tab hears which connections it holds when it comes back.
    await ownerTab.drop();
    expect([...(await connectedOn(owner, room, ownerTab))].sort()).toEqual(["receiving", "sending"]);
  });

  it("holds only a sending connection while it only shares, and only a receiving one while it only watches", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived
    await shareWebcam(biaTab);
    await ownerTab.next(); // her webcam went live
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, { member: biaState.people.you.id, kind: "webcam" });

    expect(await connectedOn(bia, room, biaTab)).toEqual(["sending"]);
    expect(await connectedOn(owner, room, ownerTab)).toEqual(["receiving"]);
  });

  it("is refused a share on its receiving connection alone, and a watch on its sending connection alone", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived
    await shareWebcam(biaTab);
    await ownerTab.next(); // her webcam went live
    const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };

    await connectMedia(ownerTab, "sending");
    startWatching(ownerTab, biasWebcam);
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.calls("pull")).toBe(0);
  });
});

describe("a replacement of the receiving connection", () => {
  it("pulls every watch again onto a new connection, then closes the old pulls, with nobody else hearing of it", async () => {
    const { instance, owner, room, ownerTab, biaTab, biasWebcam } = await eachSharingAndWatching();
    await alsoShareScreen(biaTab, ownerTab);
    const biasScreen: LiveShare = { member: biasWebcam.member, kind: "screen" };
    await watch(ownerTab, biasScreen);
    await biaTab.next(); // the owner is watching it
    const [, , oldReceiving] = names(instance);
    expect(oldReceiving).toHaveLength(2);
    const credentials = instance.media.credentials().length;

    ownerTab.send({ type: "media", request: { type: "replace" } });

    expect(await ownerTab.next()).toEqual({
      type: "media",
      change: { type: "connected", connection: "receiving", iceServers: expect.any(Array) },
    });
    // With a credential of its own.
    expect(instance.media.credentials()).toHaveLength(credentials + 1);
    expect(await answerReplacement(ownerTab)).toEqual(expect.arrayContaining([biasWebcam, biasScreen]));

    // The old pulls are closed, and the new connection holds the same tracks.
    await vi.waitFor(() => expect(names(instance)[2]).toEqual([]));
    expect([...names(instance)[4]!].sort()).toEqual([...oldReceiving!].sort());
    // Bia heard nothing of it: the owner never stopped watching.
    await biaTab.heartbeat();
    expect(biaTab.queued()).toEqual([]);
    await ownerTab.drop();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });
    expect(state.watching.stage).toEqual(expect.arrayContaining([biasWebcam, biasScreen]));
  });

  it("goes on with a watch started while it is under way, on the new connection", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await eachSharingAndWatching();
    ownerTab.send({ type: "media", request: { type: "replace" } });
    await ownerTab.next(); // connected
    const first = await ownerTab.next();
    expect(first).toMatchObject({ type: "media", change: { type: "pulled", share: biasWebcam } });

    await alsoShareScreen(biaTab, ownerTab);
    const biasScreen: LiveShare = { member: biasWebcam.member, kind: "screen" };
    startWatching(ownerTab, biasScreen);
    const pulled = await ownerTab.next();
    expect(pulled).toMatchObject({ type: "media", change: { type: "pulled", share: biasScreen } });

    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    await ownerTab.heartbeat();
    const heard = ownerTab.queued();
    expect(heard.filter((message) => message.type === "media" && message.change.type === "answered")).toHaveLength(2);
    expect(heard).toContainEqual({ type: "media", change: { type: "replaced" } });
    expect(heard).toContainEqual({ type: "watching", change: { type: "watched", share: biasScreen } });

    await vi.waitFor(() => expect(names(instance)[2]).toEqual([]));
    expect(names(instance)[4]).toHaveLength(2);
  });

  it("lets go of a watch whose share ended before it was pulled again", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await eachSharingAndWatching();
    await alsoShareScreen(biaTab, ownerTab);
    const biasScreen: LiveShare = { member: biasWebcam.member, kind: "screen" };
    await watch(ownerTab, biasScreen);
    await biaTab.next(); // the owner is watching it
    // Both pulls fail, as though its share had gone from the media server.
    instance.media.fail("pull");
    instance.media.fail("pull");

    ownerTab.send({ type: "media", request: { type: "replace" } });
    await ownerTab.next(); // connected
    // Neither could be pulled again: the owner stops watching both, and the replacement ends.
    const heard: unknown[] = [];
    for (;;) {
      const message = await ownerTab.next();
      if (message.type === "media" && message.change.type === "replaced") break;
      heard.push(message);
    }
    expect(heard).toEqual(
      expect.arrayContaining([
        { type: "watching", change: { type: "unwatched", share: biasWebcam } },
        { type: "watching", change: { type: "unwatched", share: biasScreen } },
      ]),
    );
    await vi.waitFor(() => expect(names(instance)[2]).toEqual([]));
  });
});

describe("a replacement that cannot be made", () => {
  /** The `media.unavailable` lines the instance wrote, by what they say. */
  function unavailableLines(instance: { logs(): readonly { event: string }[] }) {
    return instance.logs().filter((line) => line.event === "media.unavailable");
  }

  it("is unavailable because it failed when the media server fails to make the new connection, and the old one keeps its pulls", async () => {
    const { instance, ownerTab, biasWebcam } = await eachSharingAndWatching();
    const before = names(instance);
    instance.media.fail("connect");

    ownerTab.send({ type: "media", request: { type: "replace" } });

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "unavailable", connection: "receiving", reason: "failed" } });
    expect(names(instance)).toEqual(before);
    expect(unavailableLines(instance).at(-1)).toMatchObject({ connection: "receiving", why: "the media server or the relay failed" });
    // Asked again once the media server is back, it goes through.
    ownerTab.send({ type: "media", request: { type: "replace" } });
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "connected", connection: "receiving" } });
    expect(await answerReplacement(ownerTab)).toEqual([biasWebcam]);
  });

  it("is unavailable because it failed when the relay refuses the new connection's credential", async () => {
    const { instance, ownerTab } = await eachSharingAndWatching();
    instance.media.fail("relayCredential");

    ownerTab.send({ type: "media", request: { type: "replace" } });

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "unavailable", connection: "receiving", reason: "failed" } });
  });

  it("is unavailable with nothing to replace for a tab with no receiving connection on record, asking the media server nothing", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const { tab } = await openRoom(owner, await setUpOwner(owner));
    await connectMedia(tab, "sending");

    tab.send({ type: "media", request: { type: "replace" } });

    expect(await tab.next()).toEqual({
      type: "media",
      change: { type: "unavailable", connection: "receiving", reason: "nothing to replace" },
    });
    expect(instance.media.calls("connect")).toBe(1);
    expect(instance.media.credentials()).toHaveLength(1);
    expect(unavailableLines(instance).at(-1)).toMatchObject({ connection: "receiving", why: "nothing to replace" });
  });

  // A member removed from the room is cut off in the same step as the storage change, and
  // nothing a cut-off tab sends is read: its ask is never answered `unavailable` ("not
  // allowed" is for a check that fails on a tab still heard), and costs nothing.
  it("is never made for a member removed from the room, whose tab hears only that it is gone", async () => {
    const { instance, owner, room, biaTab, biasWebcam } = await eachSharingAndWatching();
    const connects = instance.media.calls("connect");
    const credentials = instance.media.credentials().length;
    const close = instance.media.hold("close");
    const removing = owner.fetch(`/api/owner/people/${biasWebcam.member}/rooms/${addressOf(room)}`, { method: "DELETE" });
    await close.reached;

    biaTab.send({ type: "media", request: { type: "replace" } });
    close.release();

    expect((await removing).status).toBe(200);
    expect(await biaTab.next()).toEqual({ type: "gone" });
    await biaTab.closed();
    expect(instance.media.calls("connect")).toBe(connects);
    expect(instance.media.credentials()).toHaveLength(credentials);
    expect(unavailableLines(instance)).toEqual([]);
  });
});

describe("the cut-off of a tab that shares and watches", () => {
  it("closes what both its connections carry", async () => {
    const { instance, ownerTab, biaTab } = await eachSharingAndWatching();

    await biaTab.drop();
    for (let passed = 0; passed < 30_000; passed += 5000) {
      await instance.clock.advance(5000);
      await ownerTab.heartbeat();
    }

    // Bia's webcam, the owner's pull of it, and Bia's pull of the owner's webcam are closed.
    await vi.waitFor(() => expect(names(instance).map((tracks) => tracks.length)).toEqual([1, 0, 0, 0]));
  });
});

describe("the sweep after a restart", () => {
  it("closes stray tracks on both of a tab's connections", async () => {
    const { instance, owner, room, ownerTab, biaTab, biasWebcam } = await eachSharingAndWatching();
    await alsoShareScreen(biaTab, ownerTab);
    // The owner's pull of it is made just as the instance stops, and never reaches the stage.
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, { member: biasWebcam.member, kind: "screen" });
    await pull.reached;
    expect(names(instance).map((tracks) => tracks.length)).toEqual([1, 2, 2, 1]);

    await instance.restart();
    await openRoom(owner, room, { tab: ownerTab.id });

    await vi.waitFor(() => expect(names(instance).map((tracks) => tracks.length)).toEqual([1, 2, 1, 1]));
  });
});
