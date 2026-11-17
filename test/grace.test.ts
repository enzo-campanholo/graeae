// The grace period: a member whose connection is lost stays present for 30 seconds from
// the last heartbeat heard, while their browser reconnects. The others see a
// "reconnecting" mark only after about 10 seconds of silence, and only when the member has
// no tab left in the room that is still heard. Time is the test's: a tab beats only when
// the test has it beat.

import { describe, expect, it } from "vitest";
import type { MeAnswer } from "../src/shared/api.ts";
import { startInstance, type TestInstance } from "./harness.ts";
import { addMember, addSecondBrowser, createRoom, renameRoom, setUpOwner, shareWebcam, stopWebcam } from "./steps.ts";
import { addressOf, openList, openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;

/** Moves the clock on by `ms`, with each of `alive` beating every 5 seconds on the way. */
async function pass(instance: TestInstance, ms: number, alive: Tab<unknown>[]) {
  for (let left = ms; left > 0; left -= 5 * SECOND) {
    await instance.clock.advance(Math.min(left, 5 * SECOND));
    for (const tab of alive) await tab.heartbeat();
  }
}

/** The owner in their room with Bia, both with a tab open and heard. */
async function ownerAndBia() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state } = await openRoom(bia, room);
  const biaId = state.people.you.id;
  expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "arrived", member: biaId } });
  return { instance, owner, room, bia, biaId, ownerId: ownerState.people.you.id, ownerTab, biaTab };
}

const reconnecting = (member: string) => ({ type: "presence", change: { type: "reconnecting", member } });
const reconnected = (member: string) => ({ type: "presence", change: { type: "reconnected", member } });
const left = (member: string) => ({ type: "presence", change: { type: "left", member } });

describe("the heartbeat", () => {
  it("is answered on a room's socket and on the list's", async () => {
    const { owner, biaTab } = await ownerAndBia();
    const { tab: list } = await openList(owner);

    await biaTab.heartbeat();
    await list.heartbeat();

    expect(biaTab.queued()).toEqual([]);
    expect(list.queued()).toEqual([]);
  });

  it("keeps a tab present for as long as it beats", async () => {
    const { instance, ownerTab, biaTab } = await ownerAndBia();

    await pass(instance, 10 * 60 * SECOND, [ownerTab, biaTab]);

    expect(ownerTab.queued()).toEqual([]);
  });
});

describe("a tab that falls silent", () => {
  it("keeps its member present for 30 seconds from the last heartbeat heard, then its presence ends", async () => {
    const { instance, biaId, ownerTab, biaTab } = await ownerAndBia();
    await pass(instance, 5 * SECOND, [ownerTab, biaTab]);

    // Bia's heartbeats stop here, with her socket still open.
    await pass(instance, 30 * SECOND - 1, [ownerTab]);
    expect(ownerTab.queued()).toEqual([reconnecting(biaId)]);
    await ownerTab.next();

    await instance.clock.advance(1);
    expect(await ownerTab.next()).toEqual(left(biaId));
    await biaTab.closed();
  });

  it("shows the others the reconnecting mark after 10 seconds of silence, not before", async () => {
    const { instance, biaId, ownerTab } = await ownerAndBia();

    await instance.clock.advance(10 * SECOND - 1);
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([]);

    await instance.clock.advance(1);
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([reconnecting(biaId)]);
  });

  it("loses the mark when it is heard again, and stays present", async () => {
    const { instance, biaId, ownerTab, biaTab } = await ownerAndBia();
    await pass(instance, 15 * SECOND, [ownerTab]);
    expect(await ownerTab.next()).toEqual(reconnecting(biaId));

    await biaTab.heartbeat();
    expect(await ownerTab.next()).toEqual(reconnected(biaId));

    await pass(instance, 60 * SECOND, [ownerTab, biaTab]);
    expect(ownerTab.queued()).toEqual([]);
  });
});

