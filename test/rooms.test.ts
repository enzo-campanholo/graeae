// The owner making and renaming rooms, and who has access to them.

import { describe, expect, it } from "vitest";
import { startInstance } from "./harness.ts";
import { addMember, answer, createRoom, renameRoom, setUpOwner } from "./steps.ts";
import { addressOf, openRoom } from "./sockets.ts";

function postRoom(browser: { fetch: (path: string, init?: RequestInit) => Promise<Response> }, body: unknown) {
  return browser.fetch("/api/owner/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("a new room", () => {
  it("is made by the owner, who has access to it at once", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);

    const address = await createRoom(owner, "  Late shift ");

    expect(address).toMatch(/^[a-z2-9]{10}$/);
    expect((await owner.fetch(`/r/${address}`)).status).toBe(200);
    expect((await (await owner.fetch("/api/rooms")).json<{ rooms: unknown[] }>()).rooms).toEqual([
      { address: first.slice("/r/".length), name: "First room" },
      { address, name: "Late shift" },
    ]);
  });

  it("is refused to a member, and without a name of 1 to 40 characters, like any refused address", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    // A refusal to a remembered device renews its cookie, as every visit does.
    const refusedTo = async (browser: typeof bia) => answer(await browser.fetch("/a-refused-address"));

    expect(await answer(await postRoom(bia, { name: "Bia's room" }))).toEqual(await refusedTo(bia));
    for (const name of ["", "   ", "x".repeat(41), 7, undefined]) {
      expect(await answer(await postRoom(owner, { name }))).toEqual(await refusedTo(owner));
    }
    expect((await (await owner.fetch("/api/rooms")).json<{ rooms: unknown[] }>()).rooms).toHaveLength(1);
  });
});

describe("the owner page's list of rooms", () => {
  it("is every room with its fixed address, oldest first, for the owner alone", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [second]);

    expect(await (await owner.fetch("/api/owner/rooms")).json()).toEqual({
      rooms: [
        { address: first, name: "First room" },
        { address: second, name: "Late shift" },
      ],
    });
    expect(await answer(await bia.fetch("/api/owner/rooms"))).toEqual(await answer(await bia.fetch("/a-refused-address")));
    expect((await instance.fetch("/api/owner/rooms")).status).toBe(404);
  });
});

describe("renaming a room", () => {
  it("changes its name and keeps its address", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));

    const response = await renameRoom(owner, first, " Evenings  ");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ room: { address: first, name: "Evenings" } });
    expect((await owner.fetch(`/r/${first}`)).status).toBe(200);
    expect((await (await owner.fetch("/api/rooms")).json<{ rooms: unknown[] }>()).rooms).toEqual([
      { address: first, name: "Evenings" },
    ]);
  });

  it("is refused to a member, for a room that does not exist, and without a name of 1 to 40 characters", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const refusedTo = async (browser: typeof bia) => answer(await browser.fetch("/a-refused-address"));

    expect(await answer(await renameRoom(bia, first, "Bia's now"))).toEqual(await refusedTo(bia));
    expect(await answer(await renameRoom(owner, "nosuchroom", "Somewhere"))).toEqual(await refusedTo(owner));
    for (const name of ["", "   ", "x".repeat(41), 7, undefined]) {
      expect(await answer(await renameRoom(owner, first, name))).toEqual(await refusedTo(owner));
    }
    expect((await (await bia.fetch("/api/rooms")).json<{ rooms: unknown[] }>()).rooms).toEqual([
      { address: first, name: "First room" },
    ]);
  });

  it("reaches every tab open on the room at once, and no other room", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [first, second]);
    const { tab: biaFirst } = await openRoom(bia, first);
    const { tab: biaSecond } = await openRoom(bia, second);

    await renameRoom(owner, first, "Evenings");
    await renameRoom(owner, second, "Nights");

    expect(await biaFirst.next()).toEqual({ type: "room", change: { type: "renamed", name: "Evenings" } });
    expect(await biaSecond.next()).toEqual({ type: "room", change: { type: "renamed", name: "Nights" } });
    const { state } = await openRoom(bia, first);
    expect(state.room).toEqual({ address: first, name: "Evenings" });
  });
});

describe("access", () => {
  it("is granted by an invite to exactly the rooms it names", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const third = await createRoom(owner, "Weekends");

    const { browser: bia, to } = await addMember(instance, owner, "Bia", [second, third]);

    expect(to).toBe("/");
    expect((await (await bia.fetch("/api/rooms")).json<{ rooms: unknown[] }>()).rooms).toEqual([
      { address: second, name: "Late shift" },
      { address: third, name: "Weekends" },
    ]);
    expect((await bia.fetch(`/r/${first}`)).status).toBe(404);
    expect((await bia.fetch(`/r/${second}`)).status).toBe(200);
    expect((await bia.fetch(`/r/${third}`)).status).toBe(200);
  });

  it("is the owner's to every room, those made later included, and the owner is in each room's people", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    const later = await createRoom(owner, "Late shift");
    await addMember(instance, owner, "Caio", [later]);

    expect((await owner.fetch(`/r/${later}`)).status).toBe(200);
    const { state } = await openRoom(owner, later);
    expect(state.people.members.map((person) => person.name).toSorted()).toEqual(["Caio", "Owner"]);
    expect((await bia.fetch(`/r/${later}`)).status).toBe(404);
  });

  it("decides nothing a visitor can see: a room that does not exist and one without access look the same", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const stranger = instance.browser();

    for (const visitor of [bia, stranger]) {
      for (const path of ["/r/", "/api/rooms/"]) {
        const missing = await answer(await visitor.fetch(`${path}nosuchroom`));
        expect(missing.status).toBe(404);
        expect(await answer(await visitor.fetch(`${path}${second}`))).toEqual(missing);
      }
    }
    // A member's refusals renew their cookie, as any visit does, so only a stranger's
    // can be compared with a member's whole.
    const strangers = await answer(await stranger.fetch(`/r/${second}`));
    const members = await answer(await bia.fetch(`/r/${second}`));
    expect({ ...members, headers: withoutCookie(members.headers) }).toEqual(strangers);
  });
});

function withoutCookie(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "set-cookie"));
}
