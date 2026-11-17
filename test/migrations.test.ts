import { describe, expect, it } from "vitest";
import { checkNumbering, migrations, type Migration } from "../src/instance/migrations.ts";
import { startInstance } from "./harness.ts";
import type { DeviceInviteAnswer, InvitesAnswer } from "../src/shared/api.ts";
import { addMember, invite, pressJoin, setUpOwner } from "./steps.ts";

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
