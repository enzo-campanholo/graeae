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
import { Instance, INSTANCE_NAME } from "../src/instance/instance.ts";
import type { Migration } from "../src/instance/migrations.ts";

const ORIGIN = "https://graeae.test";

/** The five secrets a deploy sets. */
export type SecretName =
  | "SETUP_SECRET"
  | "SFU_APP_ID"
  | "SFU_APP_SECRET"
  | "TURN_KEY_ID"
  | "TURN_KEY_TOKEN";

/** The setup secret a test instance has unless the test says otherwise. */
export const SETUP_SECRET = "test-setup-secret-0123456789abcdefghij";

const SECRETS: Record<SecretName, string> = {
  SETUP_SECRET,
  SFU_APP_ID: "test-sfu-app-id",
  SFU_APP_SECRET: "test-sfu-app-secret",
  TURN_KEY_ID: "test-turn-key-id",
  TURN_KEY_TOKEN: "test-turn-key-token",
};

/** Chrome on Windows 11: the browser a test's browser is unless the test says otherwise. */
export const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

export interface StartOptions {
  /** Where the instance's clock starts. Defaults to midnight UTC on 1 January, ten years from now. */
  startAt?: Date;
  /** The migrations the instance's code ships with. Defaults to the real ones. */
  migrations?: readonly Migration[];
  /** Secrets to change from the test's defaults. `undefined` leaves one unset. */
  secrets?: Partial<Record<SecretName, string | undefined>>;
}

export interface Client {
  /** Sends a request. Redirects come back as they are, to be checked. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** Asks for a socket. `socket` is null when the instance refused it, with its answer in `response`. */
  openSocket(path: string): Promise<{ response: Response; socket: WebSocket | null }>;
}

/** One browser: it keeps the cookies the instance sets and sends them back. */
export interface TestBrowser extends Client {
  /** The cookies it would send, to hand a copy to another browser. */
  cookies(): string;
}

/** Requests from no browser in particular: they carry no cookies and keep none. */
export interface TestInstance extends Client {
  /** A browser with no cookies, or with a copy of another browser's. */
  browser(options?: { userAgent?: string; cookies?: string }): TestBrowser;
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

  // The instance reads its secrets from its bindings, which it gets when it starts.
  const bindings = env as unknown as Record<string, string | undefined>;
  const shippedSecrets = Object.fromEntries(
    Object.keys(SECRETS).map((name) => [name, bindings[name]]),
  );
  for (const [name, value] of Object.entries({ ...SECRETS, ...options.secrets })) {
    setBinding(bindings, name, value);
  }

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(options.startAt ?? defaultStart());

  onTestFinished(() => {
    Instance.migrations = shippedMigrations;
    for (const [name, value] of Object.entries(shippedSecrets)) setBinding(bindings, name, value);
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

  const fetch = async (path: string, init?: RequestInit) => {
    const request = new Request(new URL(path, ORIGIN), { redirect: "manual", ...init });
    const response = await exports.default.fetch(request);
    if (response.webSocket) return response;
    // Read in full at once, so a test that looks only at the status leaves no body
    // streaming out of an instance the next test resets.
    return new Response(await response.arrayBuffer(), response);
  };

  return {
    ...client(fetch),
    browser({ userAgent = CHROME_ON_WINDOWS, cookies = "" } = {}) {
      const jar = new Map(parseCookieHeader(cookies));
      return {
        ...client(async (path, init = {}) => {
          const headers = new Headers(init.headers);
          if (!headers.has("User-Agent")) headers.set("User-Agent", userAgent);
          if (jar.size > 0) headers.set("Cookie", cookieHeader(jar));
          const response = await fetch(path, { ...init, headers });
          for (const setCookie of response.headers.getSetCookie()) keepCookie(jar, setCookie);
          return response;
        }),
        cookies: () => cookieHeader(jar),
      };
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

function client(fetch: Client["fetch"]): Client {
  return {
    fetch,
    async openSocket(path) {
      const response = await fetch(path, { headers: { Upgrade: "websocket" } });
      const socket = response.webSocket;
      socket?.accept();
      return { response, socket };
    },
  };
}

function setBinding(bindings: Record<string, string | undefined>, name: string, value?: string) {
  if (value === undefined) delete bindings[name];
  else bindings[name] = value;
}

// The jar keeps names and values only. When a cookie runs out in the browser is the
// browser's business; the tests check the instance's own rule for forgetting a device.
function keepCookie(jar: Map<string, string>, setCookie: string) {
  const [pair = "", ...attributes] = setCookie.split(";");
  const at = pair.indexOf("=");
  const name = pair.slice(0, at).trim();
  if (attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute))) jar.delete(name);
  else jar.set(name, pair.slice(at + 1).trim());
}

function parseCookieHeader(header: string): [string, string][] {
  return header
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]);
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

// Far enough ahead that an alarm the instance sets on the test's clock is never already
// due on the real one, which would let workerd run it behind the test's back.
function defaultStart(): Date {
  return new Date(Date.UTC(new Date().getUTCFullYear() + 10, 0, 1));
}