describe("a lost connection", () => {
  it("keeps its member present for 30 seconds from the last heartbeat heard, then their presence ends", async () => {
    const { instance, owner, room, biaId, ownerTab, biaTab } = await ownerAndBia();
    await pass(instance, 4 * SECOND, [ownerTab, biaTab]);
    await instance.clock.advance(3 * SECOND);

    await biaTab.drop();
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([]);
    const { state: during } = await openRoom(owner, room);
    expect(during.presence.present).toContain(biaId);

    await pass(instance, 30 * SECOND - 3 * SECOND - 1, [ownerTab]);
    expect(ownerTab.queued()).toEqual([reconnecting(biaId)]);
    await ownerTab.next();
    await instance.clock.advance(1);
    expect(await ownerTab.next()).toEqual(left(biaId));
  });

  it("is invisible to the others when the browser reconnects within about 10 seconds", async () => {
    const { instance, room, bia, biaId, ownerTab, biaTab } = await ownerAndBia();
    await biaTab.drop();
    await pass(instance, 6 * SECOND, [ownerTab]);

    const { tab: again, state } = await openRoom(bia, room);

    expect(state.presence.present).toContain(biaId);
    expect(state.presence.reconnecting).toEqual([]);
    await pass(instance, 60 * SECOND, [ownerTab, again]);
    expect(ownerTab.queued()).toEqual([]);
  });

  it("shows the mark from 10 seconds, and a reconnect takes it away with no leaving or arriving", async () => {
    const { instance, room, bia, biaId, ownerTab, biaTab } = await ownerAndBia();
    await biaTab.drop();
    await pass(instance, 15 * SECOND, [ownerTab]);
    expect(await ownerTab.next()).toEqual(reconnecting(biaId));

    const { tab: again } = await openRoom(bia, room);

    expect(await ownerTab.next()).toEqual(reconnected(biaId));
    await pass(instance, 60 * SECOND, [ownerTab, again]);
    expect(ownerTab.queued()).toEqual([]);
  });

  it("gives the reconnecting browser the whole room as it is now, and replays nothing", async () => {
    const { instance, owner, room, bia, biaId, ownerTab, biaTab } = await ownerAndBia();
    await biaTab.drop();
    await pass(instance, 12 * SECOND, [ownerTab]);
    const { browser: caio } = await addMember(instance, owner, "Caio");
    const { tab: caioTab, state: caioState } = await openRoom(caio, room);
    expect(caioState.presence.reconnecting).toEqual([biaId]);
    expect((await renameRoom(owner, addressOf(room), "Den")).status).toBe(200);

    const { tab: again, state } = await openRoom(bia, room);

    expect(state.room.name).toBe("Den");
    expect(state.people.members.map((person) => person.name).toSorted()).toEqual(["Bia", "Caio", "Owner"]);
    expect(state.presence.present.toSorted()).toEqual(
      [biaId, caioState.people.you.id, (await openRoom(owner, room)).state.people.you.id].toSorted(),
    );
    expect(state.presence.reconnecting).toEqual([]);
    await again.heartbeat();
    expect(again.queued()).toEqual([]);
    await caioTab.heartbeat();
    expect(caioTab.queued()).toEqual([{ type: "room", change: { type: "renamed", name: "Den" } }, reconnected(biaId)]);
  });

  it("ends at once when its device is forgotten during the grace period", async () => {
    const { instance, room, bia, biaId, ownerTab, biaTab } = await ownerAndBia();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    expect(await ownerTab.next()).toMatchObject({ type: "people", change: { type: "added" } });
    await biaTab.drop();
    await pass(instance, 5 * SECOND, [ownerTab]);

    const devices = await (await laptop.fetch("/api/me")).json<MeAnswer>();
    const phone = devices.devices.find((device) => !device.current)!;
    expect((await laptop.fetch(`/api/me/devices/${phone.id}`, { method: "DELETE" })).status).toBe(204);

    expect(await ownerTab.next()).toEqual(left(biaId));
    expect((await bia.openSocket(`/api/socket/${addressOf(room)}`)).socket).toBeNull();
  });
});

describe("a member with a second device", () => {
  it("shows nothing when one device drops while the other stays connected", async () => {
    const { instance, room, bia, ownerTab, biaTab } = await ownerAndBia();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    expect(await ownerTab.next()).toMatchObject({ type: "people", change: { type: "added" } });
    const { tab: laptopTab } = await openRoom(laptop, room);

    await biaTab.drop();
    await pass(instance, 60 * SECOND, [ownerTab, laptopTab]);

    expect(ownerTab.queued()).toEqual([]);
  });

  it("shows the mark once neither device is heard, and takes it away when one is", async () => {
    const { instance, room, bia, biaId, ownerTab, biaTab } = await ownerAndBia();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    expect(await ownerTab.next()).toMatchObject({ type: "people", change: { type: "added" } });
    const { tab: laptopTab } = await openRoom(laptop, room);
    await pass(instance, 5 * SECOND, [ownerTab, laptopTab]);

    await biaTab.drop();
    // The laptop falls silent too, five seconds later than the phone.
    await pass(instance, 9 * SECOND, [ownerTab]);
    expect(ownerTab.queued()).toEqual([]);
    await pass(instance, 2 * SECOND, [ownerTab]);
    expect(await ownerTab.next()).toEqual(reconnecting(biaId));

    await laptopTab.heartbeat();
    expect(await ownerTab.next()).toEqual(reconnected(biaId));
    await pass(instance, 60 * SECOND, [ownerTab, laptopTab]);
    expect(ownerTab.queued()).toEqual([]);
  });
});

