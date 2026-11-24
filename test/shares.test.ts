// Webcam shares: going live, the checks on a start, the media connection and its relay
// credential, and each way of ending. Tabs are driven only through their sockets and the
// instance's HTTP routes; the fake media server shows which tracks are really open.

import { describe, expect, it, vi } from "vitest";
import type { MeAnswer } from "../src/shared/api.ts";
import { startInstance } from "./harness.ts";
import { addMember, connectMedia, createRoom, setUpOwner, shareWebcam, startWebcam, stopWebcam } from "./steps.ts";
import { addressOf, openList, openRoom } from "./sockets.ts";

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

describe("a webcam share", () => {
  it("goes live for every present member once the media server has it", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();

    await shareWebcam(biaTab);

    const share = { member: biaId, kind: "webcam" };
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "started", share } });
    expect(instance.media.connections()).toEqual([[{ name: expect.any(String), mid: "0" }]]);
  });
});

describe("a tab's media connection", () => {
  it("is made the first time the tab shares, not on opening the room", async () => {
    const { instance, biaTab } = await twoPresent();
    expect(instance.media.connections()).toEqual([]);

    await connectMedia(biaTab, "sending");

    expect(instance.media.connections()).toEqual([[]]);
  });

  it("comes with a relay credential lasting 12 hours, minted for that connection alone", async () => {
    const { instance, biaTab, ownerTab } = await twoPresent();

    const bias = await connectMedia(biaTab, "sending");
    const owners = await connectMedia(ownerTab, "sending");

    expect(instance.media.credentials()).toEqual([
      { iceServers: bias, ttlSeconds: 12 * 60 * 60 },
      { iceServers: owners, ttlSeconds: 12 * 60 * 60 },
    ]);
    expect(bias).not.toEqual(owners);
  });

  it("is made once per tab: asking again makes no second one", async () => {
    const { instance, biaTab } = await twoPresent();
    await connectMedia(biaTab, "sending");

    biaTab.send({ type: "media", request: { type: "connect", connection: "sending" } });
    startWebcam(biaTab);

    expect((await biaTab.next()).type, "an answer to the second connect").toBe("media");
    expect(biaTab.received().at(-1)).toMatchObject({ change: { type: "published" } });
    expect(instance.media.connections()).toHaveLength(1);
    expect(instance.media.credentials()).toHaveLength(1);
  });

  it("asks the media server for the connection and the relay credential at once, so the first watch waits on one call", async () => {
    const { instance, biaTab } = await twoPresent();
    const made = instance.media.hold("connect");
    const minted = instance.media.hold("relayCredential");

    biaTab.send({ type: "media", request: { type: "connect", connection: "sending" } });
    await made.reached;
    // The credential is asked for while the connection is still being made.
    await minted.reached;
    made.release();
    minted.release();

    const connected = await biaTab.next();
    expect(connected).toMatchObject({ type: "media", change: { type: "connected" } });
    expect(instance.media.connections()).toHaveLength(1);
    expect(instance.media.credentials()).toEqual([{ iceServers: expect.any(Array), ttlSeconds: 12 * 60 * 60 }]);
  });

  it("is unavailable when the relay refuses its credential, and can be asked for again", async () => {
    const { instance, biaTab } = await twoPresent();
    instance.media.fail("relayCredential");

    biaTab.send({ type: "media", request: { type: "connect", connection: "sending" } });

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "unavailable", connection: "sending", reason: "failed" } });
    await shareWebcam(biaTab);
  });

  it("is unavailable when the media server fails to make it, and can be asked for again", async () => {
    const { instance, biaTab } = await twoPresent();
    instance.media.fail("connect");

    biaTab.send({ type: "media", request: { type: "connect", connection: "sending" } });

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "unavailable", connection: "sending", reason: "failed" } });
    await shareWebcam(biaTab);
  });
});

