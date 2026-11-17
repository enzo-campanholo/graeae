// The owner page's People section: every member with their access, devices and last
// visit; granting and taking away access one room at a time; forgetting a member's
// device; letting a member back in; and removing a member from a room or the instance.

import { describe, expect, it, vi } from "vitest";
import type {
  CreateInviteAnswer,
  DeviceInviteAnswer,
  GrantAnswer,
  InvitesAnswer,
  PeopleAnswer,
} from "../src/shared/api.ts";
import { startInstance, type TestBrowser } from "./harness.ts";
import {
  addDevice,
  addMember,
  addSecondBrowser,
  answer,
  connectMedia,
  createRoom,
  pressJoin,
  setUpOwner,
  shareWebcam,
  startWebcam,
} from "./steps.ts";
import { addressOf, openList, openRoom } from "./sockets.ts";

const DAY = 24 * 60 * 60 * 1000;

async function people(owner: TestBrowser): Promise<PeopleAnswer> {
  const response = await owner.fetch("/api/owner/people");
  expect(response.status).toBe(200);
  return response.json<PeopleAnswer>();
}

describe("the People section", () => {
  it("lists every member, the owner first, with their access to each room, devices and last visit", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    await instance.clock.advance(DAY);
    const { browser: bia } = await addMember(instance, owner, "Bia", [second]);
    await instance.clock.advance(DAY);
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const phoneVisit = instance.clock.now();
    await instance.clock.advance(DAY);
    await openRoom(laptop, second);

    const seen = await people(owner);

    expect(seen.rooms).toEqual([
      { address: first, name: "First room" },
      { address: second, name: "Late shift" },
    ]);
    expect(seen.people).toEqual([
      expect.objectContaining({ name: "Owner", owner: true, rooms: [first, second], present: [] }),
      expect.objectContaining({ name: "Bia", owner: false, rooms: [second], present: [second] }),
    ]);
    const [, biaEntry] = seen.people;
    expect(biaEntry!.devices).toHaveLength(2);
    expect(biaEntry!.lastVisit).toBe(instance.clock.now());
    expect(biaEntry!.devices.map((device) => device.lastUsed)).toEqual([instance.clock.now(), phoneVisit]);
  });

  it("is the owner's alone", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const stranger = instance.browser();

    expect(await answer(await bia.fetch("/api/owner/people"))).toEqual(await answer(await bia.fetch("/a-refused-address")));
    expect(await answer(await stranger.fetch("/api/owner/people"))).toEqual(
      await answer(await stranger.fetch("/a-refused-address")),
    );
  });
});

/** The tick beside a room on a member's entry. */
function grant(owner: TestBrowser, member: string, address: string) {
  return owner.fetch(`/api/owner/people/${member}/rooms/${address}`, { method: "PUT" });
}

/** The id of the member called `name`, as the People section shows it. */
async function idOf(owner: TestBrowser, name: string): Promise<string> {
  const entry = (await people(owner)).people.find((person) => person.name === name);
  if (!entry) throw new Error(`no member called ${name}`);
  return entry.id;
}

describe("ticking a room", () => {
  it("grants access at once, and every tab that shows it hears so live", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [first]);
    const biaId = await idOf(owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, second);
    const { tab: biaTab } = await openRoom(bia, first);
    const { tab: biaList } = await openList(bia);

    const granted = await grant(owner, biaId, second);

    expect(granted.status).toBe(200);
    expect(await granted.json<GrantAnswer>()).toEqual({
      person: expect.objectContaining({ id: biaId, rooms: [first, second] }),
    });
    expect(await ownerTab.next()).toEqual({ type: "people", change: { type: "added", person: { id: biaId, name: "Bia" } } });
    expect(await biaTab.next()).toEqual({ type: "people", change: { type: "access", rooms: 2 } });
    expect(await biaList.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: second, name: "Late shift", present: ["Owner"], live: 0 } },
    });
    expect((await bia.fetch(`/r/${second}`)).status).toBe(200);
    const { state } = await openRoom(bia, second);
    expect(state.people.you.rooms).toBe(2);
  });

  it("changes nothing for a room the member already has", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    await addMember(instance, owner, "Bia", [first]);
    const biaId = await idOf(owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, first);

    expect((await grant(owner, biaId, first)).status).toBe(200);

    await expect(ownerTab.next()).rejects.toThrow(/no message/);
  });

  it("is refused for the owner, an unknown member or room, and to anyone but the owner", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [first]);
    const biaId = await idOf(owner, "Bia");
    const ownerId = await idOf(owner, "Owner");
    const refused = await answer(await owner.fetch("/a-refused-address"));

    expect(await answer(await grant(owner, ownerId, second))).toEqual(refused);
    expect(await answer(await grant(owner, "not-a-member", second))).toEqual(refused);
    expect(await answer(await grant(owner, biaId, "not-a-room"))).toEqual(refused);
    expect(await answer(await grant(bia, biaId, second))).toEqual(await answer(await bia.fetch("/a-refused-address")));
    expect((await bia.fetch(`/r/${second}`)).status).toBe(404);
  });
});

