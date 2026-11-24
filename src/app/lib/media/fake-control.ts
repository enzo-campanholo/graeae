// What a Seam 2 journey reads and steers of the fake media client, on
// `window.graeaeFakeMedia`. Types only, so the journeys can import them too.

import type { Degradation, QualityName } from "../../../shared/encoding.ts";
import type { IceServer, MediaPurpose, ShareKind } from "../../../shared/socket/index.ts";
import type { BrowserFamily, ScreenCaptureRequest } from "./capture.ts";
import type { StatsEntry, StepEncoding } from "./sending.ts";

/**
 * What the browser's picker returns: the surface picked, and whether its audio checkbox
 * gave any sound. "cancel" is the member closing the picker without picking.
 */
export type FakePick = { surface: "tab" | "window" | "screen"; audio: boolean } | "cancel";

export interface FakeMediaControl {
  /** The browser family the page believes it runs in. Set it before the page loads. */
  browser: BrowserFamily;
  /**
   * Whether a Chromium screen share goes out at two qualities: as `TWO_QUALITIES` in
   * `src/shared/encoding.ts` says, unless a journey says otherwise before it shares.
   */
  twoQualities: boolean;
  /**
   * Whether a live share steps down on a weak upload: as `STEP_DOWN` in `sending.ts`
   * says, unless a journey says otherwise before it shares.
   */
  stepDown: boolean;
  /** What the picker returns next. A tab with its sound, unless a journey says otherwise. */
  picker: FakePick;
  /** Every request made of the picker, oldest first. */
  asked: ScreenCaptureRequest[];
  /** Whether the live screen share's audio is on; null when no screen share sends any. */
  screenAudio: boolean | null;
  /** The browser ends the screen capture by itself: its "stop sharing" bar, or the shared tab closing. */
  endScreen(): void;
  /** `connection` falters, as when the browser loses its path to the media server. */
  falter(connection: MediaPurpose): void;
  /**
   * The browser gives `connection` up ("failed"): only a restart brings the sending
   * connection back, and only a new one, `replace`, the receiving connection.
   */
  fail(connection: MediaPurpose): void;
  /** `connection` recovers from faltering. */
  recover(connection: MediaPurpose): void;
  /** How many media connections of each purpose the page has made, the current ones and replacements included. */
  connections: Record<MediaPurpose, number>;
  /** The relay credential each connection holds now: the one it was made with, or a fresh one since. Null while there is none. */
  iceServers: Record<MediaPurpose, IceServer[] | null>;
  /** How many times the page has restarted its sending connection: with a fresh credential, or after "failed". */
  restarts: number;
  /** How many times the page has replaced its receiving connection with a new one. */
  replacements: number;
  /** Whether the next restarts fail, as when the browser finds no path. A restart that succeeds makes the connection fine. */
  restartFails: boolean;
  /**
   * The quality every share this tab watches arrives at: 1080p unless a journey says
   * otherwise. A real browser reads it from the frames received.
   */
  received: QualityName;
  /** Every watched share arrives at `quality` from now on, as when the media server steps a weak link down. */
  receive(quality: QualityName): void;
  /**
   * What the receiving connection's transport has received since it opened, as the tab
   * reports it: 0 unless a journey says. A new receiving connection starts again from 0.
   */
  bytes: number;
  /** Whether the tab's media connections are on the relay. */
  relayed: boolean;
  /**
   * How often the tab reports `bytes`, in milliseconds: once a minute, as
   * `USAGE_REPORT_EVERY_MS` says, unless a journey says otherwise before the page loads.
   */
  reportEvery: number;
  /**
   * The browser's statistics of this tab's live share of `kind`, read `at` milliseconds
   * after it started sending, as `RTCRtpSender.getStats()` gives them. A real browser
   * reads them every 2 seconds by itself.
   */
  stats(kind: ShareKind, entries: StatsEntry[], at: number): void;
  /** What each of this tab's live shares sends now: its encodings and what it gives up first. */
  sent: Partial<Record<ShareKind, { encodings: StepEncoding[]; degradation: Degradation }>>;
  /** How many offers the page has made: a share's step down or up makes none. */
  offers: number;
}
