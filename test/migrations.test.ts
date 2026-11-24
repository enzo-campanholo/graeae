import { describe, expect, it } from "vitest";
import { checkNumbering, migrations, type Migration } from "../src/instance/migrations.ts";
import { startInstance } from "./harness.ts";
import type { DeviceInviteAnswer, InvitesAnswer } from "../src/shared/api.ts";
import { addMember, connectMedia, invite, pressJoin, setUpOwner, shareScreen, shareWebcam, stopWebcam, watch } from "./steps.ts";
import { openRoom } from "./sockets.ts";

// Stand-ins for migrations later code might ship, so these tests outlive any real
// schema change. The second needs the first's table, and neither can run twice.
const next = migrations.length + 1;
const laterCode: Migration[] = [
  ...migrations,
  { number: next, name: "a later table", sql: "CREATE TABLE later_table (value TEXT)" },
  { number: next + 1, name: "a later column", sql: "ALTER TABLE later_table ADD COLUMN extra TEXT" },
];

describe("migrations", () => {
  it("start an instance holding an older schema on newer code, keeping its owner and rooms", async () => {
    const instance = await startInstance({ migrations });
    const owner = instance.browser();
    const room = await setUpOwner(owner);

    await instance.restart({ migrations: laterCode });

    expect((await owner.fetch(room)).status).toBe(200);
    expect(await (await owner.fetch("/api/me")).json()).toMatchObject({ name: "Owner", owner: true });
  });

  it("are applied in order on first start, and once each", async () => {
    const instance = await startInstance({ migrations: laterCode });
    const owner = instance.browser();
    const room = await setUpOwner(owner);

    await instance.restart();

    expect((await owner.fetch(room)).status).toBe(200);
  });
});

describe("the shipped migrations", () => {
  it("are numbered 1, 2, 3… with no number shared or skipped", () => {
    expect(() => checkNumbering(migrations)).not.toThrow();
  });
});


// Two stand-ins numbered 1 and 2, to number wrongly.
const standIns: Migration[] = laterCode.slice(-2).map((m, i) => ({ ...m, number: i + 1 }));

describe("migration numbering", () => {
  it("is refused when two migrations share a number", () => {
    const shared = [standIns[0]!, { ...standIns[1]!, number: 1 }];
    expect(() => checkNumbering(shared)).toThrow(/share number 1/);
  });

  it("is refused when migrations are out of order", () => {
    const swapped = [standIns[1]!, standIns[0]!];
    expect(() => checkNumbering(swapped)).toThrow(/out of order/);
  });

  it("is refused when a number is skipped", () => {
    const skipped = [standIns[0]!, { ...standIns[1]!, number: 3 }];
    expect(() => checkNumbering(skipped)).toThrow(/out of order/);
  });
});

describe("the access-and-invites migration", () => {
  const added = migrations.find((migration) => migration.name === "access-and-invites")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  it("starts an instance that already has an owner and a room, who can then invite into that room", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);

    await instance.restart({ migrations });

    expect((await owner.fetch(room)).status).toBe(200);
    expect(await (await owner.fetch("/api/me")).json()).toMatchObject({ name: "Owner", owner: true });
    const { browser: bia, to } = await addMember(instance, owner, "Bia");
    expect(to).toBe(room);
    expect((await bia.fetch(room)).status).toBe(200);
  });
});

describe("the invites-for-a-member migration", () => {
  const added = migrations.find((migration) => migration.name === "invites-for-a-member")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  it("keeps the owner's pending invites working, and their members can then add devices", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const bia = await invite(owner, "Bia");
    const caio = await invite(owner, "Caio");

    await instance.restart({ migrations });

    const { invites } = await (await owner.fetch("/api/owner/invites")).json<InvitesAnswer>();
    expect(invites).toEqual([caio, bia]);
    const phone = instance.browser();
    expect(await (await pressJoin(phone, bia.code)).json()).toEqual({ to: room });
    const made = await phone.fetch("/api/me/devices", { method: "POST" });
    const { code } = (await made.json<DeviceInviteAnswer>()).invite;
    const laptop = instance.browser();
    expect(await (await pressJoin(laptop, code)).json()).toEqual({ to: room });
    expect(await (await laptop.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
  });
});

describe("the media-connections-and-shares migration", () => {
  const added = migrations.find((migration) => migration.name === "media-connections-and-shares")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  it("starts an instance that already has members and rooms, who can then share a webcam there", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    await instance.restart({ migrations });

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
    const { tab: ownerTab, state } = await openRoom(owner, room);
    expect(state.people.members.map((person) => person.name).toSorted()).toEqual(["Bia", "Owner"]);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived
    await shareWebcam(biaTab);
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "started", share: { member: biaState.people.you.id, kind: "webcam" } },
    });
  });
});

