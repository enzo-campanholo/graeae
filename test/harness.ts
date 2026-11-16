// Seam 1 harness. A test drives the instance the way browsers do: HTTP requests and
// sockets against the real Worker, which runs the real Durable Object with real SQLite.
// Time is the test's: the instance sees only the clock below, and its alarms run when
// the test advances that clock past them.

import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { onTestFinished, vi } from "vitest";
import { Instance } from "../src/instance/instance.ts";
import type { Migration } from "../src/instance/migrations.ts";
import { INSTANCE_NAME } from "../src/worker/index.ts";

const ORIGIN = "https://graeae.test";

export interface StartOptions {
  /** Where the instance's clock starts. Defaults to midnight UTC on 1 January, ten years from now. */
  startAt?: Date;
  /** The migrations the instance's code ships with. Defaults to the real ones. */
  migrations?: readonly Migration[];
}

export interface TestInstance {
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** Asks for a socket. `socket` is null when the instance refused it, with its answer in `response`. */
  openSocket(path: string): Promise<{ response: Response; socket: WebSocket | null }>;
  clock: TestClock;
  /**
   * Stops the instance and starts it again on the same storage, as after a deploy or a
   * Cloudflare restart. `migrations` swaps the code's migrations, to start an instance
   * holding an older schema on newer code.
   */
  restart(options?: { migrations?: readonly Migration[] }): Promise<void>;
}

export interface TestClock {
  now(): number;
  /** Moves time forward, running each of the instance's alarms as its time comes. */
  advance(ms: number): Promise<void>;
}

/** Starts a fresh instance with empty storage, as on a first deploy. */
export async function startInstance(options: StartOptions = {}): Promise<TestInstance> {
  await reset();

  const stub = env.INSTANCE.getByName(INSTANCE_NAME);
  const shippedMigrations = Instance.migrations;
  if (options.migrations) Instance.migrations = options.migrations;

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(options.startAt ?? defaultStart());

  onTestFinished(() => {
    Instance.migrations = shippedMigrations;
    vi.useRealTimers();
  });

  const clock: TestClock = {
    now: () => Date.now(),
    async advance(ms) {
      const target = Date.now() + ms;
      for (;;) {
        const alarm = await runInDurableObject(stub, (_, state) => state.storage.getAlarm());
        if (alarm === null || alarm > target) break;
        vi.setSystemTime(Math.max(Date.now(), alarm));
        await runDurableObjectAlarm(stub);
      }
      vi.setSystemTime(target);
    },
  };

  const fetch = (path: string, init?: RequestInit) =>
    exports.default.fetch(new Request(new URL(path, ORIGIN), init));

  return {
    fetch,
    async openSocket(path) {
      const response = await fetch(path, { headers: { Upgrade: "websocket" } });
      const socket = response.webSocket;
      socket?.accept();
      return { response, socket };
    },
    clock,
    async restart(restartOptions = {}) {
      if (restartOptions.migrations) Instance.migrations = restartOptions.migrations;
      await evictDurableObject(stub).catch(() => {
        // Not running, so there is nothing to stop.
      });
    },
  };
}

// Far enough ahead that an alarm the instance sets on the test's clock is never already
// due on the real one, which would let workerd run it behind the test's back.
function defaultStart(): Date {
  return new Date(Date.UTC(new Date().getUTCFullYear() + 10, 0, 1));
}
