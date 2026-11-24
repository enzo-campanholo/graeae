// The media client: the browser's one module for media. It captures (a webcam, or a
// screen with its screen audio) and holds the tab's two media connections (ADR 0005): the
// sending connection, made the first time the tab shares, which carries only its shares,
// and the receiving connection, made the first time it watches, which carries only its
// watching. The tab makes offers on the sending connection only: every negotiation on the
// receiving one starts with the media server's offer, so a new path for it is a new
// connection (`replace`), never a restart.
//
// It never talks to the instance itself: the room client carries the offers and answers
// over the tab's socket, so no media server identifier ever reaches the page (ADR 0003).
// The real implementation, on `getUserMedia`, `getDisplayMedia` and `RTCPeerConnection`,
// is in `browser.ts`; the fake in `fake.ts` captures and connects nothing, for Seam 2.
// What a screen capture asks the browser for is one pure rule, in `capture.ts`; how a
// share is sent is the encoding plan (`src/shared/encoding.ts`), as `encodings.ts` hands
// it to the browser. What a live share sends on a weak upload, and the notes its sharer
// sees, are one pure rule too, in `sending.ts`.

import type { IceServer, MediaPurpose, ShareKind } from "../../../shared/socket/index.ts";
import type { EncodingPlan, QualityName } from "../../../shared/encoding.ts";
import type { BrowserFamily } from "./capture.ts";
import type { TransportTotals } from "./transport.ts";
import type { SharerNotes } from "./sending.ts";

/**
 * Something captured on this device, ready to be sent as a share. A screen share is one
 * unit: its picture and, when the picker gave any, its screen audio, sent and stopped
 * together.
 */
export interface Capture {
  kind: ShareKind;
  /** What the sharer's own preview shows; null when there is no picture to show. */
  stream: MediaStream | null;
  /** Whether it carries sound: a screen share's screen audio. Always false for a webcam. */
  audio: boolean;
  /**
   * Settles when the capture ends by itself: the browser's own "stop sharing" bar, the
   * shared tab or window closing, or the camera going away. Never when graeae stops it.
   */
  ended: Promise<void>;
}

/**
 * How a media connection is doing, as the browser says: "fine" once it has a path;
 * "faltering" when it has lost it and looks for another by itself ("disconnected");
 * "failed" when it has given up, and only a restart brings it back.
 */
export type MediaHealth = "fine" | "faltering" | "failed";

/** An offer to send a capture over the sending connection, for the instance to answer. */
export interface Offer {
  /** The browser's SDP offer. */
  sdp: string;
  /** The mid of the transceiver that carries the capture's video. */
  video: string;
  /** The mid of the transceiver that carries its screen audio, when it has any. */
  audio?: string;
}

