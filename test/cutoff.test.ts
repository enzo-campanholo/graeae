// The cut-off: removing a member from a room or the instance, forgetting a device, and a
// grace period running out all end what is covered through one routine. Storage changes
// first, then the covered shares' tracks close, then everyone else's pulls of them, then
// the covered pulls, and only then are the cut-off tabs told and closed. Ordinary stops
// and clean leaves close by the same path.
//
// Each test asserts on socket messages and on the fake media server's tracks: what was
// cut off must leave no track behind.

import { describe, expect, it } from "vitest";
import type { MemberEntry, PeopleAnswer } from "../src/shared/api.ts";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import type { Track } from "../src/instance/media/index.ts";
import { startInstance, type TestBrowser, type TestInstance } from "./harness.ts";
import {
  addMember,
  addSecondBrowser,
  connectMedia,
  createRoom,
  setUpOwner,
  shareWebcam,
  startWatching,
  stopWatching,
  stopWebcam,
  watch,
} from "./steps.ts";
import { addressOf, openRoom, type Tab } from "./sockets.ts";

async function people(owner: TestBrowser): Promise<MemberEntry[]> {
  const response = await owner.fetch("/api/owner/people");
  expect(response.status).toBe(200);
  return (await response.json<PeopleAnswer>()).people;
}

function removeFromRoom(owner: TestBrowser, member: string, address: string) {
  return owner.fetch(`/api/owner/people/${member}/rooms/${address}`, { method: "DELETE" });
}

function removeFromInstance(owner: TestBrowser, member: string) {
  return owner.fetch(`/api/owner/people/${member}`, { method: "DELETE" });
}

function forgetDevice(owner: TestBrowser, member: string, device: string) {
  return owner.fetch(`/api/owner/people/${member}/devices/${device}`, { method: "DELETE" });
}

/** Reads `tab`'s messages until `wanted` arrives, and returns every message read on the way, `wanted` last. */
async function until(tab: Tab, wanted: (message: ServerMessage) => boolean): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (wanted(message)) return read;
  }
}

/** Lets every request already sent reach the instance and be answered, by asking for one more thing and waiting for it. */
async function settle(tab: Tab): Promise<ServerMessage[]> {
  tab.send({ type: "media", request: { type: "answer", answer: "v=0 settle" } });
  return (await until(tab, (message) => message.type === "media" && message.change.type === "answered")).slice(0, -1);
}

/** Every track open on the fake media server, whichever connection it is on. */
function openTracks(instance: TestInstance): Track[] {
  return instance.media.connections().flat();
}

/** The names of the tracks open on the fake, each once per connection it is open on. */
function openNames(instance: TestInstance): string[] {
  return openTracks(instance)
    .map((track) => track.name)
    .toSorted();
}

/** The name of the one track `connect` added to the fake: the track a share just published. */
async function published(instance: TestInstance, share: () => Promise<void>): Promise<string> {
  const before = new Set(openTracks(instance).map((track) => track.name));
  await share();
  const added = openTracks(instance).filter((track) => !before.has(track.name));
  expect(added).toHaveLength(1);
  return added[0]!.name;
}

const ended = (share: LiveShare) => ({ type: "shares", change: { type: "ended", share } });
const unwatched = (share: LiveShare) => ({ type: "watching", change: { type: "unwatched", share } });

/**
 * Two rooms. The owner shares their webcam in the first; Caio shares his in the second.
 * Bia, with access to both, has a tab on each on one device: in the second she shares her
 * webcam, which Caio watches, and watches Caio's; in the first she watches the owner's.
 */