describe("media server identifiers", () => {
  it("never reach a browser", async () => {
    const { instance, owner, room, biaTab, ownerTab } = await twoPresent();
    await shareWebcam(biaTab);
    await ownerTab.next(); // Bia's webcam went live
    await shareWebcam(ownerTab);
    await biaTab.next(); // the owner's webcam went live
    stopWebcam(biaTab);
    await biaTab.next(); // Bia's webcam ended
    const { tab: late } = await openRoom(owner, room);

    const identifiers = instance.media.identifiers();
    expect(identifiers.length).toBeGreaterThanOrEqual(4); // two connections, two tracks
    for (const tab of [biaTab, ownerTab, late]) {
      await tab.close();
      const everything = JSON.stringify(tab.received());
      for (const identifier of identifiers) expect(everything).not.toContain(identifier);
    }
  });
});

describe("starting a webcam share", () => {
  it("is refused to a tab that has not made its media connection", async () => {
    const { instance, biaTab } = await twoPresent();

    startWebcam(biaTab);

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    expect(instance.media.connections()).toEqual([]);
  });

  it("is refused while the member's webcam is live from another tab, even in another room", async () => {
    const { instance, owner, biaTab, ownerTab } = await twoPresent();
    const elsewhere = await createRoom(owner, "Late shift");
    await ownerTab.next(); // the owner has a second room
    const { tab: secondTab } = await openRoom(owner, `/r/${elsewhere}`);
    await shareWebcam(ownerTab);
    await biaTab.next(); // the owner's webcam went live

    await connectMedia(secondTab, "sending");
    startWebcam(secondTab);

    expect(await secondTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    expect(instance.media.connections().flat()).toHaveLength(1);
  });

  it("cannot be started from a device the instance has forgotten: its open tab is cut off", async () => {
    const { instance, ownerTab } = await twoPresent();
    await connectMedia(ownerTab, "sending");
    // Using the setup secret again forgets every other device of the owner's.
    await setUpOwner(instance.browser());

    expect(await ownerTab.next()).toEqual({ type: "gone" });
    await ownerTab.closed();
    expect(instance.media.connections().flat()).toEqual([]);
  });

  it("goes live only once the media server has registered it, with its record already written", async () => {
    const { instance, bia, room, biaTab, ownerTab, biaId } = await twoPresent();
    await connectMedia(biaTab, "sending");
    const publish = instance.media.hold("publish");

    startWebcam(biaTab);
    await publish.reached;

    // Not live yet: a tab opening now sees no share...
    const { tab: second, state } = await openRoom(bia, room);
    expect(state.shares.live).toEqual([]);
    // ...and the share already holds its place, so a second one is refused.
    await connectMedia(second, "sending");
    startWebcam(second);
    expect(await second.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    expect(await second.next()).toEqual({ type: "media", change: { type: "dropped", connection: "sending" } });

    publish.release();
    expect(await biaTab.next()).toMatchObject({ type: "media", change: { type: "published" } });
    const started = { type: "shares", change: { type: "started", share: { member: biaId, kind: "webcam" } } };
    expect(await ownerTab.next()).toEqual(started);
    expect(await second.next()).toEqual(started);
  });

  it("is refused when the media server fails it, and leaves no track behind", async () => {
    const { instance, biaTab } = await twoPresent();
    await connectMedia(biaTab, "sending");
    instance.media.fail("publish");

    startWebcam(biaTab);

    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "refused", kind: "webcam" } });
    expect(instance.media.connections()).toEqual([[]]);
    // The connection carries nothing, so it is let go of, and the next try makes a new one.
    expect(await biaTab.next()).toEqual({ type: "media", change: { type: "dropped", connection: "sending" } });
    await connectMedia(biaTab, "sending");
    startWebcam(biaTab);
    expect(await biaTab.next()).toMatchObject({ type: "media", change: { type: "published" } });
  });
});

