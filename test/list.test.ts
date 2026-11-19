// The list of rooms at the root address: its own socket, which shows a member each of
// their rooms with who is present, live, without making them present anywhere.

import { describe, expect, it } from "vitest";
import { LIST_SOCKET_PATH } from "../src/shared/socket/list.ts";
import { startInstance } from "./harness.ts";
import { addMember, answer, createRoom, renameRoom, setUpOwner } from "./steps.ts";
import { addressOf, openList, openRoom } from "./sockets.ts";

/** An owner with two rooms, and Bia, a member with access to both. */
async function twoRooms() {
  const instance = await startInstance();
  const owner = instance.browser();
  const first = addressOf(await setUpOwner(owner));
  const second = await createRoom(owner, "Late shift");
  const { browser: bia } = await addMember(instance, owner, "Bia", [first, second]);
  return { instance, owner, bia, first, second };
}

describe("the list of rooms", () => {
  it("is the page at the root address for a member with several rooms", async () => {
    const { bia } = await twoRooms();

    const root = await bia.fetch("/");

    expect(root.status).toBe(200);
    expect(await root.text()).toContain('<div id="app"></div>');
  });

  it("gives its socket the member's name and each of their rooms, oldest first, with the names of those present", async () => {
    const { owner, bia, first, second } = await twoRooms();
    await openRoom(owner, `/r/${second}`);
    await openRoom(bia, `/r/${second}`);

    const { state } = await openList(bia);

    expect(state).toEqual({
      you: { name: "Bia", owner: false },
      rooms: [
        { address: first, name: "First room", present: [], live: 0 },
        { address: second, name: "Late shift", present: ["Bia", "Owner"], live: 0 },
      ],
    });
    expect((await openList(owner)).state.you).toEqual({ name: "Owner", owner: true });
  });

  it("lists only the rooms the member has access to", async () => {
    const { instance, owner, second } = await twoRooms();
    const { browser: caio } = await addMember(instance, owner, "Caio", [second]);
    await createRoom(owner, "Weekends");

    const { state } = await openList(caio);

    expect(state.rooms.map((room) => room.name)).toEqual(["Late shift"]);
  });

  it("makes the member present nowhere", async () => {
    const { owner, bia, first } = await twoRooms();
    const { tab: ownerTab } = await openRoom(owner, `/r/${first}`);

    await openList(bia);
    await renameRoom(owner, first, "Evenings");

    // The rename is the next thing the room hears: Bia did not arrive.
    expect(await ownerTab.next()).toEqual({ type: "room", change: { type: "renamed", name: "Evenings" } });
    const { state } = await openRoom(owner, `/r/${first}`);
    expect(state.presence.present).toEqual([state.people.you.id]);
  });

  it("hears who arrives in and leaves each room", async () => {
    const { owner, bia, first, second } = await twoRooms();
    const { tab: list } = await openList(bia);

    const { tab: ownerTab } = await openRoom(owner, `/r/${second}`);
    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: second, name: "Late shift", present: ["Owner"], live: 0 } },
    });
    await openRoom(bia, `/r/${first}`);
    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: first, name: "First room", present: ["Bia"], live: 0 } },
    });
    await ownerTab.close();
    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: second, name: "Late shift", present: [], live: 0 } },
    });
  });

  it("hears a room renamed", async () => {
    const { owner, bia, second } = await twoRooms();
    const { tab: list } = await openList(bia);

    await renameRoom(owner, second, "Nights");

    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: second, name: "Nights", present: [], live: 0 } },
    });
  });

  it("hears of a new room only when the member has access to it: the owner always", async () => {
    const { owner, bia, first } = await twoRooms();
    const { tab: ownerList } = await openList(owner);
    const { tab: biaList } = await openList(bia);

    const third = await createRoom(owner, "Weekends");
    await renameRoom(owner, first, "Evenings");

    expect(await ownerList.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: third, name: "Weekends", present: [], live: 0 } },
    });
    // Bia hears the rename next, and never heard of Weekends.
    expect(await biaList.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: first, name: "Evenings", present: [], live: 0 } },
    });
  });

  it("refuses its socket to a browser the instance does not remember, like any refused address", async () => {
    const instance = await startInstance();
    await setUpOwner(instance.browser());
    const refused = await answer(await instance.fetch("/a-refused-address"));

    const { response, socket } = await instance.browser().openSocket(LIST_SOCKET_PATH);

    expect(socket).toBeNull();
    expect(await answer(response)).toEqual(refused);
  });
});

describe("a room's link back to the list of rooms", () => {
  it("is for a member with more than one room: each tab knows how many rooms its member has", async () => {
    const { instance, owner, bia, first } = await twoRooms();
    const { browser: caio } = await addMember(instance, owner, "Caio");

    expect((await openRoom(bia, `/r/${first}`)).state.people.you.rooms).toBe(2);
    expect((await openRoom(caio, `/r/${first}`)).state.people.you.rooms).toBe(1);
  });

  it("appears for the owner as soon as they make a room", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);
    const { tab, state } = await openRoom(owner, first);
    expect(state.people.you.rooms).toBe(1);

    await createRoom(owner, "Late shift");

    expect(await tab.next()).toEqual({ type: "people", change: { type: "access", rooms: 2 } });
  });
});