/** The confirmed untick of a room on a member's entry. */
function removeFromRoom(owner: TestBrowser, member: string, address: string) {
  return owner.fetch(`/api/owner/people/${member}/rooms/${address}`, { method: "DELETE" });
}

/** The owner, and Bia with access to two rooms, a tab open on each and her list of rooms open. */
async function biaInTwoRooms() {
  const instance = await startInstance();
  const owner = instance.browser();
  const first = addressOf(await setUpOwner(owner));
  const second = await createRoom(owner, "Late shift");
  const { browser: bia } = await addMember(instance, owner, "Bia", [first, second]);
  const biaId = await idOf(owner, "Bia");
  const { tab: ownerTab } = await openRoom(owner, second);
  const { tab: inFirst } = await openRoom(bia, first);
  const { tab: inSecond } = await openRoom(bia, second);
  const { tab: biaList } = await openList(bia);
  expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "arrived", member: biaId } });
  return { instance, owner, bia, biaId, first, second, ownerTab, inFirst, inSecond, biaList };
}

describe("removing a member from a room", () => {
  it("ends their presence there at once, and their page there becomes \"nothing here\"", async () => {
    const { owner, bia, biaId, first, second, ownerTab, inFirst, inSecond, biaList } = await biaInTwoRooms();

    const removed = await removeFromRoom(owner, biaId, second);

    expect(removed.status).toBe(200);
    expect(await removed.json<GrantAnswer>()).toEqual({
      person: expect.objectContaining({ id: biaId, rooms: [first], present: [first] }),
    });
    expect(await inSecond.next()).toEqual({ type: "gone" });
    await inSecond.closed();
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    expect(await ownerTab.next()).toEqual({ type: "people", change: { type: "removed", member: biaId } });
    expect(await inFirst.next()).toEqual({ type: "people", change: { type: "access", rooms: 1 } });
    expect(await biaList.next()).toEqual({ type: "rooms", change: { type: "unlisted", address: second } });
    const refused = await answer(await bia.fetch("/a-refused-address"));
    expect(await answer(await bia.fetch(`/r/${second}`))).toEqual(refused);
    expect(await answer(await bia.fetch(`/api/rooms/${second}`))).toEqual(refused);
    expect((await bia.openSocket(`/api/socket/${second}`)).socket).toBeNull();
    expect((await bia.fetch(`/r/${first}`)).status).toBe(200);
    const { state } = await openRoom(owner, second);
    expect(state.people.members.map((person) => person.id)).not.toContain(biaId);
  });

  it("ends their presence on every device, including one in its grace period", async () => {
    const { instance, owner, bia, biaId, second, ownerTab, inSecond } = await biaInTwoRooms();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    await ownerTab.next(); // pressing an invite announces Bia to her rooms again
    const { tab: onLaptop } = await openRoom(laptop, second);
    await inSecond.drop();

    await removeFromRoom(owner, biaId, second);

    expect(await onLaptop.next()).toEqual({ type: "gone" });
    await onLaptop.closed();
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    // Coming back from the dropped connection finds nothing to take back.
    expect((await bia.openSocket(`/api/socket/${second}`)).socket).toBeNull();
    const { state } = await openRoom(owner, second);
    expect(state.presence.present).not.toContain(biaId);
  });

  it("ends what they share in that room, and leaves no track", async () => {
    const { instance, owner, biaId, second, ownerTab, inSecond } = await biaInTwoRooms();
    await shareWebcam(inSecond);
    await ownerTab.next(); // it went live

    await removeFromRoom(owner, biaId, second);

    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    expect(await ownerTab.next()).toEqual({ type: "people", change: { type: "removed", member: biaId } });
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "ended", share: { member: biaId, kind: "webcam" } },
    });
    expect(instance.media.connections().flat()).toEqual([]);
  });

  it("changes storage before any connection is closed, so a request racing it is refused", async () => {
    const { instance, owner, bia, biaId, second, ownerTab, inSecond } = await biaInTwoRooms();
    await shareWebcam(inSecond);
    await ownerTab.next(); // it went live
    const close = instance.media.hold("close");

    const removing = removeFromRoom(owner, biaId, second);
    await close.reached;

    // The share's close is still under way, and Bia is refused already.
    expect((await bia.fetch(`/api/rooms/${second}`)).status).toBe(404);
    expect((await bia.openSocket(`/api/socket/${second}`)).socket).toBeNull();
    close.release();
    expect((await removing).status).toBe(200);
  });

  it("stops a share that was starting as it happened from ever going live", async () => {
    const { instance, owner, biaId, second, ownerTab, inSecond } = await biaInTwoRooms();
    await connectMedia(inSecond);
    const publish = instance.media.hold("publish");
    startWebcam(inSecond);
    await publish.reached;

    await removeFromRoom(owner, biaId, second);
    publish.release();

    await vi.waitFor(() => expect(instance.media.connections()).toEqual([[]]));
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    expect(await ownerTab.next()).toEqual({ type: "people", change: { type: "removed", member: biaId } });
    await expect(ownerTab.next()).rejects.toThrow(/no message/);
  });

  it("changes nothing for a room the member does not have", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    await addMember(instance, owner, "Bia", [first]);
    const biaId = await idOf(owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, second);

    expect((await removeFromRoom(owner, biaId, second)).status).toBe(200);

    await expect(ownerTab.next()).rejects.toThrow(/no message/);
  });

  it("is refused for the owner, an unknown member or room, and to anyone but the owner", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const { browser: bia } = await addMember(instance, owner, "Bia", [first]);
    const biaId = await idOf(owner, "Bia");
    const ownerId = await idOf(owner, "Owner");
    const refused = await answer(await owner.fetch("/a-refused-address"));

    expect(await answer(await removeFromRoom(owner, ownerId, first))).toEqual(refused);
    expect(await answer(await removeFromRoom(owner, "not-a-member", first))).toEqual(refused);
    expect(await answer(await removeFromRoom(owner, biaId, "not-a-room"))).toEqual(refused);
    expect(await answer(await removeFromRoom(bia, biaId, first))).toEqual(
      await answer(await bia.fetch("/a-refused-address")),
    );
    expect((await owner.fetch(`/r/${first}`)).status).toBe(200);
    expect((await bia.fetch(`/r/${first}`)).status).toBe(200);
  });
});