async function busyEvening() {
  const instance = await startInstance();
  const owner = instance.browser();
  const first = addressOf(await setUpOwner(owner));
  const second = await createRoom(owner, "Late shift");
  const { browser: bia } = await addMember(instance, owner, "Bia", [first, second]);
  const { browser: caio } = await addMember(instance, owner, "Caio", [second]);
  const everyone = await people(owner);
  const ownerId = everyone.find((person) => person.name === "Owner")!.id;
  const biaId = everyone.find((person) => person.name === "Bia")!.id;
  const caioId = everyone.find((person) => person.name === "Caio")!.id;
  const ownersWebcam: LiveShare = { member: ownerId, kind: "webcam" };
  const biasWebcam: LiveShare = { member: biaId, kind: "webcam" };
  const caiosWebcam: LiveShare = { member: caioId, kind: "webcam" };

  const { tab: ownerTab } = await openRoom(owner, first);
  const { tab: ownerInSecond } = await openRoom(owner, second);
  const { tab: caioTab } = await openRoom(caio, second);
  const { tab: biaInFirst } = await openRoom(bia, first);
  const { tab: biaInSecond } = await openRoom(bia, second);
  const tabs = [ownerTab, ownerInSecond, caioTab, biaInFirst, biaInSecond];
  /** Does `step` with every tab's earlier messages read first, and reads what it leaves after. */
  const quietly = async <T>(step: () => Promise<T>): Promise<T> => {
    for (const tab of tabs) await settle(tab);
    const result = await step();
    for (const tab of tabs) await settle(tab);
    return result;
  };

  const tracks = {
    ownersWebcam: await quietly(() => published(instance, () => shareWebcam(ownerTab))),
    caiosWebcam: await quietly(() => published(instance, () => shareWebcam(caioTab))),
    biasWebcam: await quietly(() => published(instance, () => shareWebcam(biaInSecond))),
  };
  await quietly(() => connectMedia(biaInFirst));
  await quietly(() => watch(biaInFirst, ownersWebcam));
  await quietly(() => watch(biaInSecond, caiosWebcam));
  await quietly(() => watch(caioTab, biasWebcam));

  return {
    instance,
    owner,
    bia,
    caio,
    first,
    second,
    ownerId,
    biaId,
    caioId,
    ownersWebcam,
    biasWebcam,
    caiosWebcam,
    ownerTab,
    ownerInSecond,
    caioTab,
    biaInFirst,
    biaInSecond,
    tracks,
  };
}

describe("removing a member from a room", () => {
  it("closes their shares there, then everyone's pulls of them, then their pulls there, then tells their tab", async () => {
    const evening = await busyEvening();
    const { instance, owner, biaId, second, biaInSecond, tracks } = evening;
    const closes = [1, 2, 3].map(() => instance.media.hold("close", { done: true }));

    const removing = removeFromRoom(owner, biaId, second);

    await closes[0]!.reached;
    // Her webcam's own track is closed first; Caio still has his pull of it.
    expect(openNames(instance)).toEqual(
      [tracks.ownersWebcam, tracks.ownersWebcam, tracks.caiosWebcam, tracks.caiosWebcam, tracks.biasWebcam].toSorted(),
    );
    closes[0]!.release();
    await closes[1]!.reached;
    // Then Caio's pull of it; her own pull of Caio's is still open.
    expect(openNames(instance)).toEqual(
      [tracks.ownersWebcam, tracks.ownersWebcam, tracks.caiosWebcam, tracks.caiosWebcam].toSorted(),
    );
    closes[1]!.release();
    await closes[2]!.reached;
    // Then her pull of Caio's. Her tab is told only once every close has returned.
    expect(openNames(instance)).toEqual([tracks.ownersWebcam, tracks.ownersWebcam, tracks.caiosWebcam].toSorted());
    expect(biaInSecond.queued()).toEqual([]);
    closes[2]!.release();

    expect((await removing).status).toBe(200);
    expect(await biaInSecond.next()).toEqual({ type: "gone" });
    await biaInSecond.closed();
  });
});

