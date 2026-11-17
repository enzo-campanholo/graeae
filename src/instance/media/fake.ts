// An in-memory media server that implements the media layer for tests, in both seams,
// and connects nothing: an offer gets a stand-in answer and no media flows. It keeps the
// tracks of each media connection, so a test can see what the instance left open.
//
// Its state lives in this module, not in the instance, so it outlives a restart of the
// instance just as the real media server does.
//
// `fakeMediaControl` lets a test read the tracks and make a call fail or wait. Nothing
// in the instance uses it, and no request can reach it.

import type { IceServer } from "../../shared/socket/media.ts";
import type { MediaConnectionId, MediaLayer, Pulled, Track } from "./layer.ts";

/** The calls a test can make fail or wait. */
export type FakeOperation = "connect" | "publish" | "pull" | "renegotiate" | "close" | "relayCredential";

/** A relay credential the fake minted, with the life it was asked for. */
export interface MintedCredential {
  iceServers: IceServer[];
  ttlSeconds: number;
}

/** A call a test is holding: it has been made, and waits until released. */
export interface HeldCall {
  /** Settles once the instance has made the call. */
  reached: Promise<void>;
  /** Lets the call go on. */
  release(): void;
}

// A held call and the test that holds it run in different I/O contexts, which may not
// share a promise: the call would resume in the test's context. So each side only sets
// a flag here, and the other side looks at it on its own timers.
interface Hold {
  reached: boolean;
  released: boolean;
}

interface Fault {
  fail: boolean;
  hold?: Hold;
  /** The call is done at once, and only its answer is held, as when the media server's reply is slow. */
  done?: boolean;
}

/** How often a held call, or a test waiting for one, looks again. */
const POLL_MS = 1;

async function until(condition: () => boolean) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

class FakeMediaServer implements MediaLayer {
  readonly connections = new Map<MediaConnectionId, Map<string, Track>>();
  /** Every mid each media connection has used, open or closed, so a pull never takes one the browser had. */
  readonly mids = new Map<MediaConnectionId, Set<string>>();
  /** The answers each media connection was given to the offers of its pulls, oldest first. */
  readonly answers = new Map<MediaConnectionId, string[]>();
  readonly credentials: MintedCredential[] = [];
  /** Every identifier the fake has handed the instance, which no browser may ever see. */
  readonly identifiers = new Set<string>();
  readonly faults = new Map<FakeOperation, Fault[]>();

  connect(): Promise<MediaConnectionId> {
    return this.call("connect", () => {
      const id = `fake-connection-${crypto.randomUUID()}`;
      this.connections.set(id, new Map());
      this.mids.set(id, new Set());
      this.answers.set(id, []);
      this.identifiers.add(id);
      return id;
    });
  }

  publish(connection: MediaConnectionId, offer: string, tracks: readonly Track[]): Promise<string> {
    return this.call("publish", () => {
      const open = this.connection(connection);
      for (const track of tracks) {
        if ([...open.values()].some((other) => other.name === track.name)) {
          throw new Error(`The fake already has a track called ${track.name}`);
        }
        this.useMid(connection, track.mid);
        open.set(track.mid, { ...track });
        this.identifiers.add(track.name);
      }
      return `fake answer to ${offer.length} characters of offer`;
    });
  }

  pull(connection: MediaConnectionId, from: MediaConnectionId, names: readonly string[]): Promise<Pulled> {
    return this.call("pull", () => {
      const open = this.connection(connection);
      const source = [...this.connection(from).values()];
      for (const name of names) {
        if (!source.some((track) => track.name === name)) throw new Error(`The fake has no track called ${name} to pull`);
      }
      const tracks = names.map((name) => {
        const used = this.mids.get(connection)!;
        let mid = 0;
        while (used.has(String(mid))) mid++;
        const track = { name, mid: String(mid) };
        this.useMid(connection, track.mid);
        open.set(track.mid, track);
        return { ...track };
      });
      return { offer: `v=0 a stand-in offer pulling ${tracks.length} track(s)`, tracks };
    });
  }

