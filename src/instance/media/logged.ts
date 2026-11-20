// Every call to the media server and the relay, written to the logs (ticket 48): which
// operation, on which media connection, with which tracks, how long it took, and how it
// ended. A failed call adds its HTTP status, the media server's answer in full and each
// track's error code, as `cloudflare.ts` gives them; a call that ran out of time fails
// with a `TimeoutError`. A relay credential is never written, only how many addresses it
// holds; nor is an SDP body, which the line builder writes by its media sections.

import { log } from "../log.ts";
import type { MediaLayer, Track } from "./layer.ts";

/** What a failed call can say of itself beyond its message. */
interface CallFailure {
  status?: number;
  body?: string;
  tracks?: unknown;
}

/** `layer`, with every call it makes written to the logs. */
export function logged(layer: MediaLayer): MediaLayer {
  async function call<T>(op: string, fields: Record<string, unknown>, run: () => Promise<T>, after?: (result: T) => Record<string, unknown>) {
    const started = Date.now();
    try {
      const result = await run();
      log.info("media-server", { op, ...fields, ms: Date.now() - started, ok: true, ...after?.(result) });
      return result;
    } catch (error) {
      const { status, body, tracks } = (typeof error === "object" && error !== null ? error : {}) as CallFailure;
      log.warn("media-server", {
        op,
        ...fields,
        ms: Date.now() - started,
        ok: false,
        ...(status === undefined ? {} : { status }),
        ...(body === undefined ? {} : { body }),
        ...(tracks === undefined ? {} : { failedTracks: tracks }),
        error,
      });
      throw error;
    }
  }
  const named = (tracks: readonly Track[]) => tracks.map(({ name, mid }) => ({ name, mid }));

  return {
    connect: () => call("connect", {}, () => layer.connect(), (connection) => ({ connection })),
    publish: (connection, offer, tracks) =>
      call("publish", { connection, tracks: named(tracks), offer }, () => layer.publish(connection, offer, tracks), (answer) => ({ answer })),
    pull: (connection, from, names, preferred) =>
      call(
        "pull",
        { connection, from, names, ...(preferred ? { preferred } : {}) },
        () => layer.pull(connection, from, names, preferred),
        ({ offer, tracks }) => ({ offer, tracks: named(tracks) }),
      ),
    setQuality: (connection, from, track, quality) =>
      call("setQuality", { connection, from, tracks: named([track]), quality }, () => layer.setQuality(connection, from, track, quality)),
    renegotiate: (connection, answer) => call("renegotiate", { connection, answer }, () => layer.renegotiate(connection, answer)),
    restart: (connection, offer, mid) =>
      call("restart", { connection, offer, mid }, () => layer.restart(connection, offer, mid), (answer) => ({ answer })),
    close: (connection, tracks) => call("close", { connection, tracks: named(tracks) }, () => layer.close(connection, tracks)),
    tracks: (connection) => call("tracks", { connection }, () => layer.tracks(connection), (open) => ({ tracks: named(open) })),
    relayCredential: (ttlSeconds) =>
      call("relayCredential", { ttlSeconds }, () => layer.relayCredential(ttlSeconds), (servers) => ({ servers: servers.length })),
  };
}
