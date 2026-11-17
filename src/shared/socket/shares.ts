// The shares area: the room's live shares. A share is live from the moment the instance
// has registered it with the media server until it ends, whether or not anyone watches.
// Who watches what is the watching area's.
//
// Starting and stopping a share are the sharer's tab's requests. The answer to a start
// that only the sharer's tab needs (the media server's half of the negotiation, or a
// refusal) comes in the media area; every tab on the room hears `started` and `ended`.
//
// A share whose sending tab has lost its signaling connection stays live through the
// grace period, since its media may still flow. After about 10 seconds of silence from
// that tab the room hears `reconnecting` for the share, and `reconnected` once the tab is
// heard again. The mark is the sending tab's, not the member's: another device of theirs
// that is still heard keeps the mark off their name, but not off this share.

import { unknownChange } from "./area.ts";

/** The two kinds of share (GLOSSARY.md): a screen share or a webcam share. */
export type ShareKind = "screen" | "webcam";

/** A live share, named by its sharer and kind: a member has one of each kind at most. */
export interface LiveShare {
  /** The sharer's member id. */
  member: string;
  kind: ShareKind;
}

/**
 * A live share as the room lists it: its name, and for a screen share whether it carries
 * screen audio. A share is always asked for by its name alone.
 */
export interface ListedShare extends LiveShare {
  /** A screen share only: true when it carries screen audio, false when it is video only. */
  audio?: boolean;
  /** Present only while the tab sending it has not been heard for about 10 seconds. */
  reconnecting?: true;
}

export interface SharesState {
  /** Every live share in the room, oldest first. */
  live: ListedShare[];
}

export type SharesChange =
  /** A share went live in the room. */
  | { type: "started"; share: ListedShare }
  /** A share ended: its tracks are closed at the media server. */
  | { type: "ended"; share: LiveShare }
  /** The tab sending a share has not been heard for about 10 seconds. The share is still live. */
  | { type: "reconnecting"; share: LiveShare }
  /** The tab sending a share marked "reconnecting" is heard again. */
  | { type: "reconnected"; share: LiveShare };

export type SharesRequest =
  /**
   * Start a webcam share from this tab, over the tab's media connection (see the media
   * area: the tab connects first). `offer` is the browser's SDP offer, and `video` the
   * mid of the transceiver that sends the camera.
   */
  | { type: "start"; kind: "webcam"; offer: string; video: string }
  /**
   * Start a screen share from this tab, likewise. `audio` is the mid of the transceiver
   * that sends its screen audio, left out when the browser's picker gave no sound: the
   * share is then video only.
   */
  | { type: "start"; kind: "screen"; offer: string; video: string; audio?: string }
  /** Stop this tab's share of `kind`. */
  | { type: "stop"; kind: ShareKind };

export function applyShares(state: SharesState, change: SharesChange): SharesState {
  switch (change.type) {
    case "started":
      return { live: [...state.live.filter((share) => !same(share, change.share)), change.share] };
    case "ended":
      return { live: state.live.filter((share) => !same(share, change.share)) };
    case "reconnecting":
      return {
        live: state.live.map((share) => (same(share, change.share) ? { ...share, reconnecting: true } : share)),
      };
    case "reconnected":
      return {
        live: state.live.map((share) => {
          if (!same(share, change.share)) return share;
          const { reconnecting, ...heard } = share;
          void reconnecting;
          return heard;
        }),
      };
    default:
      return unknownChange(state, change);
  }
}

function same(a: LiveShare, b: LiveShare): boolean {
  return a.member === b.member && a.kind === b.kind;
}
