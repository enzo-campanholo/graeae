// Watching a share: the checks on a watch request, the pull to the viewer's media
// connection, each tab's own stage, who the sharer is told is watching, and every way a
// watch ends. Tabs are driven only through their sockets and the instance's HTTP routes;
// the fake media server shows which tracks are really open.

import { describe, expect, it, vi } from "vitest";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import { startInstance } from "./harness.ts";
import {
  addMember,
  addSecondBrowser,
  connectMedia,
  createRoom,
  setUpOwner,
  shareWebcam,
  startWatching,
  startWebcam,
  stopWatching,
  stopWebcam,
  watch,
} from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

/** An owner and Bia, a member, each with a tab open on the first room, and Bia's webcam live. */
async function biaSharing() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  await shareWebcam(biaTab);
  await ownerTab.next(); // Bia's webcam went live
  const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
  const ownerId = ownerState.people.you.id;
  return { instance, owner, bia, room, ownerTab, biaTab, ownerId, biaId: biasWebcam.member, biasWebcam };
}

/** Bia sharing, and Caio, a third member, with a tab open on the room too. */
async function caioToo() {
  const setting = await biaSharing();
  const { instance, owner, room, ownerTab, biaTab } = setting;
  const { browser: caio } = await addMember(instance, owner, "Caio");
  const { tab: caioTab, state } = await openRoom(caio, room);
  await settle(ownerTab); // Caio was added, and arrived
  await settle(biaTab);
  return { ...setting, caio, caioTab, caioId: state.people.you.id, caiosWebcam: { member: state.people.you.id, kind: "webcam" } as LiveShare };
}

/**
 * Another device of `browser`'s member, with a tab open on `room` and its media
 * connection made. `open` are the tabs already on the room, which hear of it.
 */
async function secondDevice(
  instance: Awaited<ReturnType<typeof startInstance>>,
  browser: Parameters<typeof addSecondBrowser>[1],
  room: string,
  open: Tab[],
) {
  const { other } = await addSecondBrowser(instance, browser);
  const { tab } = await openRoom(other, room);
  await connectMedia(tab);
  for (const already of open) await settle(already);
  return { browser: other, tab };
}

/** The watching area's messages `tab` has had so far. */
function watchingMessages(tab: Tab): ServerMessage[] {
  return tab.received().filter((message) => message.type === "watching");
}

/** Lets every request already sent reach the instance and be answered, by asking for one more thing and waiting for it. */
async function settle(tab: Tab) {
  tab.send({ type: "media", request: { type: "answer", answer: "v=0 settle" } });
  for (;;) {
    const message = await tab.next();
    if (message.type === "media" && message.change.type === "answered") return;
  }
}

describe("watching a share", () => {
  it("pulls the share's track to the viewer's media connection and puts it on their stage", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);

    const video = await watch(ownerTab, biasWebcam);

    const [bias, owners] = instance.media.connections();
    expect(owners).toEqual([{ name: bias![0]!.name, mid: video }]);
    expect(instance.media.answers()[1]).toEqual(["v=0 a stand-in answer"]);
  });

  it("starts with nothing watched: a tab opens on an empty stage and pulls nothing", async () => {
    const { instance, owner, room } = await biaSharing();

    const { state } = await openRoom(owner, room);

    expect(state.watching).toEqual({ stage: [], watchers: [] });
    expect(instance.media.connections()).toHaveLength(1); // Bia's own, sending
  });

  it("adds one share to the stage or takes it off, leaving the other watched shares alone", async () => {
    const { instance, ownerTab, caioTab, biaTab, biasWebcam, caiosWebcam } = await caioToo();
    await shareWebcam(caioTab);
    await settle(ownerTab); // Caio's webcam went live
    await settle(biaTab);
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    const caios = await watch(ownerTab, caiosWebcam);

    stopWatching(ownerTab, biasWebcam);

    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasWebcam } });
    const owners = instance.media.connections()[2];
    expect(owners).toEqual([{ name: instance.media.connections()[1]![0]!.name, mid: caios }]);
  });

  it("can watch the same share again once it stopped watching it", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    stopWatching(ownerTab, biasWebcam);
    await ownerTab.next(); // unwatched

    await watch(ownerTab, biasWebcam);

    expect(instance.media.connections()[1]).toHaveLength(1);
  });

  it("belongs to the device: two devices of one member have separate stages", async () => {
    const { instance, owner, room, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    const laptop = await secondDevice(instance, owner, room, [ownerTab, biaTab]);

    await watch(ownerTab, biasWebcam);
    await settle(laptop.tab);
    expect(watchingMessages(laptop.tab)).toEqual([]);

    await watch(laptop.tab, biasWebcam);
    stopWatching(ownerTab, biasWebcam);
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasWebcam } });
    await settle(laptop.tab);
    expect(watchingMessages(laptop.tab)).toEqual([{ type: "watching", change: { type: "watched", share: biasWebcam } }]);
    const [, phones, laptops] = instance.media.connections();
    expect(phones).toEqual([]);
    expect(laptops).toHaveLength(1);
  });

  it("never hands a browser a media server identifier", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    stopWatching(ownerTab, biasWebcam);
    await ownerTab.next(); // unwatched

    const identifiers = instance.media.identifiers();
    for (const tab of [ownerTab, biaTab]) {
      await tab.close();
      const everything = JSON.stringify(tab.received());
      for (const identifier of identifiers) expect(everything).not.toContain(identifier);
    }
  });
});

