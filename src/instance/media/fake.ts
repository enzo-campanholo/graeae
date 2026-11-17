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
import type { MediaConnectionId, MediaLayer, Pulled, QualityChoice, Track } from "./layer.ts";

/** The calls a test can make fail or wait. */
export type FakeOperation =
  | "connect"
  | "publish"
  | "pull"
  | "setQuality"
  | "renegotiate"
  | "close"
  | "tracks"
  | "relayCredential";

/** The quality a viewer prefers a pulled track sent at two qualities at, on the mid it was pulled on. */
export interface Preferred {
  mid: string;
  quality: QualityChoice;
}

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
  /** The quality each pulled track sent at two qualities is preferred at, by media connection and mid. */
  readonly preferred = new Map<MediaConnectionId, Map<string, QualityChoice>>();
  readonly credentials: MintedCredential[] = [];
  /** Every identifier the fake has handed the instance, which no browser may ever see. */
  readonly identifiers = new Set<string>();
  readonly faults = new Map<FakeOperation, Fault[]>();
  /** How many times the instance has made each call. */
  readonly calls = new Map<FakeOperation, number>();

  connect(): Promise<MediaConnectionId> {
    return this.call("connect", () => {
      const id = `fake-connection-${crypto.randomUUID()}`;
      this.connections.set(id, new Map());
      this.mids.set(id, new Set());
      this.answers.set(id, []);
      this.preferred.set(id, new Map());
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

  pull(
    connection: MediaConnectionId,
    from: MediaConnectionId,
    names: readonly string[],
    preferred?: { name: string; quality: QualityChoice },
  ): Promise<Pulled> {
    return this.call("pull", () => {
      if (preferred && !names.includes(preferred.name)) throw new Error(`The fake is not pulling ${preferred.name}`);
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
        if (preferred?.name === name) this.preferred.get(connection)!.set(track.mid, preferred.quality);
        return { ...track };
      });
      return { offer: `v=0 a stand-in offer pulling ${tracks.length} track(s)`, tracks };
    });
  }

  setQuality(connection: MediaConnectionId, from: MediaConnectionId, track: Track, quality: QualityChoice): Promise<void> {
    return this.call("setQuality", () => {
      const pulled = this.connection(connection).get(track.mid);
      if (pulled?.name !== track.name) throw new Error(`The fake has no pulled track ${track.name} on mid ${track.mid}`);
      if (![...this.connection(from).values()].some((source) => source.name === track.name)) {
        throw new Error(`The fake's media connection ${from} sends no track ${track.name}`);
      }
      const preferred = this.preferred.get(connection)!;
      if (!preferred.has(track.mid)) throw new Error(`The fake's track ${track.name} has one quality`);
      preferred.set(track.mid, quality);
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
      for (const track of tracks) {
        open.delete(track.mid);
        this.preferred.get(connection)!.delete(track.mid);
      }
    });
  }

  tracks(connection: MediaConnectionId): Promise<Track[]> {
    return this.call("tracks", () => [...this.connection(connection).values()].map((track) => ({ ...track })));
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
    this.preferred.clear();
    this.credentials.length = 0;
    this.identifiers.clear();
    this.faults.clear();
    this.calls.clear();
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
    this.calls.set(operation, (this.calls.get(operation) ?? 0) + 1);
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

  /**
   * The quality each open pulled track sent at two qualities is preferred at, oldest
   * connection first. A track with one quality is not listed.
   */
  preferred: (): Preferred[] =>
    [...server.preferred.values()].flatMap((tracks) => [...tracks].map(([mid, quality]) => ({ mid, quality }))),

  /** Every relay credential minted, oldest first. */
  credentials: (): readonly MintedCredential[] => [...server.credentials],

  /** Every media connection id and track name the fake has handed out. */
  identifiers: (): readonly string[] => [...server.identifiers],

  /**
   * Makes the next call of `operation` fail. With `done`, the media server does the call
   * all the same and only reports a failure, as when its answer is lost on the way.
   */
  fail(operation: FakeOperation, { done = false } = {}) {
    server.queue(operation, { fail: true, done });
  },

  /** How many calls of `operation` a test has queued a failure or a hold for, and are still to come. */
  queued: (operation: FakeOperation): number => server.faults.get(operation)?.length ?? 0,

  /** How many times the instance has called `operation` since the test began. */
  calls: (operation: FakeOperation): number => server.calls.get(operation) ?? 0,

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
