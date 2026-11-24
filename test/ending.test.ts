// A share whose end has begun no longer counts: the room hears it ended as its close
// begins, not once the media server has answered, and from then on it is not listed, not
// watchable, off its watchers' stages and not in the way of a new share of its kind by
// the same member. Its record stays until its close returns. And a start or watch that
// does not go live lets go of a media connection that then carries nothing, so the tab's
// next try makes a new one.
//
// The fake media server's `hold` keeps a close waiting, as a close on a connection whose
// browser has just gone waits about 5 seconds on the real one.

import { describe, expect, it } from "vitest";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import { startInstance, type TestBrowser, type TestInstance } from "./harness.ts";
import {
  addMember,
  connectMedia,
  setUpOwner,
  shareWebcam,
  startWatching,
  startWebcam,
  stopWebcam,
  watch,
} from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const ended = (share: LiveShare) => ({ type: "shares", change: { type: "ended", share } });
const started = (share: LiveShare) => ({ type: "shares", change: { type: "started", share } });
const unwatched = (share: LiveShare) => ({ type: "watching", change: { type: "unwatched", share } });

/** Reads `tab`'s messages up to and including the first that `matches`, and returns every message read. */
async function until(tab: Tab, matches: (message: ServerMessage) => boolean): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (matches(message)) return read;
  }
}

/** Lets every request already sent reach the instance and be answered, by asking for one more thing and waiting for it. */
async function settle(tab: Tab): Promise<ServerMessage[]> {
  tab.send({ type: "media", request: { type: "answer", answer: "v=0 settle" } });
  const read = await until(tab, (message) => message.type === "media" && message.change.type === "answered");
  return read.slice(0, -1);
}

const is = (wanted: object) => (message: ServerMessage) => JSON.stringify(message) === JSON.stringify(wanted);

/** The names of the tracks open on the fake, whichever connection they are on. */
function openNames(instance: TestInstance): string[] {
  return instance.media.connections().flat().map((track) => track.name);
}

/** The owner and Bia in the first room. Bia shares her webcam from her first tab, and the owner watches it. */
async function biaSharing() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab } = await openRoom(owner, room);
  const { tab: biaTab, state } = await openRoom(bia, room);
  await settle(ownerTab); // Bia arrived
  const webcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
  await shareWebcam(biaTab);
  const [oldTrack] = openNames(instance);
  await settle(ownerTab); // her webcam started
  await connectMedia(ownerTab, "receiving");
  await watch(ownerTab, webcam);
  await settle(biaTab); // the owner is watching
  return { instance, owner, room, bia, webcam, ownerTab, biaTab, oldTrack: oldTrack! };
}

/** Opens a new tab of `browser` on `room` and shares its webcam from it with a plain start, no hand-over. */
async function shareFromNewTab(browser: TestBrowser, room: string) {
  const { tab, state } = await openRoom(browser, room);
  await shareWebcam(tab);
  return { tab, state };
}

describe("a share whose tab leaves cleanly, while its close waits on the media server", () => {
  it("ends for the room at once, and a new tab of the member's starts the same kind with no hand-over", async () => {
    const { instance, owner, room, bia, webcam, ownerTab, biaTab, oldTrack } = await biaSharing();
    const close = instance.media.hold("close");

    await biaTab.close();
    await close.reached;

    // The room hears it ended, and the owner that it left their stage, while the close still waits.
    const heard = await until(ownerTab, is(ended(webcam)));
    expect(heard.filter((message) => message.type === "shares")).toEqual([ended(webcam)]);
    expect(await until(ownerTab, is(unwatched(webcam)))).toContainEqual(unwatched(webcam));

    const { state } = await shareFromNewTab(bia, room);
    expect(state.shares.live).toEqual([]);
    expect(await until(ownerTab, (message) => message.type === "shares")).toEqual([
      expect.objectContaining({ type: "presence" }),
      started(webcam),
    ]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);
    // The owner watches the new share while the old one's close still waits.
    await watch(ownerTab, webcam);

    close.release();
    await expect.poll(() => openNames(instance)).not.toContain(oldTrack);
    // Its close, and its old pull's, tell nobody anything more: the owner still watches the new one.
    expect(await settle(ownerTab)).toEqual([]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);
  });
});

