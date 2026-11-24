// The harness's own clock, checked before any instance behaviour leans on it. These
// tests give the instance a stand-in alarm handler in place of its own. And the rows a
// steady room writes, which only the instance's storage can tell: the free plan allows
// 100,000 a day, and past them every write fails until midnight UTC.

import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, onTestFinished } from "vitest";
import { Instance, INSTANCE_NAME } from "../src/instance/instance.ts";
import { HEARTBEAT_EVERY_MS } from "../src/shared/socket/heartbeat.ts";
import type { LiveShare } from "../src/shared/socket/index.ts";
import { USAGE_REPORT_EVERY_MS } from "../src/shared/socket/usage.ts";
import { startInstance } from "./harness.ts";
import { openRoom, type Tab } from "./sockets.ts";
import { addMember, connectMedia, setUpOwner, shareWebcam, watch } from "./steps.ts";

const START = new Date("2040-03-01T00:00:00Z");
const MINUTE = 60_000;

describe("the test clock", () => {
  it("starts where the test says and moves only when advanced", async () => {
    const instance = await startInstance({ startAt: START });

    expect(instance.clock.now()).toBe(START.getTime());
    await instance.clock.advance(5 * MINUTE);
    expect(instance.clock.now()).toBe(START.getTime() + 5 * MINUTE);
  });

  it("runs each alarm at its own time, including one an alarm sets", async () => {
    const instance = await startInstance({ startAt: START });
    const ranAt = standInAlarm(async (storage, runs) => {
      if (runs === 1) await storage.setAlarm(Date.now() + 2 * MINUTE);
    });
    await setAlarm(START.getTime() + MINUTE);

    await instance.clock.advance(10 * MINUTE);

    expect(ranAt).toEqual([START.getTime() + MINUTE, START.getTime() + 3 * MINUTE]);
    expect(instance.clock.now()).toBe(START.getTime() + 10 * MINUTE);
  });

  it("leaves an alarm alone until its time comes", async () => {
    const instance = await startInstance({ startAt: START });
    const ranAt = standInAlarm(async () => {});
    await setAlarm(START.getTime() + 2 * MINUTE);

    await instance.clock.advance(MINUTE);
    expect(ranAt).toEqual([]);

    await instance.clock.advance(MINUTE);
    expect(ranAt).toEqual([START.getTime() + 2 * MINUTE]);
  });
});

describe("the rows a steady room writes", () => {
  it("stay within 4 a tab a minute, so ten tabs for eight hours write under 20% of a day's allowance", async () => {
    // 20% of 100,000 rows over 10 tabs and 480 minutes is 4.17 a tab a minute.
    const instance = await startInstance({ startAt: START });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const people: { id: string; tab: Tab }[] = [];
    for (const name of [null, "Bia", "Caio", "Dani"]) {
      const browser = name === null ? owner : (await addMember(instance, owner, name)).browser;
      const { tab, state } = await openRoom(browser, room);
      people.push({ id: state.people.you.id, tab });
    }
    // Bia and Caio share their webcams, and everyone watches every share but their own.
    const drain = async () => {
      for (const { tab } of people) while (tab.queued().length > 0) await tab.next();
    };
    await drain();
    const [first, bia, caio, dani] = people as [(typeof people)[0], (typeof people)[0], (typeof people)[0], (typeof people)[0]];
    await shareWebcam(bia.tab);
    await drain();
    await shareWebcam(caio.tab);
    await drain();
    await connectMedia(first.tab, "receiving");
    await connectMedia(dani.tab, "receiving");
    await connectMedia(caio.tab, "receiving");
    await connectMedia(bia.tab, "receiving");
    const shares: LiveShare[] = [bia, caio].map(({ id }) => ({ member: id, kind: "webcam" }));
    for (const { id, tab } of people) {
      for (const share of shares) {
        if (share.member === id) continue;
        await watch(tab, share);
        await drain();
      }
    }

    // Each tab beats, and reports what it has received, as often as the room client does.
    let received = 0;
    const steady = async (ms: number) => {
      for (let passed = 0; passed < ms; passed += HEARTBEAT_EVERY_MS) {
        await instance.clock.advance(HEARTBEAT_EVERY_MS);
        const reports = (instance.clock.now() - START.getTime()) % USAGE_REPORT_EVERY_MS === 0;
        received += 1_000_000;
        for (const { tab } of people) {
          if (reports) tab.send({ type: "usage", request: { type: "received", bytes: received, relayed: false } });
          await tab.heartbeat();
        }
      }
    };
    await steady(MINUTE);
    const rowsWritten = await countRowsWritten();
    await steady(10 * MINUTE);

    // 2.6 when written: 2 rows for each report, and the alarm set about every 25 seconds.
    expect((await rowsWritten()) / (10 * people.length)).toBeLessThanOrEqual(4);
  });
});

/**
 * Counts the rows the instance writes from now on, as the free plan bills them: the rows
 * each SQL statement writes, each key-value write or delete, and each alarm set. Not an
 * alarm deleted: the harness deletes each alarm before it runs it, which a deployed
 * instance's alarm does not need, and a steady room never deletes its own.
 */
async function countRowsWritten(): Promise<() => Promise<number>> {
  const stub = env.INSTANCE.getByName(INSTANCE_NAME);
  const counts = await runInDurableObject(stub, (_, { storage }) => {
    const cursors: { rowsWritten: number }[] = [];
    const counted = { others: 0 };
    const exec = storage.sql.exec.bind(storage.sql);
    storage.sql.exec = ((query: string, ...bindings: SqlStorageValue[]) => {
      const cursor = exec(query, ...bindings);
      cursors.push(cursor);
      return cursor;
    }) as typeof storage.sql.exec;
    const count = (target: object, name: string) => {
      const methods = target as Record<string, (...args: unknown[]) => unknown>;
      const shipped = methods[name]!.bind(target);
      methods[name] = (...args) => {
        counted.others += 1;
        return shipped(...args);
      };
    };
    count(storage.kv, "put");
    count(storage.kv, "delete");
    count(storage, "setAlarm");
    return { cursors, counted };
  });
  return () =>
    runInDurableObject(stub, () => counts.counted.others + counts.cursors.reduce((sum, cursor) => sum + cursor.rowsWritten, 0));
}

/** Gives the instance an alarm handler for this test, recording the time each run sees. */
function standInAlarm(body: (storage: DurableObjectStorage, runs: number) => Promise<void>) {
  const ranAt: number[] = [];
  const prototype = Instance.prototype as Instance & { alarm: () => void | Promise<void> };
  const shipped = prototype.alarm;
  prototype.alarm = async function (this: Instance) {
    ranAt.push(Date.now());
    await body(this.ctx.storage, ranAt.length);
  };
  onTestFinished(() => {
    prototype.alarm = shipped;
  });
  return ranAt;
}

async function setAlarm(at: number) {
  const stub = env.INSTANCE.getByName(INSTANCE_NAME);
  await runInDurableObject(stub, (_, state) => state.storage.setAlarm(at));
}
