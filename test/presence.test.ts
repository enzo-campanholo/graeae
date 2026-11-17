// Presence over the signaling connection: who is present in a room, as each open tab is
// told it. Tabs are driven only through their sockets and the instance's HTTP routes.

import { describe, expect, it } from "vitest";
import { roomSocketPath } from "../src/shared/socket/index.ts";
import { startInstance } from "./harness.ts";
import { addMember, answer, createRoom, setUpOwner } from "./steps.ts";
import { addressOf, openRoom } from "./sockets.ts";

describe("a room's socket", () => {
  it("is refused to a browser the instance does not remember, like any refused address", async () => {
    const instance = await startInstance();
    const room = await setUpOwner(instance.browser());
    const refused = await answer(await instance.fetch("/a-refused-address"));

    const { response, socket } = await instance.browser().openSocket(roomSocketPath(addressOf(room)));

    expect(socket).toBeNull();
    expect(await answer(response)).toEqual(refused);
  });
});

describe("a tab on a room", () => {
  it("gets the whole room on connecting: the room, its members and who is present", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);

    const { state } = await openRoom(owner, room);

    const you = state.people.you;
    expect(you).toEqual({ id: expect.any(String), owner: true, rooms: 1 });
    expect(state).toEqual({
      room: { address: addressOf(room), name: "First room" },
      people: { you, members: [{ id: you.id, name: "Owner" }] },
      presence: { present: [you.id] },
      shares: { live: [] },
      usage: {},
    });
  });
});

describe("presence", () => {
  it("tells the tabs already open when a member arrives, and gives the newcomer everyone present", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { tab: ownerTab, state: before } = await openRoom(owner, room);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const added = await ownerTab.next();
    expect(added).toEqual({ type: "people", change: { type: "added", person: { id: expect.any(String), name: "Bia" } } });

    const { state } = await openRoom(bia, room);

    const biaId = state.people.you.id;
    const ownerId = before.people.you.id;
    expect(state.people.you).toEqual({ id: biaId, owner: false, rooms: 1 });
    expect(state.people.members).toEqual(
      expect.arrayContaining([
        { id: ownerId, name: "Owner" },
        { id: biaId, name: "Bia" },
      ]),
    );
    expect(state.presence.present.toSorted()).toEqual([ownerId, biaId].toSorted());
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "arrived", member: biaId } });
  });

  it("ends a tab's presence at once when it closes cleanly", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived

    await biaTab.close();

    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: state.people.you.id } });
    const { state: after } = await openRoom(owner, room);
    expect(after.presence.present).toEqual([after.people.you.id]);
  });
});

describe("a member with several tabs open on a room", () => {
  it("is present once, and stays present until their last tab leaves", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, room);
    // Two tabs in one browser, and the same device's cookie in a second browser.
    const { tab: first, state } = await openRoom(bia, room);
    const { tab: second } = await openRoom(bia, room);
    const { tab: third, state: thirdState } = await openRoom(instance.browser({ cookies: bia.cookies() }), room);
    const biaId = state.people.you.id;
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "arrived", member: biaId } });
    expect(thirdState.presence.present.filter((id) => id === biaId)).toEqual([biaId]);

    await first.close();
    await second.close();
    // Caio's arrival is the next thing the owner hears: Bia did not leave.
    const { browser: caio } = await addMember(instance, owner, "Caio");
    await ownerTab.next(); // Caio was added
    const { state: caioState } = await openRoom(caio, room);
    expect(await ownerTab.next()).toEqual({
      type: "presence",
      change: { type: "arrived", member: caioState.people.you.id },
    });
    expect(caioState.presence.present).toContain(biaId);

    await third.close();
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
  });
});

describe("presence in two rooms", () => {
  it("makes a member with a tab on each of two rooms present in both, and each room hears only of its own", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");
    const { browser: caio } = await addMember(instance, owner, "Caio", [addressOf(first), second]);
    const { tab: ownerFirst } = await openRoom(owner, first);
    const { tab: ownerSecond, state: secondState } = await openRoom(owner, `/r/${second}`);
    expect(secondState.room).toEqual({ address: second, name: "Late shift" });

    const { tab: caioFirst, state } = await openRoom(caio, first);
    const caioId = state.people.you.id;
    expect(await ownerFirst.next()).toEqual({ type: "presence", change: { type: "arrived", member: caioId } });
    const { tab: caioSecond } = await openRoom(caio, `/r/${second}`);
    expect(await ownerSecond.next()).toEqual({ type: "presence", change: { type: "arrived", member: caioId } });

    await caioSecond.close();
    expect(await ownerSecond.next()).toEqual({ type: "presence", change: { type: "left", member: caioId } });
    await caioFirst.close();
    expect(await ownerFirst.next()).toEqual({ type: "presence", change: { type: "left", member: caioId } });
  });

  it("refuses a room's socket to a member without access to it, and for a room that does not exist", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const refused = await answer(await bia.fetch("/a-refused-address"));

    for (const address of [second, "nosuchroom"]) {
      const { response, socket } = await bia.openSocket(roomSocketPath(address));
      expect(socket).toBeNull();
      expect(await answer(response)).toEqual(refused);
    }
    await openRoom(bia, first);
  });

  it("tells only the rooms a new member has access to that they were added", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");
    const { tab: ownerFirst } = await openRoom(owner, first);
    const { tab: ownerSecond } = await openRoom(owner, `/r/${second}`);

    await addMember(instance, owner, "Bia", [second]);
    await addMember(instance, owner, "Caio", [addressOf(first)]);

    const added = (name: string) => ({
      type: "people",
      change: { type: "added", person: { id: expect.any(String), name } },
    });
    expect(await ownerSecond.next()).toEqual(added("Bia"));
    expect(await ownerFirst.next()).toEqual(added("Caio"));
  });
});
