import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { checkNumbering, migrations, type Migration } from "../src/instance/migrations.ts";
import { INSTANCE_NAME } from "../src/worker/index.ts";
import { startInstance } from "./harness.ts";

// Stand-in migrations owning their own table, so these tests outlive any real schema.
const olderCode: Migration[] = [
  { number: 1, name: "people", sql: "CREATE TABLE person (name TEXT NOT NULL)" },
  { number: 2, name: "first person", sql: "INSERT INTO person (name) VALUES ('Ada')" },
];
const newerCode: Migration[] = [
  ...olderCode,
  {
    number: 3,
    name: "greetings",
    sql: "ALTER TABLE person ADD COLUMN greeting TEXT NOT NULL DEFAULT 'hello'",
  },
];

describe("migrations", () => {
  it("start an instance holding an older schema on newer code, keeping what it holds", async () => {
    const instance = await startInstance({ migrations: olderCode });
    await instance.fetch("/");

    await instance.restart({ migrations: newerCode });
    await instance.fetch("/");

    // Nothing in the protocol shows these stand-in tables, so this one look goes inside.
    expect(await people()).toEqual([{ name: "Ada", greeting: "hello" }]);
  });

  it("are applied in order on first start", async () => {
    const instance = await startInstance({ migrations: newerCode });
    await instance.fetch("/");

    expect(await people()).toEqual([{ name: "Ada", greeting: "hello" }]);
  });
});

describe("the shipped migrations", () => {
  it("are numbered 1, 2, 3… with no number shared or skipped", () => {
    expect(() => checkNumbering(migrations)).not.toThrow();
  });
});

describe("migration numbering", () => {
  it("is refused when two migrations share a number", () => {
    const shared = [olderCode[0]!, { ...olderCode[1]!, number: 1 }];
    expect(() => checkNumbering(shared)).toThrow(/share number 1/);
  });

  it("is refused when migrations are out of order", () => {
    const swapped = [olderCode[1]!, olderCode[0]!];
    expect(() => checkNumbering(swapped)).toThrow(/out of order/);
  });

  it("is refused when a number is skipped", () => {
    const skipped = [olderCode[0]!, { ...olderCode[1]!, number: 3 }];
    expect(() => checkNumbering(skipped)).toThrow(/out of order/);
  });
});

async function people() {
  const stub = env.INSTANCE.getByName(INSTANCE_NAME);
  return runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec("SELECT * FROM person").toArray(),
  );
}
