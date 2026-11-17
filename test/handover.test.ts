// Hand-over: a member starts a kind of share that is already live from another of their
// tabs or devices, and chooses to share from here instead. The instance registers the
// new share first, then closes the old one and carries its viewers in the same room over
// to the new one. Tabs are driven only through their sockets and the instance's HTTP
// routes; the fake media server shows which tracks are really open.

import { describe, expect, it, vi } from "vitest";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import { startInstance } from "./harness.ts";
import {
  addMember,
  addSecondBrowser,
  connectMedia,
  createRoom,
  FAKE_ANSWER,
  FAKE_AUDIO_MID,
  FAKE_OFFER,
  FAKE_VIDEO_MID,
  setUpOwner,
  shareScreen,
  shareWebcam,
  startWebcam,
  watch,
} from "./steps.ts";
import { addressOf, openRoom, type Tab } from "./sockets.ts";

/**
 * The owner and Bia, each with a tab on the first room. Bia's laptop shares its webcam
 * and the owner watches it. Bia's phone, another of her devices, has a tab on `phoneRoom`
 * (the first room unless a test says otherwise) with its media connection made. A screen
 * share goes out at two qualities when `twoQualities` says so.
 */
async function biaOnTwoDevices({ otherRoom = false, kind = "webcam" as "webcam" | "screen", twoQualities = false } = {}) {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const second = otherRoom ? await createRoom(owner, "Second") : room;
  const { browser: bia } = await addMember(instance, owner, "Bia", otherRoom ? [addressOf(room), second] : undefined);
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: laptop, state } = await openRoom(bia, room);
  await settle(ownerTab); // Bia arrived
  if (kind === "webcam") await shareWebcam(laptop);
  else await shareScreen(laptop, { twoQualities });
  await settle(ownerTab); // Bia's share went live
  const share: LiveShare = { member: state.people.you.id, kind };
  await connectMedia(ownerTab);
  const watchedOn = await watch(ownerTab, share);
  await settle(laptop); // the owner is watching

  const { other: phoneBrowser } = await addSecondBrowser(instance, bia);
  const { tab: phone } = await openRoom(phoneBrowser, second);
  await connectMedia(phone);
  await settle(ownerTab);
  await settle(laptop);
  return { instance, owner, bia, phoneBrowser, room, second, ownerTab, laptop, phone, share, ownerId: ownerState.people.you.id, watchedOn };
}

/** What the page sends to share `kind` from here, stopping it on the member's other device. */
function handOver(
  tab: Tab,
  kind: "webcam" | "screen" = "webcam",
  { audio = true, video = FAKE_VIDEO_MID, twoQualities = false } = {},
) {
  tab.send({
    type: "shares",
    request:
      kind === "webcam"
        ? { type: "start", kind, offer: FAKE_OFFER, video, handOver: true }
        : {
            type: "start",
            kind,
            offer: FAKE_OFFER,
            video,
            browser: "chromium",
            handOver: true,
            ...(audio ? { audio: FAKE_AUDIO_MID } : {}),
            ...(twoQualities ? { twoQualities: true as const } : {}),
          },
  });
}

/** Lets every request already sent reach the instance and be answered, by asking for one more thing and waiting for it. */
async function settle(tab: Tab) {
  tab.send({ type: "media", request: { type: "answer", answer: "v=0 settle" } });
  for (;;) {
    const message = await tab.next();
    if (message.type === "media" && message.change.type === "answered") return;
  }
}

/** Reads `tab`'s messages up to and including the first that `matches`. */
async function until(tab: Tab, matches: (message: ServerMessage) => boolean): Promise<ServerMessage> {
  for (;;) {
    const message = await tab.next();
    if (matches(message)) return message;
  }
}

/** The tracks open on each media connection, in the order the connections were made. */
function tracks(instance: Awaited<ReturnType<typeof startInstance>>) {
  return instance.media.connections();
}