describe("each case of the cut-off", () => {
  it("removed from a room: ends their shares and watching there, and nothing of theirs elsewhere", async () => {
    const { instance, owner, biaId, second, ownersWebcam, biasWebcam, caiosWebcam, ownerInSecond, caioTab, biaInFirst, biaInSecond, tracks } =
      await busyEvening();

    expect((await removeFromRoom(owner, biaId, second)).status).toBe(200);

    // The room hears her webcam ended as its close begins, and Caio that it left his stage;
    // then her pull of his closes, and he hears nobody watches his.
    expect(await until(caioTab, (message) => message.type === "watching" && message.change.type === "watchers")).toEqual([
      { type: "presence", change: { type: "left", member: biaId } },
      { type: "people", change: { type: "removed", member: biaId } },
      ended(biasWebcam),
      unwatched(biasWebcam),
      { type: "watching", change: { type: "watchers", share: caiosWebcam, members: [] } },
    ]);
    expect(await until(ownerInSecond, (message) => message.type === "shares")).toEqual([
      { type: "presence", change: { type: "left", member: biaId } },
      { type: "people", change: { type: "removed", member: biaId } },
      ended(biasWebcam),
    ]);
    expect(await biaInSecond.next()).toEqual({ type: "gone" });
    await biaInSecond.closed();
    // In the first room she still watches the owner's webcam.
    expect(await biaInFirst.next()).toEqual({ type: "people", change: { type: "access", rooms: 1 } });
    await settle(biaInFirst);
    expect(biaInFirst.received()).not.toContainEqual(unwatched(ownersWebcam));
    expect(openNames(instance)).toEqual([tracks.ownersWebcam, tracks.ownersWebcam, tracks.caiosWebcam].toSorted());
  });

  it("removed from the instance: ends all their shares and watching, in every room", async () => {
    const { instance, owner, biaId, ownersWebcam, biasWebcam, ownerTab, caioTab, biaInFirst, biaInSecond, tracks } =
      await busyEvening();

    expect((await removeFromInstance(owner, biaId)).status).toBe(204);

    expect(await until(caioTab, (message) => message.type === "watching" && message.change.type === "watchers")).toEqual([
      { type: "presence", change: { type: "left", member: biaId } },
      { type: "people", change: { type: "removed", member: biaId } },
      ended(biasWebcam),
      unwatched(biasWebcam),
      expect.objectContaining({ type: "watching", change: expect.objectContaining({ type: "watchers", members: [] }) }),
    ]);
    expect(await until(ownerTab, (message) => message.type === "watching")).toEqual([
      { type: "presence", change: { type: "left", member: biaId } },
      { type: "people", change: { type: "removed", member: biaId } },
      { type: "watching", change: { type: "watchers", share: ownersWebcam, members: [] } },
    ]);
    for (const tab of [biaInFirst, biaInSecond]) {
      expect(await tab.next()).toEqual({ type: "gone" });
      await tab.closed();
    }
    expect(openNames(instance)).toEqual([tracks.ownersWebcam, tracks.caiosWebcam].toSorted());
  });

  it("device forgotten: ends that device's shares and watching, and leaves the member's other device alone", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: phone } = await addMember(instance, owner, "Bia");
    const { other: laptop } = await addSecondBrowser(instance, phone);
    const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
    const { tab: onPhone, state } = await openRoom(phone, room);
    await instance.clock.advance(1000); // the laptop is the device used last
    const { tab: onLaptop } = await openRoom(laptop, room);
    const ownersWebcam: LiveShare = { member: ownerState.people.you.id, kind: "webcam" };
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    const tabs = [ownerTab, onPhone, onLaptop];
    const quiet = async () => {
      for (const tab of tabs) await settle(tab);
    };
    await quiet();
    const ownersTrack = await published(instance, () => shareWebcam(ownerTab));
    await quiet();
    const biasTrack = await published(instance, () => shareWebcam(onLaptop));
    await quiet();
    await connectMedia(onPhone);
    await watch(onPhone, ownersWebcam);
    await watch(onPhone, biasWebcam);
    await watch(onLaptop, ownersWebcam);
    await quiet();
    await watch(ownerTab, biasWebcam);
    await quiet();
    const laptopId = (await people(owner)).find((person) => person.name === "Bia")!.devices[0]!.id;

    expect((await forgetDevice(owner, biasWebcam.member, laptopId)).status).toBe(204);

    expect(await until(ownerTab, (message) => message.type === "watching")).toEqual([ended(biasWebcam), unwatched(biasWebcam)]);
    // The phone watched it too, and as the sharer's own device it hears that nobody else does now.
    expect(await until(onPhone, (message) => message.type === "watching" && message.change.type === "watchers")).toEqual([
      ended(biasWebcam),
      unwatched(biasWebcam),
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [] } },
    ]);
    expect(await onLaptop.next()).toEqual({ type: "gone" });
    await onLaptop.closed();
    // The phone still watches the owner's webcam, so the owner hears of no change in who watches it.
    await settle(ownerTab);
    expect(ownerTab.queued()).toEqual([]);
    expect(openNames(instance)).toEqual([ownersTrack, ownersTrack]);
    expect(openNames(instance)).not.toContain(biasTrack);
  });

  it("grace period ran out: ends that tab's shares and watching, and leaves the member's other tab alone", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
    const { tab: lost, state } = await openRoom(bia, room);
    const { tab: kept } = await openRoom(bia, room);
    const ownersWebcam: LiveShare = { member: ownerState.people.you.id, kind: "webcam" };
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    const quiet = async () => {
      for (const tab of [ownerTab, lost, kept]) await settle(tab);
    };
    await quiet();
    const ownersTrack = await published(instance, () => shareWebcam(ownerTab));
    await quiet();
    await published(instance, () => shareWebcam(lost));
    await quiet();
    await watch(lost, ownersWebcam);
    await connectMedia(kept);
    await watch(kept, ownersWebcam);
    await quiet();
    await watch(ownerTab, biasWebcam);
    await quiet();

    await lost.drop();
    for (let passed = 0; passed < 30_000; passed += 5000) {
      await instance.clock.advance(5000);
      await ownerTab.heartbeat();
      await kept.heartbeat();
    }

    // The share's own mark came first, at 10 seconds: Bia's other tab kept her name unmarked.
    const marked = { type: "shares", change: { type: "reconnecting", share: biasWebcam } };
    expect(await until(ownerTab, (message) => message.type === "shares")).toEqual([marked]);
    expect(await until(kept, (message) => message.type === "shares")).toEqual([marked]);
    expect(await until(ownerTab, (message) => message.type === "watching")).toEqual([
      ended(biasWebcam),
      unwatched(biasWebcam),
    ]);
    expect(await until(kept, (message) => message.type === "watching")).toEqual([
      ended(biasWebcam),
      { type: "watching", change: { type: "watchers", share: biasWebcam, members: [] } },
    ]);
    expect(openNames(instance)).toEqual([ownersTrack, ownersTrack]);
  });

  it("applies during a grace period exactly as otherwise", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
    const { tab: biaTab, state } = await openRoom(bia, room);
    const ownersWebcam: LiveShare = { member: ownerState.people.you.id, kind: "webcam" };
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    const quiet = async () => {
      for (const tab of [ownerTab, biaTab]) await settle(tab);
    };
    await quiet();
    const ownersTrack = await published(instance, () => shareWebcam(ownerTab));
    await quiet();
    await published(instance, () => shareWebcam(biaTab));
    await quiet();
    await watch(biaTab, ownersWebcam);
    await quiet();
    await watch(ownerTab, biasWebcam);
    await quiet();
    await biaTab.drop();

    expect((await removeFromRoom(owner, biasWebcam.member, addressOf(room))).status).toBe(200);

    expect(await until(ownerTab, (message) => message.type === "watching" && message.change.type === "watchers")).toEqual([
      { type: "presence", change: { type: "left", member: biasWebcam.member } },
      { type: "people", change: { type: "removed", member: biasWebcam.member } },
      ended(biasWebcam),
      unwatched(biasWebcam),
      { type: "watching", change: { type: "watchers", share: ownersWebcam, members: [] } },
    ]);
    expect(openNames(instance)).toEqual([ownersTrack]);
    expect((await bia.openSocket(`/api/socket/${addressOf(room)}`)).socket).toBeNull();
  });
});

