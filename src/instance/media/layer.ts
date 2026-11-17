// The media layer: the one seam between the instance and the media server. Only the
// instance talks to the media server, and only through this (ADR 0003). The instance
// picks every track name and writes its record before it calls any of these, so a call
// that fails or never returns leaves a record with nothing behind it, never a track with
// no record.
//
// The Cloudflare implementation is in `cloudflare.ts`; the in-memory fake in `fake.ts`
// stands in for it in tests.

import type { IceServer } from "../../shared/socket/media.ts";
import type { QualityChoice } from "../../shared/socket/watching.ts";

export type { QualityChoice };

/** The media server's own identifier for one media connection. It never reaches a browser. */
export type MediaConnectionId = string;

/**
 * One track on a media connection, as the instance recorded it. A pulled track keeps the
 * name of the track it was pulled from.
 */
export interface Track {
  /** The track's name, which the instance picks. It never reaches a browser. */
  name: string;
  /** The mid of the browser's transceiver that carries it: the browser's for a track it sends, the media server's for one it pulls. */
  mid: string;
}

/** What a pull gives: the media server's offer, and the tracks it pulled. */
export interface Pulled {
  offer: string;
  tracks: Track[];
}

export interface MediaLayer {
  /** Makes a new media connection, with no tracks yet. */
  connect(): Promise<MediaConnectionId>;

  /**
   * Publishes `tracks`, which the browser's SDP `offer` sends over the media connection
   * `connection`. Returns the media server's SDP answer, for the browser. The tracks are
   * live once this returns.
   */
  publish(connection: MediaConnectionId, offer: string, tracks: readonly Track[]): Promise<string>;

  /**
   * Pulls the tracks named `names`, which `from` publishes, to the media connection
   * `connection`, for a viewer. Returns the media server's SDP offer, which the browser
   * answers through `renegotiate`, and the pulled tracks with the mids the media server
   * gave them. Fails if `from` has no such track.
   *
   * `preferred` names a track sent at two qualities, and the quality this viewer prefers
   * it at; every other track has one quality.
   */
  pull(
    connection: MediaConnectionId,
    from: MediaConnectionId,
    names: readonly string[],
    preferred?: { name: string; quality: QualityChoice },
  ): Promise<Pulled>;

  /**
   * Changes the quality a viewer receives `track`, pulled to `connection` from `from` and
   * sent at two qualities, at: mid-watch, with nothing needed from the browser. "Auto"
   * lets the media server step this viewer alone down to 720p when their link is weak.
   */
  setQuality(connection: MediaConnectionId, from: MediaConnectionId, track: Track, quality: QualityChoice): Promise<void>;

  /** Hands the media server the browser's SDP `answer` to the offer of its last pull. */
  renegotiate(connection: MediaConnectionId, answer: string): Promise<void>;

  /**
   * Force-closes `tracks` on `connection`: the media stops at once, with nothing needed
   * from the browser. Closing a track that is not there is no error.
   */
  close(connection: MediaConnectionId, tracks: readonly Track[]): Promise<void>;

  /**
   * The tracks the media connection `connection` really has open now, whatever the
   * instance's records say: the sweep's question. A pulled track has the name of the
   * track it was pulled from. A connection the media server no longer has holds none.
   */
  tracks(connection: MediaConnectionId): Promise<Track[]>;

  /** Mints a relay credential lasting `ttlSeconds`. The instance keeps no record of it. */
  relayCredential(ttlSeconds: number): Promise<IceServer[]>;
}