describe("handing a webcam share over within a room", () => {
  it("makes the new device's share live and closes the old device's", async () => {
    const { instance, phone, laptop } = await biaOnTwoDevices();
    const [laptops] = tracks(instance);

    handOver(phone);

    expect(await phone.next()).toEqual({ type: "media", change: { type: "published", kind: "webcam", answer: expect.any(String) } });
    expect(await until(laptop, (message) => message.type === "media")).toEqual({
      type: "media",
      change: { type: "handed-over", kind: "webcam" },
    });
    await settle(phone);
    const [laptopsNow, , phones] = tracks(instance);
    expect(laptopsNow).toEqual([]);
    expect(phones).toEqual([{ name: expect.any(String), mid: FAKE_VIDEO_MID }]);
    expect(phones![0]!.name).not.toBe(laptops![0]!.name);
  });

  it("leaves the room listing one webcam of the member's, sent from the new device", async () => {
    const { owner, room, phone, ownerTab, share } = await biaOnTwoDevices();
    const before = ownerTab.received().length;

    handOver(phone);

    expect(await until(ownerTab, (message) => message.type === "shares")).toEqual({
      type: "shares",
      change: { type: "started", share },
    });
    await settle(phone);
    await settle(ownerTab);
    const after = ownerTab.received().slice(before);
    expect(after.filter((message) => message.type === "shares")).toHaveLength(1); // no "ended"
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([share]);
  });
});

describe("a viewer of a share handed over within the room", () => {
  it("is moved: the old pull is closed, the new share pulled in its place, and the share stays on their stage", async () => {
    const { instance, phone, ownerTab, share, watchedOn } = await biaOnTwoDevices();

    handOver(phone);

    const moved = await until(ownerTab, (message) => message.type === "media");
    expect(moved).toEqual({
      type: "media",
      change: { type: "moved", share, offer: expect.any(String), video: expect.any(String) },
    });
    ownerTab.send({ type: "media", request: { type: "answer", answer: FAKE_ANSWER } });
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "answered" } });
    const [, owners, phones] = tracks(instance);
    expect(owners).toEqual([{ name: phones![0]!.name, mid: (moved as { change: { video: string } }).change.video }]);
    expect((moved as { change: { video: string } }).change.video).not.toBe(watchedOn);
    // Nothing took it off the stage.
    expect(ownerTab.received().filter((message) => message.type === "watching").map((message) => message.change.type)).toEqual([
      "watched",
    ]);
  });

  it("is named to the sharer's new device as watching, once", async () => {
    const { phone, ownerId, share } = await biaOnTwoDevices();

    handOver(phone);

    expect(await until(phone, (message) => message.type === "watching")).toEqual({
      type: "watching",
      change: { type: "watchers", share, members: [ownerId] },
    });
    await settle(phone);
    expect(phone.received().filter((message) => message.type === "watching")).toHaveLength(1);
  });

  it("is not moved when it is the device the share is handed over to: its pull is closed", async () => {
    const { instance, bia, room, ownerTab, laptop, share } = await biaOnTwoDevices();
    // A second tab on Bia's laptop watches her webcam, then shares it from there.
    const { tab: second } = await openRoom(bia, room);
    await connectMedia(second);
    await watch(second, share);
    await settle(ownerTab);
    await settle(laptop);

    // The tab pulls on mid 0, so its camera is offered on another.
    handOver(second, "webcam", { video: "5" });

    expect(await until(second, (message) => message.type === "watching")).toEqual({
      type: "watching",
      change: { type: "unwatched", share },
    });
    await settle(second);
    await settle(ownerTab);
    const [laptops, owners, , seconds] = tracks(instance);
    expect(laptops).toEqual([]);
    expect(seconds).toEqual([{ name: expect.any(String), mid: "5" }]);
    expect(owners).toEqual([{ name: seconds![0]!.name, mid: expect.any(String) }]);
  });

  it("is not moved while their connection is lost: the pull is closed, and their stage is empty when they are back", async () => {
    const { instance, owner, room, phone, ownerTab } = await biaOnTwoDevices();
    await ownerTab.drop();

    handOver(phone);
    await settle(phone);

    const [, owners] = tracks(instance);
    expect(owners).toEqual([]);
    const { state } = await openRoom(owner, room);
    expect(state.watching.stage).toEqual([]);
  });

  it("keeps the quality they chose when the new share has two qualities too", async () => {
    const { instance, phone, ownerTab, share } = await biaOnTwoDevices({ kind: "screen", twoQualities: true });
    ownerTab.send({ type: "watching", request: { type: "quality", share, quality: "720p" } });
    await until(ownerTab, (message) => message.type === "watching" && message.change.type === "quality");

    handOver(phone, "screen", { twoQualities: true });

    expect(await until(ownerTab, (message) => message.type === "media")).toMatchObject({ change: { type: "moved" } });
    await settle(ownerTab);
    expect(ownerTab.received().at(-2)).not.toMatchObject({ type: "watching", change: { type: "quality" } });
    expect(instance.media.preferred()).toEqual([{ mid: expect.any(String), quality: "720p" }]);
  });

  it("is told it watches at Auto when the new share has one quality", async () => {
    const { phone, ownerTab, share } = await biaOnTwoDevices({ kind: "screen", twoQualities: true });
    ownerTab.send({ type: "watching", request: { type: "quality", share, quality: "720p" } });
    await until(ownerTab, (message) => message.type === "watching" && message.change.type === "quality");

    // Firefox sends one quality.
    phone.send({
      type: "shares",
      request: { type: "start", kind: "screen", offer: FAKE_OFFER, video: FAKE_VIDEO_MID, browser: "firefox", handOver: true },
    });

    expect(await until(ownerTab, (message) => message.type === "media")).toMatchObject({ change: { type: "moved" } });
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share, quality: "auto" } });
  });
});