describe("a request arriving after the storage change", () => {
  it("is refused while the cut-off's closes are still under way", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { browser: caio } = await addMember(instance, owner, "Caio");
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    const { tab: caioTab, state: caioState } = await openRoom(caio, room);
    const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
    const caiosWebcam: LiveShare = { member: caioState.people.you.id, kind: "webcam" };
    const quiet = async () => {
      for (const tab of [ownerTab, biaTab, caioTab]) await settle(tab);
    };
    await quiet();
    await published(instance, () => shareWebcam(biaTab));
    await quiet();
    const caiosTrack = await published(instance, () => shareWebcam(caioTab));
    await quiet();
    await connectMedia(ownerTab);
    const close = instance.media.hold("close");

    const removing = removeFromRoom(owner, biasWebcam.member, addressOf(room));
    await close.reached;

    // Her webcam's close is under way. Her tab asks to watch Caio's; the owner asks to watch hers.
    startWatching(biaTab, caiosWebcam);
    startWatching(ownerTab, biasWebcam);
    expect(await until(ownerTab, (message) => message.type === "media")).toContainEqual({
      type: "media",
      change: { type: "pull-refused", share: biasWebcam },
    });
    expect((await bia.fetch(room)).status).toBe(404);
    close.release();

    expect((await removing).status).toBe(200);
    expect(await biaTab.next()).toEqual({ type: "gone" });
    await biaTab.closed();
    const media = biaTab.received().filter((message) => message.type === "media");
    expect(media.map((message) => message.change.type).filter((type) => type !== "answered")).toEqual([
      "connected",
      "published",
    ]);
    expect(openNames(instance)).toEqual([caiosTrack]);
  });
});

