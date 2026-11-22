// Screen shares: one unit of video and, when the picker gave any, screen audio, recorded,
// published, pulled and closed together. Tabs are driven only through their sockets and
// the instance's HTTP routes; the fake media server shows which tracks are really open.

import { describe, expect, it, vi } from "vitest";
import { startInstance } from "./harness.ts";
import {
  addMember,
  connectMedia,
  FAKE_OFFER,
  setUpOwner,
  shareScreen,
  startScreen,
  startWatching,
  startWebcam,
  stopScreen,
  stopWatching,
  watch,
} from "./steps.ts";
import { openRoom } from "./sockets.ts";

/** An owner and Bia, a member, each with a tab open on the first room. */
async function twoPresent() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  return {
    instance,
    owner,
    bia,
    room,
    ownerTab,
    biaTab,
    ownerId: ownerState.people.you.id,
    biaId: biaState.people.you.id,
  };
}

describe("a screen share", () => {
  it("goes live with its video and its screen audio as one unit", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();

    await shareScreen(biaTab);

    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "started", share: { member: biaId, kind: "screen", audio: true } },
    });
    expect(instance.media.connections()).toEqual([
      [
        { name: expect.any(String), mid: "0" },
        { name: expect.any(String), mid: "1" },
      ],
    ]);
  });

  it("goes live as video only when the picker gave no sound", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();

    await shareScreen(biaTab, { audio: false });

    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "started", share: { member: biaId, kind: "screen", audio: false } },
    });
    expect(instance.media.connections()).toEqual([[{ name: expect.any(String), mid: "0" }]]);
  });

  it("is refused when its audio and video name the same transceiver", async () => {
    const { instance, biaTab } = await twoPresent();
    await connectMedia(biaTab);

    startScreen(biaTab, { audio: "0", video: "0" });

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "screen" } });
    expect(instance.media.connections()).toEqual([[]]);
  });
});

describe("starting a screen share", () => {
  it("is refused while the member's screen is live from another tab", async () => {
    const { instance, bia, room, biaTab, ownerTab } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live
    const { tab: second } = await openRoom(bia, room);

    await connectMedia(second);
    startScreen(second);

    expect(await second.next()).toEqual({ type: "media", change: { type: "refused", kind: "screen" } });
    expect(instance.media.connections().flat()).toHaveLength(2);
  });

  it("leaves the member free to share a webcam beside it", async () => {
    const { biaTab, ownerTab, owner, room, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // the screen went live

    startWebcam(biaTab, "2"); // after the screen's video and audio
    expect(await biaTab.next()).toMatchObject({ type: "media", change: { type: "published", kind: "webcam" } });

    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([
      { member: biaId, kind: "screen", audio: true },
      { member: biaId, kind: "webcam" },
    ]);
  });

  it("refuses screen audio on a webcam share, which is video only", async () => {
    const { instance, biaTab } = await twoPresent();
    await connectMedia(biaTab);

    biaTab.send({
      type: "shares",
      request: { type: "start", kind: "webcam", offer: FAKE_OFFER, video: "0", audio: "1" } as never,
    });

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("writes the record of both tracks before the media server is called", async () => {
    const { instance, bia, room, biaTab } = await twoPresent();
    await connectMedia(biaTab);
    const publish = instance.media.hold("publish");

    startScreen(biaTab);
    await publish.reached;

    // The share holds its place already, so a second one is refused.
    const { tab: second } = await openRoom(bia, room);
    await connectMedia(second);
    startScreen(second);
    expect(await second.next()).toEqual({ type: "media", change: { type: "refused", kind: "screen" } });
    publish.release();
    expect(await biaTab.next()).toMatchObject({ type: "media", change: { type: "published", kind: "screen" } });
  });

  it("leaves no track behind when the media server fails it", async () => {
    const { instance, biaTab } = await twoPresent();
    await connectMedia(biaTab);
    instance.media.fail("publish");

    startScreen(biaTab);

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "screen" } });
    expect(instance.media.connections()).toEqual([[]]);
  });
});