export interface MediaClient {
  /** The browser family this tab runs in, which decides what a screen capture asks for. */
  readonly browser: BrowserFamily;
  /** How a share of `kind` goes out from this tab: its codecs and qualities. */
  plan(kind: Capture["kind"]): EncodingPlan;
  /** Starts the webcam, at once and with no dialog of graeae's own. Throws if the browser refuses. */
  captureWebcam(): Promise<Capture>;
  /**
   * Opens the browser's picker for a screen, window or tab, with its sound where the
   * browser can capture it. Null when the member closed the picker without picking.
   * Throws if the browser cannot capture at all.
   */
  captureScreen(): Promise<Capture | null>;
  /**
   * Makes the tab's `connection` for one purpose, offering the relay in `iceServers`.
   * Called the first time the tab shares (the sending connection) or watches (the
   * receiving one), and again after `reset`. `health` hears each change in how that
   * connection is doing.
   */
  connect(connection: MediaPurpose, iceServers: IceServer[], health: (health: MediaHealth) => void): void;
  /**
   * Makes a new receiving connection in place of the current one, with the relay
   * credential `iceServers`: from now on `pull`, `received` and `transport` are about the
   * new one. The old one keeps showing what it receives until `retire`, so each picture
   * goes on until it arrives on the new one. `health` hears the new one's health.
   */
  replace(iceServers: IceServer[], health: (health: MediaHealth) => void): void;
  /** Closes the receiving connection the last `replace` replaced, the instance having closed its pulls. */
  retire(): void;
  /**
   * Closes `connection` but keeps every capture going, so a new connection can send them
   * again: the instance has closed everything the old one carried.
   */
  reset(connection: MediaPurpose): void;
  /**
   * Hands `connection` a fresh relay credential in `iceServers`, for whenever it next
   * looks for a path. Nothing else changes: what a tab on a direct path does.
   */
  renew(connection: MediaPurpose, iceServers: IceServer[]): void;
  /** Whether the path `connection` uses now goes through the relay. False before it is made. */
  relayed(connection: MediaPurpose): Promise<boolean>;
  /**
   * Restarts the sending connection's ICE with the relay credential `iceServers`, keeping
   * every share, and makes the offer that restarts it, for the instance to answer: what a
   * tab on the relay does with a fresh credential, and any tab whose sending connection
   * the browser gave up on. The offer carries an empty transceiver, on `mid`, since the
   * media server takes no offer without a track.
   */
  restart(iceServers: IceServer[]): Promise<{ sdp: string; mid: string }>;
  /**
   * Takes back the restart offer the media server did not answer, so the sending
   * connection is as it was and ready for its next negotiation.
   */
  abandonRestart(): Promise<void>;
  /**
   * Applies the media server's answer to the restart offer, and settles once the sending
   * connection has its path back. Throws if the restart fails.
   */
  restarted(answer: string): Promise<void>;
  /** Adds `capture` to the sending connection and makes the offer that sends it. */
  offer(capture: Capture): Promise<Offer>;
  /**
   * Applies the media server's answer to the last offer: the capture is now being sent.
   * From then on its statistics are read every few seconds, and the share steps down by
   * itself on a weak upload and back up when it recovers, without a new negotiation.
   */
  accept(answer: string): Promise<void>;
  /**
   * Tells `heard` the notes on the live share of `capture` that only its sharer sees,
   * now and whenever they change, from the share's statistics. Returns the way to stop
   * listening.
   */
  notes(capture: Capture, heard: (notes: SharerNotes) => void): () => void;
  /**
   * Applies the media server's `offer` to receive a watched share on the receiving
   * connection's transceiver `video`, and its screen audio on `audio` when it has any,
   * and makes the answer to send back. `stream` is the share's picture and sound; null
   * when there is none.
   */
  pull(offer: string, video: string, audio?: string): Promise<{ answer: string; stream: MediaStream | null }>;
  /**
   * Reports the quality the watched share on `video` arrives at, now and whenever it
   * changes, to `heard`: 720p or 1080p, from the frames received, or null before the
   * first. Returns the way to stop listening.
   */
  received(video: string, heard: (quality: QualityName | null) => void): () => void;
  /**
   * What the receiving connection's transport has received since it opened, and whether
   * it is on the relay now, for the usage count. Null before the connection is made.
   */
  transport(): Promise<TransportTotals | null>;
  /**
   * How often the tab reports `transport`'s totals, in milliseconds: `USAGE_REPORT_EVERY_MS`.
   * The fake's can be set shorter, so a journey need not wait a minute for a report.
   */
  readonly reportEvery: number;
  /** Lets go of the watched share on `video`, whose pull the instance has closed. */
  drop(video: string): void;
  /** Turns a live capture's sound on or off, without stopping the share. */
  setAudio(capture: Capture, on: boolean): void;
  /** Stops sending `capture` and stops capturing it. Safe to call more than once. */
  stop(capture: Capture): void;
  /** Stops every capture and closes both media connections, as the tab leaves the room. */
  close(): void;
}