describe("who is watching", () => {
  it("is told to the sharer, and to nobody else", async () => {
    const { ownerTab, biaTab, caioTab, ownerId, biasWebcam } = await caioToo();
    await connectMedia(ownerTab);

    await watch(ownerTab, biasWebcam);

    await settle(biaTab);
    expect(watchingMessages(biaTab)).toEqual([
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [ownerId] } },
    ]);
    await settle(caioTab);
    expect(watchingMessages(caioTab)).toEqual([]);
    expect(watchingMessages(ownerTab)).toEqual([{ type: "watching", change: { type: "watched", share: biasWebcam } }]);
  });

  it("is in the room's state for the sharer's tab that opens later, and for nobody else's", async () => {
    const { owner, bia, room, ownerTab, ownerId, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);

    const { state: biasLater } = await openRoom(bia, room);
    const { state: ownersLater } = await openRoom(owner, room);

    expect(biasLater.watching).toEqual({ stage: [], watchers: [{ share: biasWebcam, members: [ownerId] }] });
    expect(ownersLater.watching).toEqual({ stage: [], watchers: [] });
  });

  it("names the members in the order they began watching", async () => {
    const { ownerTab, biaTab, caioTab, ownerId, caioId, biasWebcam } = await caioToo();
    await connectMedia(caioTab);
    await connectMedia(ownerTab);

    await watch(caioTab, biasWebcam);
    await watch(ownerTab, biasWebcam);

    await settle(biaTab);
    expect(watchingMessages(biaTab)).toEqual([
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [caioId] } },
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [caioId, ownerId] } },
    ]);
  });

  it("names a member once however many devices they watch on", async () => {
    const { instance, owner, room, ownerTab, biaTab, ownerId, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    const laptop = await secondDevice(instance, owner, room, [ownerTab, biaTab]);

    await watch(ownerTab, biasWebcam);
    await watch(laptop.tab, biasWebcam);
    stopWatching(ownerTab, biasWebcam);
    await ownerTab.next(); // unwatched
    await settle(biaTab);

    expect(watchingMessages(biaTab)).toEqual([
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [ownerId] } },
    ]);

    stopWatching(laptop.tab, biasWebcam);
    expect(await biaTab.next()).toEqual({
      type: "watching",
      change: { type: "watchers", share: biasWebcam, members: [] },
    });
  });

  it("never lists the sharer watching their own share from another device", async () => {
    const { instance, bia, room, biaTab, biasWebcam } = await biaSharing();
    const phone = await secondDevice(instance, bia, room, [biaTab]);

    await watch(phone.tab, biasWebcam);
    await settle(biaTab);

    expect(watchingMessages(biaTab)).toEqual([]);
    expect(instance.media.connections()[1]).toHaveLength(1);
  });
});