  renegotiate(connection: MediaConnectionId, answer: string): Promise<void> {
    return this.call("renegotiate", () => {
      this.connection(connection);
      this.answers.get(connection)!.push(answer);
    });
  }

  close(connection: MediaConnectionId, tracks: readonly Track[]): Promise<void> {
    return this.call("close", () => {
      const open = this.connection(connection);
      for (const track of tracks) open.delete(track.mid);
    });
  }

  relayCredential(ttlSeconds: number): Promise<IceServer[]> {
    return this.call("relayCredential", () => {
      const username = `fake-relay-${crypto.randomUUID()}`;
      const iceServers: IceServer[] = [
        { urls: "stun:relay.fake.invalid:3478" },
        {
          urls: [
            "turn:relay.fake.invalid:3478?transport=udp",
            "turn:relay.fake.invalid:3478?transport=tcp",
            "turns:relay.fake.invalid:5349?transport=tcp",
          ],
          username,
          credential: `fake-secret-${crypto.randomUUID()}`,
        },
      ];
      this.credentials.push({ iceServers, ttlSeconds });
      return iceServers;
    });
  }

  reset() {
    this.connections.clear();
    this.mids.clear();
    this.answers.clear();
    this.credentials.length = 0;
    this.identifiers.clear();
    this.faults.clear();
  }

  private useMid(connection: MediaConnectionId, mid: string) {
    if (this.connection(connection).has(mid)) throw new Error(`The fake's media connection already has a track on mid ${mid}`);
    this.mids.get(connection)!.add(mid);
  }

  private connection(id: MediaConnectionId): Map<string, Track> {
    const open = this.connections.get(id);
    if (!open) throw new Error(`The fake has no media connection ${id}`);
    return open;
  }

  /** Makes the call `operation`, which `work` does, with whatever fault a test queued for it. */
  private async call<T>(operation: FakeOperation, work: () => T): Promise<T> {
    const fault = this.faults.get(operation)?.shift();
    if (!fault) return work();
    const result = fault.done ? work() : undefined;
    const { hold } = fault;
    if (hold) {
      hold.reached = true;
      await until(() => hold.released);
    }
    if (fault.fail) throw new Error(`The fake was told to fail ${operation}`);
    return fault.done ? (result as T) : work();
  }

  queue(operation: FakeOperation, fault: Fault) {
    const queued = this.faults.get(operation) ?? [];
    queued.push(fault);
    this.faults.set(operation, queued);
  }
}

// Pure, so a build that never selects the fake leaves this module out entirely.
const server = /* @__PURE__ */ new FakeMediaServer();

/** The fake as the instance sees it: the media layer and nothing more. */
export const fakeMediaServer: MediaLayer = server;

/** What a test reads of the fake and tells it to do. Only tests use this. */
export const fakeMediaControl = {
  /** Forgets every media connection, track and credential, as for a fresh test. */
  reset: () => server.reset(),

  /** The tracks open on each media connection, one list per connection, oldest connection first. */
  connections: (): Track[][] => [...server.connections.values()].map((tracks) => [...tracks.values()]),

  /** The answers each media connection gave to the offers of its pulls, one list per connection, oldest connection first. */
  answers: (): string[][] => [...server.answers.values()].map((answers) => [...answers]),

  /** Every relay credential minted, oldest first. */
  credentials: (): readonly MintedCredential[] => [...server.credentials],

  /** Every media connection id and track name the fake has handed out. */
  identifiers: (): readonly string[] => [...server.identifiers],

  /** Makes the next call of `operation` fail. */
  fail(operation: FakeOperation) {
    server.queue(operation, { fail: true });
  },

  /**
   * Holds the next call of `operation` until the test releases it, then lets it succeed
   * or `fail`. With `done`, the media server does the call at once and only its answer
   * is held.
   */
  hold(operation: FakeOperation, { fail = false, done = false } = {}): HeldCall {
    const hold: Hold = { reached: false, released: false };
    server.queue(operation, { fail, hold, done });
    return {
      reached: until(() => hold.reached),
      release: () => {
        hold.released = true;
      },
    };
  },
};

export type FakeMediaControl = typeof fakeMediaControl;