describe("the watches migration", () => {
  const added = migrations.find((migration) => migration.name === "watches")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  it("starts an instance that already has members and rooms, who can then watch each other's shares", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    await instance.restart({ migrations });

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await shareWebcam(biaTab);
    const biasWebcam = { member: biaState.people.you.id, kind: "webcam" as const };
    const { tab: ownerTab, state } = await openRoom(owner, room);
    expect(state.watching).toEqual({ stage: [], watchers: [], qualities: [] });
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasWebcam);
    expect(instance.media.connections()[1]).toHaveLength(1);
  });
});

describe("the two-qualities migration", () => {
  const added = migrations.find((migration) => migration.name === "two-qualities")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  it("starts an instance that already has members and rooms, who can then choose the quality they watch at", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    await instance.restart({ migrations });

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await shareScreen(biaTab, { twoQualities: true });
    const biasScreen = { member: biaState.people.you.id, kind: "screen" as const };
    const { tab: ownerTab, state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([{ ...biasScreen, audio: true, twoQualities: true }]);
    expect(state.watching).toEqual({ stage: [], watchers: [], qualities: [] });
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasScreen);
    ownerTab.send({ type: "watching", request: { type: "quality", share: biasScreen, quality: "720p" } });
    expect(await ownerTab.next()).toEqual({
      type: "watching",
      change: { type: "quality", share: biasScreen, quality: "720p" },
    });
  });
});

describe("the usage migration", () => {
  const added = migrations.find((migration) => migration.name === "usage")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  // A share cannot be made on this schema any more: today's code reads a later
  // migration's columns as it lists shares. So the share comes after the restart.
  it("starts an instance that already has members and rooms, whose watching is then counted", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    await instance.restart({ migrations });

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
    expect(await (await owner.fetch("/api/owner/usage")).json()).toMatchObject({ used: 0, resetDay: 1 });
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await shareWebcam(biaTab);
    const biasWebcam = { member: biaState.people.you.id, kind: "webcam" as const };
    const { tab: ownerTab, state } = await openRoom(owner, room);
    expect(state.shares.live).toEqual([biasWebcam]);
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasWebcam);
    ownerTab.send({ type: "usage", request: { type: "received", bytes: 1_000_000, relayed: false } });
    await ownerTab.heartbeat();
    await instance.clock.advance(2000);
    await ownerTab.close();
    // 1 MB as received, and 2 seconds at the webcam's 1.5 Mbps since.
    expect(await (await owner.fetch("/api/owner/usage")).json()).toMatchObject({ used: 1_000_000 + 375_000 });
  });
});

describe("the a-share-ending migration", () => {
  const added = migrations.find((migration) => migration.name === "a-share-ending")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  it("starts an instance that already has members and rooms, whose shares then end for the room as their close begins", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");

    await instance.restart({ migrations });

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived
    await shareWebcam(biaTab);
    const biasWebcam = { member: biaState.people.you.id, kind: "webcam" as const };
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "started", share: biasWebcam } });
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasWebcam);
    await biaTab.next(); // the owner is watching

    const close = instance.media.hold("close");
    stopWebcam(biaTab);
    await close.reached;
    expect(await ownerTab.next()).toEqual({ type: "shares", change: { type: "ended", share: biasWebcam } });
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "unwatched", share: biasWebcam } });
    expect((await openRoom(owner, room)).state.shares.live).toEqual([]);
    close.release();
  });
});

describe("the a-connection-for-each-purpose migration", () => {
  const added = migrations.find((migration) => migration.name === "a-connection-for-each-purpose")!;
  const before = migrations.filter((migration) => migration.number < added.number);

  // Nothing of media can be made on the older schema with today's code, which names each
  // connection's purpose: the shares and watches come after the restart.
  it("starts an instance that already has members, rooms and a budget, who can then share and watch on two connections", async () => {
    const instance = await startInstance({ migrations: before });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const set = await owner.fetch("/api/owner/usage/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gigabytes: 50 }),
    });
    expect(set.status).toBe(200);

    await instance.restart({ migrations });

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
    expect(await (await owner.fetch("/api/owner/usage")).json()).toMatchObject({ used: 0, budget: 50_000_000_000 });
    const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived
    const ownersWebcam = { member: ownerState.people.you.id, kind: "webcam" as const };
    const biasWebcam = { member: biaState.people.you.id, kind: "webcam" as const };
    await shareWebcam(ownerTab);
    await biaTab.next(); // the owner's webcam went live
    await shareWebcam(biaTab);
    await ownerTab.next(); // Bia's went live
    await connectMedia(ownerTab, "receiving");
    await watch(ownerTab, biasWebcam);
    await biaTab.next(); // the owner is watching
    await connectMedia(biaTab, "receiving");
    await watch(biaTab, ownersWebcam);

    expect(instance.media.connections().map((tracks) => tracks.length)).toEqual([1, 1, 1, 1]);
    ownerTab.send({ type: "usage", request: { type: "received", bytes: 1_000_000, relayed: false } });
    await ownerTab.heartbeat();
    expect(await (await owner.fetch("/api/owner/usage")).json()).toMatchObject({ used: 1_000_000 });
  });
});