describe("handing a screen share over", () => {
  it("closes the old video and screen audio together, and moves viewers to both new tracks", async () => {
    const { instance, phone, laptop, ownerTab, share } = await biaOnTwoDevices({ kind: "screen" });

    handOver(phone, "screen");

    expect(await until(laptop, (message) => message.type === "media")).toEqual({
      type: "media",
      change: { type: "handed-over", kind: "screen" },
    });
    const moved = await until(ownerTab, (message) => message.type === "media");
    expect(moved).toEqual({
      type: "media",
      change: { type: "moved", share, offer: expect.any(String), video: expect.any(String), audio: expect.any(String) },
    });
    const [laptops, owners, phones] = tracks(instance);
    expect(laptops).toEqual([]);
    expect(phones).toHaveLength(2);
    expect(owners!.map((track) => track.name).toSorted()).toEqual(phones!.map((track) => track.name).toSorted());
  });
});

describe("one share of each kind per member", () => {
  it("is the rule across the whole instance: a second start without hand-over is refused, in another room too", async () => {
    const { instance, phone, laptop, ownerTab } = await biaOnTwoDevices({ otherRoom: true });

    startWebcam(phone);

    expect(await phone.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    await settle(laptop);
    await settle(ownerTab);
    expect(laptop.received().filter((message) => message.type === "media" && message.change.type === "handed-over")).toEqual([]);
    expect(tracks(instance).map((open) => open.length)).toEqual([1, 1, 0]);
  });

  it("lets a hand-over start as an ordinary share when nothing of that kind is live", async () => {
    const { phone, laptop } = await biaOnTwoDevices();
    laptop.send({ type: "shares", request: { type: "stop", kind: "webcam" } });
    await until(laptop, (message) => message.type === "shares" && message.change.type === "ended");

    handOver(phone);

    expect(await until(phone, (message) => message.type === "media")).toMatchObject({ type: "media", change: { type: "published", kind: "webcam" } });
  });

  it("refuses a hand-over from the tab that already sends the share", async () => {
    const { laptop } = await biaOnTwoDevices();

    handOver(laptop);

    expect(await until(laptop, (message) => message.type === "media")).toEqual({
      type: "media",
      change: { type: "refused", kind: "webcam" },
    });
  });
});

describe("a failed hand-over", () => {
  it("leaves the old share carrying on untouched when the new one fails to register", async () => {
    const { instance, phone, laptop, ownerTab } = await biaOnTwoDevices();
    const before = tracks(instance);
    instance.media.fail("publish");

    handOver(phone);

    expect(await phone.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    await settle(laptop);
    await settle(ownerTab);
    expect(tracks(instance)).toEqual([...before.slice(0, 2), []]);
    expect(laptop.queued()).toEqual([]);
    expect(ownerTab.queued()).toEqual([]);
  });

  it("leaves the old share carrying on when the new device leaves before the media server answers", async () => {
    const { instance, phone, laptop, ownerTab } = await biaOnTwoDevices();
    const before = tracks(instance);
    const publish = instance.media.hold("publish");

    handOver(phone);
    await publish.reached;
    await phone.close();
    publish.release();
    await settle(laptop);
    await settle(ownerTab);

    expect(tracks(instance).slice(0, 2)).toEqual(before.slice(0, 2));
    expect(laptop.received().filter((message) => message.type === "media" && message.change.type === "handed-over")).toEqual([]);
  });

  it("keeps the old share and its viewers while its close fails, and ends it once a try succeeds", async () => {
    const { instance, owner, room, phone, laptop, ownerTab, share } = await biaOnTwoDevices();
    instance.media.fail("close");

    handOver(phone);
    await until(phone, (message) => message.type === "media");
    await settle(laptop);
    await settle(ownerTab);
    expect(tracks(instance).map((open) => open.length)).toEqual([1, 1, 1]);
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([share]);

    await instance.clock.advance(1000);

    expect(await until(laptop, (message) => message.type === "media")).toEqual({
      type: "media",
      change: { type: "handed-over", kind: "webcam" },
    });
    expect(await until(ownerTab, (message) => message.type === "watching")).toEqual({
      type: "watching",
      change: { type: "unwatched", share },
    });
    await settle(ownerTab);
    expect(ownerTab.received().filter((message) => message.type === "shares" && message.change.type === "ended")).toEqual([]);
    expect(tracks(instance).map((open) => open.length)).toEqual([0, 0, 1]);
  });
});

describe("a hand-over into a different room", () => {
  it("ends the share in the first room and carries nobody", async () => {
    const { instance, phone, laptop, ownerTab, share } = await biaOnTwoDevices({ otherRoom: true });

    handOver(phone);

    expect(await phone.next()).toMatchObject({ type: "media", change: { type: "published", kind: "webcam" } });
    expect(await phone.next()).toEqual({ type: "shares", change: { type: "started", share } });
    expect(await until(laptop, (message) => message.type === "media")).toEqual({
      type: "media",
      change: { type: "handed-over", kind: "webcam" },
    });
    expect(await until(ownerTab, (message) => message.type === "watching")).toEqual({
      type: "watching",
      change: { type: "unwatched", share },
    });
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "ended", share } });
    const [laptops, owners, phones] = tracks(instance);
    expect(laptops).toEqual([]);
    expect(owners).toEqual([]);
    expect(phones).toHaveLength(1);
  });
});