/** The confirmed "Remove from graeae" on a member's entry. */
function removeFromInstance(owner: TestBrowser, member: string) {
  return owner.fetch(`/api/owner/people/${member}`, { method: "DELETE" });
}

describe("removing a member from the instance", () => {
  it("ends their presence everywhere, closes every tab of theirs, and forgets every device", async () => {
    const { instance, owner, bia, biaId, first, second, ownerTab, inFirst, inSecond, biaList } = await biaInTwoRooms();
    const { other: laptop } = await addSecondBrowser(instance, bia);
    await ownerTab.next(); // pressing an invite announces Bia to her rooms again
    await inFirst.next();
    await inSecond.next();
    const { tab: inFirstOwner } = await openRoom(owner, first);
    await inFirst.next(); // the owner arrived
    await biaList.next(); // and is listed as present there
    const { tab: onLaptop } = await openRoom(laptop, first);
    const deviceInvite = await (await addDevice(bia)).json<DeviceInviteAnswer>();

    const removed = await removeFromInstance(owner, biaId);

    expect(removed.status).toBe(204);
    for (const tab of [inFirst, inSecond, onLaptop]) {
      expect(await tab.next()).toEqual({ type: "gone" });
      await tab.closed();
    }
    expect(await biaList.next()).toEqual({ type: "gone" });
    await biaList.closed();
    for (const tab of [ownerTab, inFirstOwner]) {
      expect(await tab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
      expect(await tab.next()).toEqual({ type: "people", change: { type: "removed", member: biaId } });
    }
    expect((await people(owner)).people.map((person) => person.name)).toEqual(["Owner"]);
    for (const browser of [bia, laptop]) {
      const refused = await answer(await browser.fetch("/a-refused-address"));
      expect(await answer(await browser.fetch("/api/me"))).toEqual(refused);
      expect(await answer(await browser.fetch(`/r/${second}`))).toEqual(refused);
    }
    const stranger = instance.browser();
    expect(await answer(await pressJoin(stranger, deviceInvite.invite.code))).toEqual(
      await answer(await stranger.fetch("/a-refused-address")),
    );
  });

  it("ends what they share and their tabs in their grace period, and leaves no track", async () => {
    const { instance, owner, biaId, ownerTab, inFirst, inSecond } = await biaInTwoRooms();
    await shareWebcam(inSecond);
    await ownerTab.next(); // it went live
    await inFirst.drop();

    expect((await removeFromInstance(owner, biaId)).status).toBe(204);

    expect(instance.media.connections().flat()).toEqual([]);
    const { state } = await openRoom(owner, `/r/${(await people(owner)).rooms[0]!.address}`);
    expect(state.presence.present).not.toContain(biaId);
    expect(state.people.members.map((person) => person.id)).not.toContain(biaId);
  });

  it("is refused for the owner, an unknown member, and to anyone but the owner", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { browser: caio } = await addMember(instance, owner, "Caio");
    const biaId = await idOf(owner, "Bia");
    const ownerId = await idOf(owner, "Owner");
    const refused = await answer(await owner.fetch("/a-refused-address"));

    expect(await answer(await removeFromInstance(owner, ownerId))).toEqual(refused);
    expect(await answer(await removeFromInstance(owner, "not-a-member"))).toEqual(refused);
    expect(await answer(await removeFromInstance(caio, biaId))).toEqual(
      await answer(await caio.fetch("/a-refused-address")),
    );
    expect((await owner.fetch(room)).status).toBe(200);
    expect((await bia.fetch(room)).status).toBe(200);
  });
});