describe("a share whose tab leaves cleanly while another tab of the member's stays", () => {
  it("ends for the room at once, and the tab that stayed starts the same kind with no hand-over", async () => {
    const { instance, owner, room, bia, webcam, ownerTab, biaTab, oldTrack } = await biaSharing();
    const { tab: stayed } = await openRoom(bia, room);
    await settle(stayed);
    const close = instance.media.hold("close");

    await biaTab.close();
    await close.reached;

    // Bia is still here, so the room hears no one leave: only that her webcam ended.
    const heard = await until(ownerTab, is(unwatched(webcam)));
    expect(heard.filter((message) => message.type === "presence" || message.type === "shares")).toEqual([ended(webcam)]);
    // The tab that stayed hears it ended, and, as the sharer's, that nobody watches it now.
    expect(await settle(stayed)).toEqual([
      ended(webcam),
      { type: "watching", change: { type: "watchers", share: webcam, members: [] } },
    ]);

    await shareWebcam(stayed);
    expect(await until(ownerTab, (message) => message.type === "shares")).toEqual([started(webcam)]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);

    close.release();
    await expect.poll(() => openNames(instance)).not.toContain(oldTrack);
    expect(await settle(ownerTab)).toEqual([]);
    expect((await settle(stayed)).filter((message) => message.type === "shares")).toEqual([]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([webcam]);
  });
});

describe("a share whose end has begun", () => {
  it("is not what a later stop from its tab ends, once the tab has started the kind again", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab, oldTrack } = await biaSharing();
    const close = instance.media.hold("close");
    stopWebcam(biaTab);
    await close.reached;
    await until(ownerTab, is(unwatched(webcam)));

    // On a transceiver of its own: the old share's is still closing.
    startWebcam(biaTab, "1");
    expect(await until(biaTab, is(started(webcam)))).toContainEqual({
      type: "media",
      change: { type: "published", kind: "webcam", answer: expect.any(String) },
    });
    await until(ownerTab, is(started(webcam)));
    const [newTrack] = openNames(instance).filter((name) => name !== oldTrack);

    stopWebcam(biaTab);
    expect(await until(ownerTab, (message) => message.type === "shares")).toEqual([ended(webcam)]);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([]);
    close.release();
    await expect.poll(() => openNames(instance)).not.toContain(newTrack);
    await expect.poll(() => openNames(instance)).toEqual([]);
  });


  it("cannot be watched, and a fresh state neither lists it nor has it on a stage", async () => {
    const { instance, owner, room, webcam, ownerTab, biaTab } = await biaSharing();
    const { browser: caio } = await addMember(instance, owner, "Caio");
    const { tab: caioTab } = await openRoom(caio, room);
    await settle(ownerTab); // Caio arrived
    await connectMedia(caioTab, "receiving");
    const close = instance.media.hold("close");

    stopWebcam(biaTab);
    await close.reached;
    await until(caioTab, is(ended(webcam)));

    startWatching(caioTab, webcam);
    expect(await caioTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: webcam } });
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([]);
    expect(state.watching.stage).toEqual([]);

    close.release();
    await expect.poll(() => openNames(instance)).toEqual([]);
  });

  it("keeps its record and its tries when its close fails, is never listed again, even across a restart, and ends once with the try that succeeds", async () => {
    const { instance, owner, room, bia, webcam, ownerTab, biaTab } = await biaSharing();
    // The close and its tries at 1 and 3 s fail; the one at 7 s succeeds.
    for (let i = 0; i < 3; i++) instance.media.fail("close");

    stopWebcam(biaTab);
    expect(await until(ownerTab, is(ended(webcam)))).toContainEqual(ended(webcam));
    await expect.poll(() => instance.media.queued("close")).toBe(2);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([]);

    await instance.restart();
    const { tab: ownerBack, state } = await openRoom(owner, room, { tab: ownerTab.id });
    const { tab: biaBack } = await openRoom(bia, room, { tab: biaTab.id });
    expect(state.shares.live).toEqual([]);
    expect(state.watching.stage).toEqual([]);
    expect(openNames(instance)).toHaveLength(2);

    for (let second = 0; second < 10; second++) {
      await instance.clock.advance(1000);
      await ownerBack.heartbeat();
      await biaBack.heartbeat();
      expect((await openRoom(owner, room)).state.shares.live).toEqual([]);
    }
    await expect.poll(() => openNames(instance)).toEqual([]);
    expect(instance.media.queued("close")).toBe(0);
    expect((await settle(ownerBack)).filter((message) => message.type === "shares")).toEqual([]);
  });
});

describe("a start or watch that does not go live", () => {
  it("lets go of the media connection after a plain first start refused for the member's share live from another tab", async () => {
    const { instance, room, bia, webcam, biaTab } = await biaSharing();
    const { tab } = await openRoom(bia, room);
    await connectMedia(tab, "sending");
    const before = instance.media.connections().length;

    startWebcam(tab);
    expect(await until(tab, (message) => message.type === "media")).toContainEqual({
      type: "media",
      change: { type: "refused", kind: "webcam" },
    });
    expect(await tab.next()).toEqual({ type: "media", change: { type: "dropped", connection: "sending" } });

    // Once the other tab's share has ended, this one shares on a new connection.
    stopWebcam(biaTab);
    await until(tab, is(ended(webcam)));
    await settle(tab);
    await shareWebcam(tab);
    expect(instance.media.connections()).toHaveLength(before + 1);
  });


  it("lets go of the media connection after a refused first start, so the next connect makes a new one", async () => {
    const { instance, owner, room } = await biaSharing();
    const { tab } = await openRoom(owner, room);
    await connectMedia(tab, "sending");
    const before = instance.media.connections().length;
    instance.media.fail("publish");

    startWebcam(tab);
    expect(await tab.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    expect(await tab.next()).toEqual({ type: "media", change: { type: "dropped", connection: "sending" } });

    await shareWebcam(tab);
    expect(instance.media.connections()).toHaveLength(before + 1);
  });

  it("lets go of the media connection after a refused first watch, so the next connect makes a new one", async () => {
    const { instance, owner, room, webcam } = await biaSharing();
    const { tab } = await openRoom(owner, room);
    await connectMedia(tab, "receiving");
    const before = instance.media.connections().length;
    instance.media.fail("pull");

    startWatching(tab, webcam);
    expect(await tab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: webcam } });
    expect(await tab.next()).toEqual({ type: "media", change: { type: "dropped", connection: "receiving" } });

    await connectMedia(tab, "receiving");
    await watch(tab, webcam);
    expect(instance.media.connections()).toHaveLength(before + 1);
  });

  it("leaves alone a media connection that carries a watch", async () => {
    const { instance, owner, room, webcam, ownerTab } = await biaSharing();
    const before = openNames(instance);
    instance.media.fail("publish");

    // On a transceiver of its own: the pull has the first.
    startWebcam(ownerTab, "1");
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });

    // Nothing more: the watch carries on, on the same connection.
    expect(await settle(ownerTab)).toEqual([]);
    expect(openNames(instance)).toEqual(before);
    expect((await openRoom(owner, room, { tab: ownerTab.id })).state.watching.stage).toEqual([webcam]);
  });
});
