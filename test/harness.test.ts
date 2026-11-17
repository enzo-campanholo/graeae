// The harness's own clock, checked before any instance behaviour leans on it. Nothing in
// the instance sets an alarm yet, so these tests give it a stand-in alarm handler.

import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, onTestFinished } from "vitest";
import { Instance, INSTANCE_NAME } from "../src/instance/instance.ts";
import { startInstance } from "./harness.ts";

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

/** Gives the instance an alarm handler for this test, recording the time each run sees. */
function standInAlarm(body: (storage: DurableObjectStorage, runs: number) => Promise<void>) {
  const ranAt: number[] = [];
  const prototype = Instance.prototype as Instance & { alarm?: () => Promise<void> };
  prototype.alarm = async function (this: Instance) {
    ranAt.push(Date.now());
    await body(this.ctx.storage, ranAt.length);
  };
  onTestFinished(() => {
    delete prototype.alarm;
  });
  return ranAt;
}

async function setAlarm(at: number) {
  const stub = env.INSTANCE.getByName(INSTANCE_NAME);
  await runInDurableObject(stub, (_, state) => state.storage.setAlarm(at));
}