describe("a watch request", () => {
  it("is refused to a tab that has not made its media connection", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();

    startWatching(ownerTab, biasWebcam);

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.connections()).toHaveLength(1);
  });

  it("is refused to a device the instance has forgotten, though its tab is still open", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    // Using the setup secret again forgets every other device of the owner's.
    await setUpOwner(instance.browser());

    startWatching(ownerTab, biasWebcam);

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.connections()[1]).toEqual([]);
  });

  it("is refused to a tab on another room than the one the share is live in", async () => {
    const { instance, owner, ownerTab, biasWebcam } = await biaSharing();
    const elsewhere = await createRoom(owner, "Late shift");
    await ownerTab.next(); // the owner has a second room
    const { tab: elsewhereTab } = await openRoom(owner, `/r/${elsewhere}`);
    await connectMedia(elsewhereTab);

    startWatching(elsewhereTab, biasWebcam);

    expect(await elsewhereTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.connections()[1]).toEqual([]);
  });

  it("is refused for a share that is not live", async () => {
    const { instance, ownerTab, ownerId, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    const nobodys: LiveShare = { member: ownerId, kind: "screen" };

    startWatching(ownerTab, nobodys);
    startWatching(ownerTab, { ...biasWebcam, kind: "screen" });

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: nobodys } });
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "pull-refused" } });
    expect(instance.media.connections()[1]).toEqual([]);
  });

  it("is refused for a share that is still starting", async () => {
    const { instance, owner, room, ownerTab, ownerId } = await biaSharing();
    await connectMedia(ownerTab);
    const { tab: second } = await openRoom(owner, room);
    await connectMedia(second);
    const publish = instance.media.hold("publish");
    startWebcam(ownerTab);
    await publish.reached;

    startWatching(second, { member: ownerId, kind: "webcam" });

    expect(await second.next()).toMatchObject({ type: "media", change: { type: "pull-refused" } });
    publish.release();
    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "published" } });
  });

  it("is refused from the tab that sends the share", async () => {
    const { instance, biaTab, biasWebcam } = await biaSharing();

    startWatching(biaTab, biasWebcam);

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.connections()[0]).toHaveLength(1);
  });

  it("is refused when the media server fails the pull, and can be made again", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    instance.media.fail("pull");

    startWatching(ownerTab, biasWebcam);

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    await watch(ownerTab, biasWebcam);
  });

  it("writes its record before the media server is called, so asking twice pulls once", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    const pull = instance.media.hold("pull");

    startWatching(ownerTab, biasWebcam);
    await pull.reached;
    startWatching(ownerTab, biasWebcam);
    pull.release();

    expect(await ownerTab.next()).toMatchObject({ type: "media", change: { type: "pulled" } });
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "watched", share: biasWebcam } });
    await settle(ownerTab);
    expect(ownerTab.received().filter((message) => message.type === "media" && message.change.type !== "answered")).toHaveLength(2);
    expect(instance.media.connections()[1]).toHaveLength(1);
  });

  it("leaves no pull behind when the tab leaves while the media server is answering", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    await pull.reached;

    await ownerTab.close();
    expect(await biaTab.next()).toMatchObject({ type: "presence", change: { type: "left" } });
    expect(instance.media.connections()[1], "the media server pulled it").toHaveLength(1);
    pull.release();

    await vi.waitFor(() => expect(instance.media.connections()[1]).toEqual([]));
    await settle(biaTab);
    expect(watchingMessages(biaTab)).toEqual([]);
  });

  it("leaves no pull behind when the share ends while the media server is answering", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    const pull = instance.media.hold("pull", { done: true });
    startWatching(ownerTab, biasWebcam);
    await pull.reached;

    stopWebcam(biaTab);
    expect(await ownerTab.next()).toMatchObject({ type: "shares", change: { type: "ended" } });
    expect(instance.media.connections()[1], "the media server pulled it").toHaveLength(1);
    pull.release();

    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    expect(instance.media.connections()[1]).toEqual([]);
  });
});

