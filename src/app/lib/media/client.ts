// The media client: the browser's one module for media. It captures (a webcam for now;
// ticket 15 adds the screen and its audio) and holds the tab's one media connection,
// over which the tab sends what it shares and receives what it watches.
//
// It never talks to the instance itself: the room client carries the offers and answers
// over the tab's socket, so no media server identifier ever reaches the page (ADR 0003).
// Ticket 12 adds the real implementation, on `getUserMedia` and `RTCPeerConnection`;
// the fake in `fake.ts` captures and connects nothing, for Seam 2.

import type { IceServer, ShareKind } from "../../../shared/socket/index.ts";

/** Something captured on this device, ready to be sent as a share. */
export interface Capture {
  kind: ShareKind;
  /** What the sharer's own preview shows; null when there is no picture to show. */
  stream: MediaStream | null;
}

/** An offer to send a capture over the media connection, for the instance to answer. */
export interface Offer {
  /** The browser's SDP offer. */
  sdp: string;
  /** The mid of the transceiver that carries the capture's video. */
  video: string;
}

export interface MediaClient {
  /** Starts the webcam, at once and with no dialog of graeae's own. Throws if the browser refuses. */
  captureWebcam(): Promise<Capture>;
  /**
   * Makes the tab's one media connection, offering the relay in `iceServers`. Called
   * once, the first time the tab shares or watches.
   */
  connect(iceServers: IceServer[]): void;
  /** Adds `capture` to the media connection and makes the offer that sends it. */
  offer(capture: Capture): Promise<Offer>;
  /** Applies the media server's answer to the last offer: the capture is now being sent. */
  accept(answer: string): Promise<void>;
  /** Stops sending `capture` and stops capturing it. Safe to call more than once. */
  stop(capture: Capture): void;
  /** Stops every capture and closes the media connection, as the tab leaves the room. */
  close(): void;
}
