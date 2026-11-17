// The "You" page's rules: a member changes their own display name, sees their devices,
// forgets any of them, and adds a device with a 10-minute invite. The same for every
// member and the owner.

import { describe, expect, it } from "vitest";
import type { DeviceInviteAnswer, InvitesAnswer, JoinAnswer, MeAnswer } from "../src/shared/api.ts";
import { startInstance, type TestBrowser, type TestInstance } from "./harness.ts";
import { addMember, answer, createInvite, createRoom, pressJoin, setUpOwner } from "./steps.ts";
import { addressOf, openList, openRoom } from "./sockets.ts";

function rename(browser: TestBrowser, name: unknown) {
  return browser.fetch("/api/me/name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function me(browser: TestBrowser): Promise<MeAnswer> {
  const response = await browser.fetch("/api/me");
  expect(response.status).toBe(200);
  return response.json<MeAnswer>();
}

describe("the display name", () => {
  it("is changed by the member, and the present members of each of their rooms hear it live", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [addressOf(first), second]);
    const { tab: inFirst } = await openRoom(owner, first);
    const { tab: inSecond } = await openRoom(owner, second);
    const { tab: biaTab, state } = await openRoom(bia, first);
    await inFirst.next(); // Bia arrived

    const renamed = await rename(bia, "  Bia S.  ");

    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: "Bia S.", owner: false });
    const change = { type: "people", change: { type: "renamed", member: state.people.you.id, name: "Bia S." } };
    expect(await inFirst.next()).toEqual(change);
    expect(await inSecond.next()).toEqual(change);
    expect(await biaTab.next()).toEqual(change);
    expect((await me(bia)).name).toBe("Bia S.");
    const { state: later } = await openRoom(owner, first);
    expect(later.people.members).toContainEqual({ id: state.people.you.id, name: "Bia S." });
  });

  it("is changed by the owner the same way", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);

    expect((await rename(owner, "Marta")).status).toBe(200);

    expect(await me(owner)).toMatchObject({ name: "Marta", owner: true });
  });

  it("must be 1 to 40 characters once trimmed, like the name in an invite", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const refused = await answer(await owner.fetch("/a-refused-address"));

    for (const name of ["", "   ", "x".repeat(41), 7, null]) {
      expect(await answer(await rename(owner, name)), JSON.stringify(name)).toEqual(refused);
    }
    expect((await rename(owner, "é".repeat(40))).status).toBe(200);
    expect((await me(owner)).name).toBe("é".repeat(40));
  });

  it("cannot be changed by a browser the instance does not remember", async () => {
    const instance = await startInstance();
    await setUpOwner(instance.browser());
    const refused = await answer(await instance.fetch("/a-refused-address"));

    expect(await answer(await rename(instance.browser(), "Anyone"))).toEqual(refused);
  });
});

const MINUTE = 60 * 1000;
const FIREFOX_ON_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

/** The press of "Add a device". */
function addDevice(browser: TestBrowser) {
  return browser.fetch("/api/me/devices", { method: "POST" });
}

/** Has `browser`'s member add a device, and returns a fresh browser made that device by pressing the invite. */
async function addSecondBrowser(instance: TestInstance, browser: TestBrowser, userAgent?: string) {
  const made = await addDevice(browser);
  expect(made.status).toBe(200);
  const { invite } = await made.json<DeviceInviteAnswer>();
  const other = instance.browser({ userAgent });
  const joined = await pressJoin(other, invite.code);
  expect(joined.status).toBe(200);
  return { other, to: (await joined.json<JoinAnswer>()).to };
}

