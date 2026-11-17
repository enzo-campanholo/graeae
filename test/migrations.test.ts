import { describe, expect, it } from "vitest";
import { checkNumbering, migrations, type Migration } from "../src/instance/migrations.ts";
import { startInstance } from "./harness.ts";
import { setUpOwner } from "./steps.ts";

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