describe("a live screen share", () => {
  it("ends for everyone when the sharer stops it, its video and audio closed together", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live

    stopScreen(biaTab);

    const ended = { type: "shares", change: { type: "ended", share: { member: biaId, kind: "screen" } } };
    expect(await ownerTab.next()).toEqual(ended);
    expect(await biaTab.next()).toEqual(ended);
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("ends when the sharer's tab leaves, with both its tracks closed", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live

    await biaTab.close();

    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "ended", share: { member: biaId, kind: "screen" } },
    });
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("keeps both tracks, though no longer listed, when its forced close fails", async () => {
    const { instance, owner, room, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live
    instance.media.fail("close");

    stopScreen(biaTab);
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "ended", share: { member: biaId, kind: "screen" } } });
    const { state } = await openRoom(owner, room);

    expect(state.shares.live).toEqual([]);
    expect(instance.media.connections().flat()).toHaveLength(2);
  });

  it("survives a restart of the instance, still saying whether it has audio", async () => {
    const { instance, owner, room, biaTab, biaId } = await twoPresent();
    await shareScreen(biaTab, { audio: false });

    await instance.restart();

    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([{ member: biaId, kind: "screen", audio: false }]);
  });
});

describe("watching a screen share", () => {
  it("pulls its video and its screen audio together", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live
    await connectMedia(ownerTab);
    const share = { member: biaId, kind: "screen" } as const;

    startWatching(ownerTab, share);

    expect(await ownerTab.next()).toEqual({
      type: "media",
      change: { type: "pulled", share, offer: expect.any(String), video: "0", audio: "1" },
    });
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "watched", share } });
    expect(instance.media.connections()[1]).toHaveLength(2);
  });

  it("pulls the video alone from a share that is video only", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab, { audio: false });
    await ownerTab.next(); // it went live
    await connectMedia(ownerTab);
    const share = { member: biaId, kind: "screen" } as const;

    startWatching(ownerTab, share);

    expect(await ownerTab.next()).toEqual({
      type: "media",
      change: { type: "pulled", share, offer: expect.any(String), video: "0" },
    });
    expect(instance.media.connections()[1]).toHaveLength(1);
  });

  it("closes both pulled tracks when the viewer stops watching", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live
    await connectMedia(ownerTab);
    const share = { member: biaId, kind: "screen" } as const;
    await watch(ownerTab, share);
    await biaTab.next(); // the owner is watching

    stopWatching(ownerTab, share);

    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share } });
    expect(instance.media.connections()[1]).toEqual([]);
  });

  it("closes every viewer's pulled tracks when the sharer stops", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareScreen(biaTab);
    await ownerTab.next(); // it went live
    await connectMedia(ownerTab);
    const share = { member: biaId, kind: "screen" } as const;
    await watch(ownerTab, share);

    stopScreen(biaTab);

    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "ended", share } });
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share } });
    await vi.waitFor(() => expect(instance.media.connections()).toEqual([[], []]));
  });
});

describe("the sweep after a restart", () => {
  it("leaves a live screen share's audio alone, as its record accounts for it", async () => {
    const { instance, owner, room, biaTab, biaId } = await twoPresent();
    await shareScreen(biaTab);

    await instance.restart();
    const { tab: back, state } = await openRoom(owner, room);
    await back.heartbeat(); // the sweep has had its turn

    expect(state.shares.live).toEqual([{ member: biaId, kind: "screen", audio: true }]);
    expect(instance.media.connections().flat()).toHaveLength(2);
  });

  it("closes both tracks of a screen share the media server made just as the instance stopped", async () => {
    const { instance, bia, room, biaTab } = await twoPresent();
    await connectMedia(biaTab);
    const publish = instance.media.hold("publish", { done: true });
    startScreen(biaTab);
    await publish.reached;
    expect(instance.media.connections().flat()).toHaveLength(2);

    await instance.restart();
    const { state } = await openRoom(bia, room);

    expect(state.shares.live).toEqual([]);
    await vi.waitFor(() => expect(instance.media.connections().flat()).toEqual([]));
  });
});
