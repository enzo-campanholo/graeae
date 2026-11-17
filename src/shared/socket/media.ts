// The media area: this tab's own media connection, which carries what it shares and what
// it watches. It holds no part of the room, and every change in it goes to the one tab it
// concerns.
//
// A tab makes its one media connection the first time it shares or watches, not on
// opening the room: it sends `connect` and gets `connected`, with a relay credential made
// for this connection alone. It then makes its offers over that connection, and the
// instance answers each one here.
//
// No media server identifier ever crosses the socket in either direction (ADR 0003): the
// tab names its own transceivers by mid, and asks for shares by member and kind.

import type { ShareKind } from "./shares.ts";

/** One way to reach the relay, as `RTCPeerConnection` takes it in `iceServers`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type MediaRequest =
  /** Make this tab's media connection. A tab that already has one gets no answer. */
  { type: "connect" };

export type MediaChange =
  /**
   * The tab's media connection is made. `iceServers` offer the relay over UDP, TCP and
   * TLS with a credential that lasts 12 hours, minted for this connection alone.
   */
  | { type: "connected"; iceServers: IceServer[] }
  /** The media connection could not be made. The tab may ask again. */
  | { type: "unavailable" }
  /** This tab's share of `kind` is live: `answer` is the media server's SDP answer to its offer. */
  | { type: "published"; kind: ShareKind; answer: string }
  /** This tab's share of `kind` did not start: a check failed, or the media server did. */
  | { type: "refused"; kind: ShareKind };