describe("stopping watching", () => {
  it("force-closes the pull, and keeps the record until the close returns", async () => {
    const { instance, bia, room, ownerTab, biaTab, ownerId, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    await biaTab.next(); // the owner is watching
    const close = instance.media.hold("close");

    stopWatching(ownerTab, biasWebcam);
    await close.reached;

    const { state } = await openRoom(bia, room);
    expect(state.watching.watchers).toEqual([{ share: biasWebcam, members: [ownerId] }]);
    close.release();
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasWebcam } });
    expect(await biaTab.next()).toEqual({ type: "watching", change: { type: "watchers", share: biasWebcam, members: [] } });
    expect(instance.media.connections()[1]).toEqual([]);
  });

  it("keeps the share on the stage when the forced close fails, so no pull is lost track of", async () => {
    const { instance, ownerTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    instance.media.fail("close");

    stopWatching(ownerTab, biasWebcam);
    await settle(ownerTab);

    expect(watchingMessages(ownerTab)).toEqual([{ type: "watching", change: { type: "watched", share: biasWebcam } }]);
    expect(instance.media.connections()[1]).toHaveLength(1);
  });

  it("force-closes the watching of a viewer's tab that leaves cleanly", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    await biaTab.next(); // the owner is watching

    await ownerTab.close();

    expect(await biaTab.next()).toMatchObject({ type: "presence", change: { type: "left" } });
    expect(await biaTab.next()).toEqual({ type: "watching", change: { type: "watchers", share: biasWebcam, members: [] } });
    expect(instance.media.connections()[1]).toEqual([]);
  });
});

describe("a share's end", () => {
  it("force-closes every watch of it, and takes it off each viewer's stage", async () => {
    const { instance, ownerTab, biaTab, caioTab, biasWebcam } = await caioToo();
    await connectMedia(ownerTab);
    await connectMedia(caioTab);
    await watch(ownerTab, biasWebcam);
    await watch(caioTab, biasWebcam);

    stopWebcam(biaTab);

    for (const viewer of [ownerTab, caioTab]) {
      expect(await viewer.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasWebcam } });
      expect(await viewer.next()).toEqual({ type: "shares", change: { type: "ended", share: biasWebcam } });
    }
    expect(instance.media.connections().flat()).toEqual([]);
  });

  it("closes the share's own tracks before the pulls of it", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    const close = instance.media.hold("close");

    stopWebcam(biaTab);
    await close.reached;

    expect(instance.media.connections()[1]).toHaveLength(1);
    close.release();
    expect(await ownerTab.next()).toMatchObject({ type: "watching", change: { type: "unwatched" } });
  });

  it("comes with the sharer's clean leave, closing every watch of what they shared", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);

    await biaTab.close();

    expect(await ownerTab.next()).toMatchObject({ type: "presence", change: { type: "left" } });
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasWebcam } });
    expect(await ownerTab.next()).toMatchObject({ type: "shares", change: { type: "ended" } });
    expect(instance.media.connections().flat()).toEqual([]);
  });
});

describe("watching", () => {
  it("survives a restart of the instance, with its pull still open", async () => {
    const { instance, bia, room, ownerTab, ownerId, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);

    await instance.restart();

    const { state } = await openRoom(bia, room);
    expect(state.watching.watchers).toEqual([{ share: biasWebcam, members: [ownerId] }]);
    expect(instance.media.connections()[1]).toHaveLength(1);
  });
});

describe("a viewer's lost connection", () => {
  /** Lets `ms` go by in steps of 5 seconds, with the tabs in `alive` beating at each. */
  async function pass(instance: Awaited<ReturnType<typeof startInstance>>, ms: number, alive: Tab[]) {
    for (let left = ms; left > 0; left -= 5000) {
      await instance.clock.advance(Math.min(left, 5000));
      for (const tab of alive) await tab.heartbeat();
    }
  }

  it("keeps the watching through the grace period, and a reconnect finds the stage as it was", async () => {
    const { instance, owner, room, ownerTab, biaTab, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    await ownerTab.drop();
    await pass(instance, 25_000, [biaTab]);

    const { state } = await openRoom(owner, room);

    expect(state.watching.stage).toEqual([biasWebcam]);
    expect(instance.media.connections()[1]).toHaveLength(1);
  });

  it("force-closes the watching when the grace period runs out", async () => {
    const { instance, ownerTab, biaTab, ownerId, biasWebcam } = await biaSharing();
    await connectMedia(ownerTab);
    await watch(ownerTab, biasWebcam);
    await ownerTab.drop();

    await pass(instance, 30_000, [biaTab]);
    await settle(biaTab);

    expect(watchingMessages(biaTab)).toEqual([
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [ownerId] } },
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [] } },
    ]);
    expect(instance.media.connections()[1]).toEqual([]);
  });
});
