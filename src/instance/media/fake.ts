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
import type { MediaConnectionId, MediaLayer, Track } from "./layer.ts";

/** The calls a test can make fail or wait. */
export type FakeOperation = "connect" | "publish" | "close" | "relayCredential";

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
}

/** How often a held call, or a test waiting for one, looks again. */
const POLL_MS = 1;

async function until(condition: () => boolean) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

class FakeMediaServer implements MediaLayer {
  readonly connections = new Map<MediaConnectionId, Map<string, Track>>();
  readonly credentials: MintedCredential[] = [];
  /** Every identifier the fake has handed the instance, which no browser may ever see. */
  readonly identifiers = new Set<string>();
  readonly faults = new Map<FakeOperation, Fault[]>();

  async connect(): Promise<MediaConnectionId> {
    await this.fault("connect");
    const id = `fake-connection-${crypto.randomUUID()}`;
    this.connections.set(id, new Map());
    this.identifiers.add(id);
    return id;
  }

  async publish(connection: MediaConnectionId, offer: string, tracks: readonly Track[]): Promise<string> {
    await this.fault("publish");
    const open = this.connection(connection);
    for (const track of tracks) {
      if ([...open.values()].some((other) => other.name === track.name)) {
        throw new Error(`The fake already has a track called ${track.name}`);
      }
      open.set(track.mid, { ...track });
      this.identifiers.add(track.name);
    }
    return `fake answer to ${offer.length} characters of offer`;
  }

  async close(connection: MediaConnectionId, tracks: readonly Track[]): Promise<void> {
    await this.fault("close");
    const open = this.connection(connection);
    for (const track of tracks) open.delete(track.mid);
  }

  async relayCredential(ttlSeconds: number): Promise<IceServer[]> {
    await this.fault("relayCredential");
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
  }

  reset() {
    this.connections.clear();
    this.credentials.length = 0;
    this.identifiers.clear();
    this.faults.clear();
  }

  private connection(id: MediaConnectionId): Map<string, Track> {
    const open = this.connections.get(id);
    if (!open) throw new Error(`The fake has no media connection ${id}`);
    return open;
  }

  private async fault(operation: FakeOperation) {
    const fault = this.faults.get(operation)?.shift();
    if (!fault) return;
    const { hold } = fault;
    if (hold) {
      hold.reached = true;
      await until(() => hold.released);
    }
    if (fault.fail) throw new Error(`The fake was told to fail ${operation}`);
  }

  queue(operation: FakeOperation, fault: Fault) {
    const queued = this.faults.get(operation) ?? [];
    queued.push(fault);
    this.faults.set(operation, queued);
  }
}

const server = new FakeMediaServer();

/** The fake as the instance sees it: the media layer and nothing more. */
export const fakeMediaServer: MediaLayer = server;

/** What a test reads of the fake and tells it to do. Only tests use this. */
export const fakeMediaControl = {
  /** Forgets every media connection, track and credential, as for a fresh test. */
  reset: () => server.reset(),

  /** The tracks open on each media connection, one list per connection, oldest connection first. */
  connections: (): Track[][] => [...server.connections.values()].map((tracks) => [...tracks.values()]),

  /** Every relay credential minted, oldest first. */
  credentials: (): readonly MintedCredential[] => [...server.credentials],

  /** Every media connection id and track name the fake has handed out. */
  identifiers: (): readonly string[] => [...server.identifiers],

  /** Makes the next call of `operation` fail. */
  fail(operation: FakeOperation) {
    server.queue(operation, { fail: true });
  },

  /** Holds the next call of `operation` until the test releases it, then lets it succeed or `fail`. */
  hold(operation: FakeOperation, { fail = false } = {}): HeldCall {
    const hold: Hold = { reached: false, released: false };
    server.queue(operation, { fail, hold });
    return {
      reached: until(() => hold.reached),
      release: () => {
        hold.released = true;
      },
    };
  },
};

export type FakeMediaControl = typeof fakeMediaControl;
