// The owner making a room. Ticket 08 adds renaming and the owner page's Rooms section.

import { describe, expect, it } from "vitest";
import { startInstance } from "./harness.ts";
import { addMember, answer, createRoom, setUpOwner } from "./steps.ts";

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