describe("a hand-over cut short by a restart", () => {
  it("is finished once the instance is back: the old share, left open, is closed", async () => {
    const { instance, owner, room, phone } = await biaOnTwoDevices();
    const close = instance.media.hold("close");

    handOver(phone);
    await close.reached;
    await instance.restart();
    await instance.clock.advance(2000);
    const { state } = await openRoom(owner, room);

    expect(state.shares.live).toHaveLength(1);
    await vi.waitFor(() => expect(tracks(instance).map((open) => open.length)).toEqual([0, 0, 1]));
  });
});

describe("the device a share was handed over from", () => {
  it("finds on reconnecting within its grace period that it no longer sends the share, though the room still lists it", async () => {
    const { bia, room, phone, laptop, share } = await biaOnTwoDevices();
    await laptop.drop();

    handOver(phone);
    await until(phone, (message) => message.type === "media");
    await settle(phone);
    const { tab: back } = await openRoom(bia, room);

    expect(back.received()[0]).toMatchObject({ type: "state", media: { connected: true, sending: [] }, state: { shares: { live: [share] } } });
  });

  it("is told in the full state which shares it sends", async () => {
    const { bia, room, laptop } = await biaOnTwoDevices();
    await laptop.drop();

    const { tab: back } = await openRoom(bia, room);

    expect(back.received()[0]).toMatchObject({ type: "state", media: { connected: true, sending: ["webcam"] } });
  });
});
