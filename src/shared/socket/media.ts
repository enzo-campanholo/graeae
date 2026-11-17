// The media area: this tab's own media connection, which carries what it shares and what
// it watches. It holds no part of the room, and every change in it goes to the one tab it
// concerns.
//
// A tab makes its one media connection the first time it shares or watches, not on
// opening the room: it sends `connect` and gets `connected`, with a relay credential made
// for this connection alone. It then makes its offers over that connection, and the
// instance answers each one here. Watching runs the other way: the media server makes
// the offer (`pulled`) and the tab sends its answer back. A tab runs one negotiation at
// a time, and waits for `answered` before it starts the next.
//
// No media server identifier ever crosses the socket in either direction (ADR 0003): the
// tab names its own transceivers by mid, and asks for shares by member and kind.

import type { LiveShare, ShareKind } from "./shares.ts";

/** One way to reach the relay, as `RTCPeerConnection` takes it in `iceServers`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * What the full state says of this tab's media connection. A tab that reconnects within
 * its grace period is the same tab, and keeps its media connection with whatever it
 * shares and watches. One that comes back after the grace period ran out is a new tab,
 * with none: what its old one carried was closed, and the page builds it again.
 */
export interface MediaState {
  /** Whether the instance holds a media connection for this tab. */
  connected: boolean;
  /**
   * The kinds of share this tab sends that are live. A share of the member's that the
   * room lists but this tab does not send was ended here, or handed over to another tab
   * or device, while the tab was away.
   */
  sending: ShareKind[];
}

export type MediaRequest =
  /**
   * Make this tab's media connection. A tab that has one, or is having one made, gets
   * no answer; except a tab whose socket was lost before the answer reached it, which
   * gets a new one if the old one carries nothing yet.
   */
  | { type: "connect" }
  /**
   * The tab's media connection has faltered while its socket is fine: the browser is
   * trying to recover it. The shares the tab sends stay live for 30 seconds, and end then
   * unless the tab says `recovered` first.
   */
  | { type: "faltering" }
  /** The tab's media connection has recovered from faltering. */
  | { type: "recovered" }
  /** The browser's SDP answer to the media server's offer in `pulled`. The instance replies `answered`. */
  | { type: "answer"; answer: string }
  /**
   * Restart the tab's media connection: the browser's SDP `offer` restarts its ICE,
   * keeping every share and watch. A tab on the relay sends it with the fresh credential
   * `renewed` brought, and any tab whose connection the browser gave up on sends it, each
   * after its final usage total. The media server takes no offer without a track, so the
   * offer carries an empty transceiver of its own, on `mid`, which sends nothing. The
   * instance replies `restarted` or `restart-refused`.
   */
  | { type: "restart"; offer: string; mid: string }
  /**
   * The restart failed: let go of the tab's media connection and everything it carries.
   * Its shares end and its watching is closed; then it hears `dropped`, and makes a new
   * connection, starting its shares again and watching again what it watched.
   */
  | { type: "reconnect" };

export type MediaChange =
  /**
   * The tab's media connection is made. `iceServers` offer the relay over UDP, TCP and
   * TLS with a credential that lasts 12 hours, minted for this connection alone.
   */
  | { type: "connected"; iceServers: IceServer[] }
  /**
   * 11 hours after the tab's relay credential was minted: a fresh one, lasting 12 hours
   * and minted for this connection alone. A tab on a direct path takes it silently; one
   * on the relay restarts its connection with it (`restart`).
   */
  | { type: "renewed"; iceServers: IceServer[] }
  /** The media connection could not be made. The tab may ask again. */
  | { type: "unavailable" }
  /** This tab's share of `kind` is live: `answer` is the media server's SDP answer to its offer. */
  | { type: "published"; kind: ShareKind; answer: string }
  /** This tab's share of `kind` did not start: a check failed, or the media server did. */
  | { type: "refused"; kind: ShareKind }
  /**
   * `share` is pulled to this tab's media connection: its picture on the transceiver
   * `video`, and its screen audio, when it has any, on `audio`. `offer` is the media
   * server's SDP offer; the tab answers it with `answer`. The share goes on the stage
   * with the watching area's `watched`, which comes next.
   */
  | { type: "pulled"; share: LiveShare; offer: string; video: string; audio?: string }
  /** `share` could not be watched on this tab: a check failed, or the media server did. */
  | { type: "pull-refused"; share: LiveShare }
  /**
   * The share `share` this tab watches was handed over to another tab or device of its
   * sharer in this room: its old pull is closed, and the new share is pulled in its place.
   * It stays on the stage. `offer`, `video` and `audio` are as in `pulled`, and the tab
   * answers with `answer`, in turn with its other negotiations.
   */
  | { type: "moved"; share: LiveShare; offer: string; video: string; audio?: string }
  /**
   * This tab's share of `kind` is now sent from another tab or device of the member's,
   * which started it with `handOver`: its tracks here are closed, and the tab lets go of
   * its capture. It may come with the room's `ended`, when the new share is in another room.
   */
  | { type: "handed-over"; kind: ShareKind }
  /** The media server has the tab's answer, so the tab may start its next negotiation. */
  | { type: "answered" }
  /** The media server's SDP answer to the tab's `restart` offer. */
  | { type: "restarted"; answer: string }
  /** The restart was refused: the tab has no media connection, or the media server failed it. */
  | { type: "restart-refused" }
  /**
   * The instance let go of this tab's media connection: its media faltered for 30
   * seconds, which ended its shares, and it carried nothing else; or the tab asked it to
   * (`reconnect`). The tab makes a new one the next time it shares or watches.
   */
  | { type: "dropped" };