describe("adding a device", () => {
  it("makes a single-use invite that lasts 10 minutes", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);

    const made = await addDevice(owner);

    expect(made.status).toBe(200);
    expect(await made.json()).toEqual({
      invite: { code: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/), expiresAt: instance.clock.now() + 10 * MINUTE },
    });
  });

  it("shows the same one-button page, and the press makes that browser a device of the same member", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { invite } = await (await addDevice(bia)).json<DeviceInviteAnswer>();
    await instance.clock.advance(MINUTE);
    const laptop = instance.browser({ userAgent: FIREFOX_ON_LINUX });

    expect((await laptop.fetch(`/invite/${invite.code}`)).status).toBe(200);
    expect(await (await laptop.fetch(`/api/invites/${invite.code}`)).json()).toEqual({ name: "Bia" });
    const joined = await pressJoin(laptop, invite.code);

    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ to: room });
    const seen = await me(laptop);
    expect(seen).toMatchObject({ name: "Bia", owner: false });
    expect(seen.devices).toEqual([
      expect.objectContaining({ browser: "Firefox", os: "Linux", current: true }),
      expect.objectContaining({ browser: "Chrome", os: "Windows", current: false }),
    ]);
    const { state: onPhone } = await openRoom(bia, room);
    const { state: onLaptop } = await openRoom(laptop, room);
    expect(onLaptop.people.you).toEqual(onPhone.people.you);
    expect(onLaptop.presence.present.filter((id) => id === onPhone.people.you.id)).toHaveLength(1);
  });

  it("is single-use", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { invite } = await (await addDevice(owner)).json<DeviceInviteAnswer>();
    await pressJoin(instance.browser(), invite.code);
    const late = instance.browser();
    const refused = await answer(await late.fetch("/a-refused-address"));

    expect(await answer(await pressJoin(late, invite.code))).toEqual(refused);
    expect(await answer(await late.fetch(`/invite/${invite.code}`))).toEqual(refused);
  });

  it("stops working 10 minutes after it was made", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { invite: early } = await (await addDevice(owner)).json<DeviceInviteAnswer>();
    const { invite: late } = await (await addDevice(owner)).json<DeviceInviteAnswer>();
    const refused = await answer(await instance.fetch("/a-refused-address"));

    await instance.clock.advance(10 * MINUTE - 1);
    expect((await pressJoin(instance.browser(), early.code)).status).toBe(200);
    await instance.clock.advance(1);

    expect(await answer(await instance.fetch(`/invite/${late.code}`))).toEqual(refused);
    expect(await answer(await pressJoin(instance.browser(), late.code))).toEqual(refused);
  });

  it("needs no approval on the old device and has no limit", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    for (let i = 0; i < 6; i++) await addSecondBrowser(instance, bia);

    expect((await me(bia)).devices).toHaveLength(7);
  });

  it("is not one of the owner's pending invites", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    await addDevice(bia);
    await addDevice(owner);

    const { invites } = await (await owner.fetch("/api/owner/invites")).json<InvitesAnswer>();

    expect(invites).toEqual([]);
  });

  it("gives an owner's new device full owner powers", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const second = await createRoom(owner, "Late shift");

    const { other, to } = await addSecondBrowser(instance, owner);

    expect(to).toBe("/");
    expect((await other.fetch("/owner/invites")).status).toBe(200);
    expect((await other.fetch(`/r/${second}`)).status).toBe(200);
    expect((await other.fetch(room)).status).toBe(200);
    expect((await createInvite(other, { name: "Caio" })).status).toBe(200);
    expect((await me(other)).owner).toBe(true);
  });

  it("is refused to a browser the instance does not remember", async () => {
    const instance = await startInstance();
    await setUpOwner(instance.browser());
    const refused = await answer(await instance.fetch("/a-refused-address"));

    expect(await answer(await addDevice(instance.browser()))).toEqual(refused);
  });
});

/** The press of "Forget" beside one of your devices. */
function forget(browser: TestBrowser, deviceId: string) {
  return browser.fetch(`/api/me/devices/${deviceId}`, { method: "DELETE" });
}