describe("a live webcam share", () => {
  it("is in the room's state for a tab that opens later", async () => {
    const { owner, room, biaTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);

    const { state } = await openRoom(owner, room);

    expect(state.shares).toEqual({ live: [{ member: biaId, kind: "webcam" }] });
  });

  it("is counted on the list of rooms of every member with access", async () => {
    const { owner, room, biaTab } = await twoPresent();
    await createRoom(owner, "Late shift");
    const { tab: list, state } = await openList(owner);
    expect(state.rooms[0]).toMatchObject({ live: 0 });

    await shareWebcam(biaTab);
    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: addressOf(room), name: "First room", present: ["Bia", "Owner"], live: 1 } },
    });

    stopWebcam(biaTab);
    expect(await list.next()).toMatchObject({ type: "rooms", change: { type: "listed", room: { live: 0 } } });
  });

  it("ends for everyone when the sharer presses stop, by a forced close of its track", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);
    await ownerTab.next(); // it went live

    stopWebcam(biaTab);

    const ended = { type: "shares", change: { type: "ended", share: { member: biaId, kind: "webcam" } } };
    expect(await ownerTab.next()).toEqual(ended);
    expect(await biaTab.next()).toEqual(ended);
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("can be shared again over the same media connection once stopped", async () => {
    const { instance, biaTab, ownerTab } = await twoPresent();
    await shareWebcam(biaTab);
    stopWebcam(biaTab);
    await biaTab.next(); // it ended

    startWebcam(biaTab);

    expect(await biaTab.next()).toMatchObject({ type: "media", change: { type: "published" } });
    expect(instance.media.connections()).toEqual([[{ name: expect.any(String), mid: "0" }]]);
    void ownerTab;
  });

  it("ends when the sharer's tab leaves cleanly", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);
    await ownerTab.next(); // it went live

    await biaTab.close();

    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "ended", share: { member: biaId, kind: "webcam" } },
    });
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("ends when the sharer's device is forgotten, its tab closed by the instance", async () => {
    const { instance, bia, biaTab, ownerTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);
    await ownerTab.next(); // it went live
    const { devices } = await (await bia.fetch("/api/me")).json<MeAnswer>();

    const forgotten = await bia.fetch(`/api/me/devices/${devices[0]!.id}`, { method: "DELETE" });

    expect(forgotten.status).toBe(204);
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "ended", share: { member: biaId, kind: "webcam" } },
    });
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("ends for everyone as its forced close begins, and keeps its record until the close returns", async () => {
    const { instance, owner, room, biaTab, ownerTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);
    await ownerTab.next(); // it went live
    const close = instance.media.hold("close");

    stopWebcam(biaTab);
    await close.reached;

    const ended = { type: "shares", change: { type: "ended", share: { member: biaId, kind: "webcam" } } };
    expect(await ownerTab.next()).toEqual(ended);
    expect(await biaTab.next()).toEqual(ended);
    expect((await openRoom(owner, room)).state.shares.live).toEqual([]);
    expect(instance.media.connections().flat()).toHaveLength(1);

    close.release();
    await expect.poll(() => instance.media.connections().flat()).toEqual([]);
  });

  it("keeps its record when its forced close fails, so no track is lost track of, though it is no longer listed", async () => {
    const { instance, owner, room, biaTab, ownerTab } = await twoPresent();
    await shareWebcam(biaTab);
    await ownerTab.next(); // it went live
    instance.media.fail("close");

    stopWebcam(biaTab);
    await ownerTab.next(); // it ended
    const { state } = await openRoom(owner, room);

    expect(state.shares.live).toEqual([]);
    expect(instance.media.connections().flat()).toHaveLength(1);
  });

  it("is never left behind by a tab that leaves while the media server is still answering", async () => {
    const { instance, owner, room, biaTab, ownerTab, biaId } = await twoPresent();
    await connectMedia(biaTab, "sending");
    const publish = instance.media.hold("publish");
    startWebcam(biaTab);
    await publish.reached;

    await biaTab.close();
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    publish.release();

    await vi.waitFor(() => expect(instance.media.connections()).toEqual([[]]));
    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([]);
  });

  it("survives a restart of the instance, with its track still open", async () => {
    const { instance, owner, room, biaTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);

    await instance.restart();

    const { state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([{ member: biaId, kind: "webcam" }]);
    expect(instance.media.connections().flat()).toHaveLength(1);
  });
});