describe("ordinary ends", () => {
  /** The owner and Bia: Bia shares her webcam and watches the owner's, which the owner shares; the owner watches hers. */
  async function eachWatchingTheOther() {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
    const { tab: biaTab, state } = await openRoom(bia, room);
    const ownersWebcam: LiveShare = { member: ownerState.people.you.id, kind: "webcam" };
    const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    const quiet = async () => {
      for (const tab of [ownerTab, biaTab]) await settle(tab);
    };
    await quiet();
    const ownersTrack = await published(instance, () => shareWebcam(ownerTab));
    await quiet();
    const biasTrack = await published(instance, () => shareWebcam(biaTab));
    await quiet();
    await watch(biaTab, ownersWebcam);
    await quiet();
    await watch(ownerTab, biasWebcam);
    await quiet();
    return { instance, ownerTab, biaTab, ownersWebcam, biasWebcam, ownersTrack, biasTrack };
  }

  it("a clean leave closes the tab's shares, then the others' pulls of them, then its own pulls", async () => {
    const { instance, ownerTab, biaTab, biasWebcam, ownersTrack, biasTrack } = await eachWatchingTheOther();
    const closes = [1, 2, 3].map(() => instance.media.hold("close", { done: true }));

    void biaTab.close();

    await closes[0]!.reached;
    expect(openNames(instance)).toEqual([ownersTrack, ownersTrack, biasTrack].toSorted());
    closes[0]!.release();
    await closes[1]!.reached;
    expect(openNames(instance)).toEqual([ownersTrack, ownersTrack]);
    closes[1]!.release();
    await closes[2]!.reached;
    expect(openNames(instance)).toEqual([ownersTrack]);
    closes[2]!.release();
    // The room heard it ended as the first close began; who watches the owner's changed with the last.
    expect(await until(ownerTab, (message) => message.type === "watching" && message.change.type === "watchers")).toEqual([
      { type: "presence", change: { type: "left", member: biasWebcam.member } },
      ended(biasWebcam),
      unwatched(biasWebcam),
      { type: "watching", change: { type: "watchers", share: expect.anything(), members: [] } },
    ]);
  });

  it("a stop goes by the same forced close, ends for the room as it begins, and no one can start watching the share while it closes", async () => {
    const { instance, ownerTab, biaTab, biasWebcam, ownersTrack } = await eachWatchingTheOther();
    stopWatching(ownerTab, biasWebcam);
    expect(await until(ownerTab, (message) => message.type === "watching")).toEqual([unwatched(biasWebcam)]);
    const close = instance.media.hold("close", { done: true });

    stopWebcam(biaTab);
    await close.reached;
    expect(await ownerTab.next()).toEqual(ended(biasWebcam));
    startWatching(ownerTab, biasWebcam);
    expect(await ownerTab.next()).toEqual({ type: "media", change: { type: "pull-refused", share: biasWebcam } });
    close.release();

    await expect.poll(() => openNames(instance)).toEqual([ownersTrack, ownersTrack]);
    // Its close returning tells the owner nothing more.
    expect(await settle(ownerTab)).toEqual([]);
  });
});

describe("the People section", () => {
  it("names what each member is sharing, room by room, for the removal confirm", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [first, second]);
    const { tab } = await openRoom(bia, second);
    await shareWebcam(tab);

    const entries = await people(owner);

    expect(entries.find((person) => person.name === "Bia")!.sharing).toEqual([{ room: second, kind: "webcam" }]);
    expect(entries.find((person) => person.name === "Owner")!.sharing).toEqual([]);
  });
});