describe("the list of rooms", () => {
  it("still names a member in their grace period, and stops once it runs out", async () => {
    const { instance, owner, ownerTab, biaTab } = await ownerAndBia();
    const { tab: list, state } = await openList(owner);
    expect(state.rooms[0]!.present).toEqual(["Bia", "Owner"]);

    await biaTab.drop();
    await pass(instance, 25 * SECOND, [ownerTab, list]);
    expect(list.queued()).toEqual([]);
    await pass(instance, 10 * SECOND, [ownerTab, list]);

    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: expect.objectContaining({ present: ["Owner"] }) },
    });
  });

  it("is never present anywhere, and its own silence ends with its socket closed", async () => {
    const { instance, owner, ownerTab, biaTab } = await ownerAndBia();
    const { tab: list } = await openList(owner);

    await pass(instance, 30 * SECOND, [ownerTab, biaTab]);

    await list.closed();
    expect(ownerTab.queued()).toEqual([]);
  });
});

describe("two rooms", () => {
  it("marks a member only in the room where they are silent", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");
    const { browser: caio } = await addMember(instance, owner, "Caio", [addressOf(first), second]);
    const { tab: ownerFirst } = await openRoom(owner, first);
    const { tab: ownerSecond } = await openRoom(owner, `/r/${second}`);
    const { tab: caioFirst, state } = await openRoom(caio, first);
    const { tab: caioSecond } = await openRoom(caio, `/r/${second}`);
    const caioId = state.people.you.id;
    await ownerFirst.next();
    await ownerSecond.next();

    await caioFirst.drop();
    await pass(instance, 31 * SECOND, [ownerFirst, ownerSecond, caioSecond]);

    expect(ownerFirst.queued()).toEqual([reconnecting(caioId), left(caioId)]);
    expect(ownerSecond.queued()).toEqual([]);
  });
});

describe("a sharer's lost connection", () => {
  it("tears nothing down during the grace period, and ends the share by a forced close when it runs out", async () => {
    const { instance, biaId, ownerTab, biaTab } = await ownerAndBia();
    await shareWebcam(biaTab);
    const started = { type: "shares", change: { type: "started", share: { member: biaId, kind: "webcam" } } };
    expect(await ownerTab.next()).toEqual(started);
    const tracks = instance.media.connections();

    await biaTab.drop();
    await pass(instance, 30 * SECOND - 1, [ownerTab]);
    expect(ownerTab.queued()).toEqual([
      reconnecting(biaId),
      { type: "shares", change: { type: "reconnecting", share: { member: biaId, kind: "webcam" } } },
    ]);
    await ownerTab.next();
    await ownerTab.next();
    expect(instance.media.connections()).toEqual(tracks);

    await instance.clock.advance(1);
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([
      left(biaId),
      { type: "shares", change: { type: "ended", share: { member: biaId, kind: "webcam" } } },
    ]);
    expect(instance.media.connections()).toEqual([[]]);
  });

  it("keeps the same share when the browser reconnects in time, which the new socket can stop", async () => {
    const { instance, room, bia, biaId, ownerTab, biaTab } = await ownerAndBia();
    await shareWebcam(biaTab);
    await ownerTab.next(); // the share started
    await biaTab.drop();
    await pass(instance, 5 * SECOND, [ownerTab]);

    const { tab: again, state } = await openRoom(bia, room);
    expect(state.shares.live).toEqual([{ member: biaId, kind: "webcam" }]);
    await pass(instance, 60 * SECOND, [ownerTab, again]);
    expect(ownerTab.queued()).toEqual([]);

    stopWebcam(again);
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "ended", share: { member: biaId, kind: "webcam" } },
    });
    expect(instance.media.connections()).toEqual([[]]);
  });
});