describe("forgetting a device", () => {
  it("is done by the member alone, and the forgotten browser is a stranger from then on", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const laptopId = (await me(laptop)).devices.find((device) => device.current)!.id;
    const refused = await answer(await instance.browser().fetch(room));

    const forgotten = await forget(bia, laptopId);

    expect(forgotten.status).toBe(204);
    expect((await me(bia)).devices.map((device) => device.id)).not.toContain(laptopId);
    expect(await answer(await laptop.fetch(room))).toEqual(refused);
    expect(await answer(await laptop.fetch("/api/me"))).toEqual(refused);
    expect((await bia.fetch(room)).status).toBe(200);
  });

  it("works on the device asking too, which is then a stranger", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { other: laptop } = await addSecondBrowser(instance, owner);
    const ownId = (await me(owner)).devices.find((device) => device.current)!.id;

    const forgotten = await forget(owner, ownId);

    expect(forgotten.status).toBe(204);
    expect(forgotten.headers.getSetCookie()).toEqual([expect.stringMatching(/^__Host-device=; Max-Age=0;/)]);
    expect((await owner.fetch(room)).status).toBe(404);
    expect((await me(laptop)).devices).toHaveLength(1);
  });

  it("is refused for another member's device, which stays remembered", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const ownerDevice = (await me(owner)).devices[0]!.id;
    const biaDevice = (await me(bia)).devices[0]!.id;

    for (const [who, device] of [
      [bia, ownerDevice],
      [owner, biaDevice],
      [bia, "not-a-device"],
    ] as const) {
      const refused = await answer(await who.fetch("/a-refused-address"));
      expect(await answer(await forget(who, device))).toEqual(refused);
    }
    expect((await owner.fetch(room)).status).toBe(200);
    expect((await bia.fetch(room)).status).toBe(200);
  });

  it("closes the connection of a tab it has open, and the room hears the member left if it was their last", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const laptopId = (await me(laptop)).devices.find((device) => device.current)!.id;
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: laptopTab, state } = await openRoom(laptop, room);
    const biaId = state.people.you.id;
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "arrived", member: biaId } });

    await forget(bia, laptopId);

    expect(await laptopTab.next()).toEqual({ type: "gone" });
    await laptopTab.closed();
    expect((await laptop.fetch(`/api/rooms/${addressOf(room)}`)).status).toBe(404);
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: biaId } });
    const { state: after } = await openRoom(owner, room);
    expect(after.presence.present).not.toContain(biaId);
  });

  it("leaves the member present while another of their devices has the room open", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { other: laptop } = await addSecondBrowser(instance, bia);
    const laptopId = (await me(laptop)).devices.find((device) => device.current)!.id;
    const { tab: ownerTab } = await openRoom(owner, room);
    const { state } = await openRoom(bia, room);
    const { tab: laptopTab } = await openRoom(laptop, room);
    await ownerTab.next(); // Bia arrived

    await forget(bia, laptopId);
    await laptopTab.closed();

    const { state: after } = await openRoom(owner, room);
    expect(after.presence.present).toContain(state.people.you.id);
    await expect(ownerTab.next()).rejects.toThrow(/no message/);
  });
});

describe("the \"You\" page", () => {
  it("is there for every member and the owner, and for nobody else", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const refused = await answer(await instance.fetch("/a-refused-address"));

    expect((await owner.fetch("/you")).status).toBe(200);
    expect((await bia.fetch("/you")).status).toBe(200);
    expect(await answer(await instance.browser().fetch("/you"))).toEqual(refused);
  });
});

describe("the display name in the list of rooms", () => {
  it("changes live in the line of each room where the member is present", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const first = addressOf(await setUpOwner(owner));
    const second = await createRoom(owner, "Late shift");
    const { browser: bia } = await addMember(instance, owner, "Bia", [first, second]);
    await openRoom(bia, first);
    const { tab: list } = await openList(owner);

    await rename(bia, "Bia S.");

    expect(await list.next()).toEqual({
      type: "rooms",
      change: { type: "listed", room: { address: first, name: "First room", present: ["Bia S."] } },
    });
    await expect(list.next()).rejects.toThrow(/no message/);
  });
});

describe("forgetting a device with the list of rooms open", () => {
  it("closes the list's connection too", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    await setUpOwner(owner);
    await createRoom(owner, "Late shift");
    const { other: laptop } = await addSecondBrowser(instance, owner);
    const laptopId = (await me(laptop)).devices.find((device) => device.current)!.id;
    const { tab: list } = await openList(laptop);

    await forget(owner, laptopId);

    expect(await list.next()).toEqual({ type: "gone" });
    await list.closed();
  });
});