/** "Forget" beside one of a member's devices on their entry. */
function forgetDevice(owner: TestBrowser, member: string, device: string) {
  return owner.fetch(`/api/owner/people/${member}/devices/${device}`, { method: "DELETE" });
}

/** The entry of the member called `name`, as the People section shows it. */
async function entryOf(owner: TestBrowser, name: string) {
  const entry = (await people(owner)).people.find((person) => person.name === name);
  if (!entry) throw new Error(`no member called ${name}`);
  return entry;
}

describe("the owner forgetting a member's device", () => {
  it("closes that device's tabs, and the browser is a stranger from then on", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const { tab: ownerTab } = await openRoom(owner, room);
    await instance.clock.advance(1000); // the laptop is the device used last
    const { tab: onLaptop, state } = await openRoom(laptop, room);
    await ownerTab.next(); // Bia arrived
    await shareWebcam(onLaptop);
    await ownerTab.next(); // her webcam went live
    const laptopId = (await entryOf(owner, "Bia")).devices[0]!.id;

    const forgotten = await forgetDevice(owner, state.people.you.id, laptopId);

    expect(forgotten.status).toBe(204);
    expect(await onLaptop.next()).toEqual({ type: "gone" });
    await onLaptop.closed();
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: state.people.you.id } });
    expect(instance.media.connections().flat()).toEqual([]);
    expect((await laptop.fetch(room)).status).toBe(404);
    expect((await bia.fetch(room)).status).toBe(200);
    expect((await entryOf(owner, "Bia")).devices).toHaveLength(1);
  });

  it("works on the owner's own devices, the one asking included", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { other: laptop } = await addSecondBrowser(instance, owner);
    const { id, devices } = await entryOf(owner, "Owner");
    const current = devices.find((device) => device.current)!;

    const forgotten = await forgetDevice(owner, id, current.id);

    expect(forgotten.status).toBe(204);
    expect(forgotten.headers.getSetCookie()).toEqual([expect.stringMatching(/^__Host-device=; Max-Age=0;/)]);
    expect((await owner.fetch(room)).status).toBe(404);
    expect((await entryOf(laptop, "Owner")).devices).toHaveLength(1);
  });

  it("is refused for a device that is not that member's, and to anyone but the owner", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const ownerEntry = await entryOf(owner, "Owner");
    const biaEntry = await entryOf(owner, "Bia");
    const refused = await answer(await owner.fetch("/a-refused-address"));

    expect(await answer(await forgetDevice(owner, biaEntry.id, ownerEntry.devices[0]!.id))).toEqual(refused);
    expect(await answer(await forgetDevice(owner, "not-a-member", biaEntry.devices[0]!.id))).toEqual(refused);
    expect(await answer(await forgetDevice(bia, biaEntry.id, biaEntry.devices[0]!.id))).toEqual(
      await answer(await bia.fetch("/a-refused-address")),
    );
    expect((await owner.fetch(room)).status).toBe(200);
    expect((await bia.fetch(room)).status).toBe(200);
  });
});

/** "Let back in" on a member's entry. */
async function letBackIn(owner: TestBrowser, member: string): Promise<Response> {
  return owner.fetch(`/api/owner/people/${member}/invite`, { method: "POST" });
}

describe("letting a member back in", () => {
  it("makes a 7-day invite for the existing member, shown with the owner's pending invites", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    await addMember(instance, owner, "Bia", [first]);
    const biaId = await idOf(owner, "Bia");

    const made = await letBackIn(owner, biaId);

    expect(made.status).toBe(200);
    const { invite } = await made.json<CreateInviteAnswer>();
    expect(invite).toEqual({
      code: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      name: "Bia",
      rooms: [{ address: first, name: "First room" }],
      expiresAt: instance.clock.now() + 7 * DAY,
    });
    expect((await entryOf(owner, "Bia")).letBackIn).toEqual(invite);
    expect((await owner.fetch("/api/owner/invites").then((r) => r.json<InvitesAnswer>())).invites).toEqual([invite]);
    expect(await (await instance.fetch(`/api/invites/${invite.code}`)).json()).toEqual({ name: "Bia" });
  });

  it("forgets all their previous devices at the press, and keeps their display name and access", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [second]);
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const { tab: onLaptop, state } = await openRoom(laptop, second);
    const { invite } = await (await letBackIn(owner, state.people.you.id)).json<CreateInviteAnswer>();
    const fresh = instance.browser();

    const joined = await pressJoin(fresh, invite.code);

    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ to: `/r/${second}` });
    expect(await onLaptop.next()).toEqual({ type: "gone" });
    await onLaptop.closed();
    expect((await bia.fetch(`/r/${second}`)).status).toBe(404);
    expect((await laptop.fetch(`/r/${second}`)).status).toBe(404);
    expect((await fresh.fetch(`/r/${first}`)).status).toBe(404);
    const { state: after } = await openRoom(fresh, second);
    expect(after.people.you.id).toBe(state.people.you.id);
    const entry = await entryOf(owner, "Bia");
    expect(entry).toMatchObject({ id: state.people.you.id, rooms: [second], letBackIn: null });
    expect(entry.devices).toHaveLength(1);
    expect((await owner.fetch("/api/owner/invites").then((r) => r.json<InvitesAnswer>())).invites).toEqual([]);
  });

  it("replaces an earlier one that is still pending, and can be cancelled like any invite", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    await addMember(instance, owner, "Bia");
    const biaId = await idOf(owner, "Bia");
    const { invite: earlier } = await (await letBackIn(owner, biaId)).json<CreateInviteAnswer>();
    const { invite: later } = await (await letBackIn(owner, biaId)).json<CreateInviteAnswer>();
    const refused = await answer(await instance.fetch("/a-refused-address"));

    expect(await answer(await instance.fetch(`/invite/${earlier.code}`))).toEqual(refused);
    expect((await owner.fetch(`/api/owner/invites/${later.code}`, { method: "DELETE" })).status).toBe(204);
    expect(await answer(await instance.fetch(`/invite/${later.code}`))).toEqual(refused);
    expect((await entryOf(owner, "Bia")).letBackIn).toBeNull();
  });

  it("stops working 7 days after it was made", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    await addMember(instance, owner, "Bia");
    const { invite } = await (await letBackIn(owner, await idOf(owner, "Bia"))).json<CreateInviteAnswer>();
    const refused = await answer(await instance.fetch("/a-refused-address"));

    await instance.clock.advance(7 * DAY);

    expect(await answer(await pressJoin(instance.browser(), invite.code))).toEqual(refused);
    expect((await entryOf(owner, "Bia")).letBackIn).toBeNull();
  });

  it("is refused for the owner, an unknown member, and to anyone but the owner", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const biaId = await idOf(owner, "Bia");
    const refused = await answer(await owner.fetch("/a-refused-address"));

    expect(await answer(await letBackIn(owner, await idOf(owner, "Owner")))).toEqual(refused);
    expect(await answer(await letBackIn(owner, "not-a-member"))).toEqual(refused);
    expect(await answer(await letBackIn(bia, biaId))).toEqual(await answer(await bia.fetch("/a-refused-address")));
  });

  it("is no invite once the member is removed", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    await addMember(instance, owner, "Bia");
    const biaId = await idOf(owner, "Bia");
    const { invite } = await (await letBackIn(owner, biaId)).json<CreateInviteAnswer>();

    await removeFromInstance(owner, biaId);

    const stranger = instance.browser();
    expect(await answer(await pressJoin(stranger, invite.code))).toEqual(
      await answer(await stranger.fetch("/a-refused-address")),
    );
    expect((await owner.fetch("/api/owner/invites").then((r) => r.json<InvitesAnswer>())).invites).toEqual([]);
  });
});
