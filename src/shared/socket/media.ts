// The media area: this tab's own media connections, a sending connection for what it
// shares and a receiving connection for what it watches (ADR 0005). It holds no part of
// the room, and every change in it goes to the one tab it concerns.
//
// A tab makes each connection the first time it needs it, not on opening the room: the
// sending connection on its first share, the receiving connection on its first watch. It
// sends `connect` naming the connection and gets `connected`, with a relay credential
// made for that connection alone.
//
// Sending runs from the tab: it makes its offers over the sending connection, and the
// instance answers each one here. Only the sending connection is restarted in place, and
// only its faltering keeps a share live for 30 seconds.
//
// Receiving runs the other way, and the tab never makes an offer on that connection: the
// media server makes the offer (`pulled`) and the tab sends its answer back. A receiving
// connection that needs a new path is replaced, never restarted (`replace`): the instance
// makes a new one, pulls each of the tab's watches onto it in turn, then closes the old
// connection's pulls.
//
// A tab runs one negotiation at a time on each connection, and waits for `answered`
// before it starts the next on the receiving one.
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

/** Which of a tab's two media connections a message is about: the one it shares over, or the one it watches over. */
export type MediaPurpose = "sending" | "receiving";

/** Whether `value` names one of a tab's two media connections. */
export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return value === "sending" || value === "receiving";
}

/**
 * What the full state says of this tab's media connections. A tab that reconnects within
 * its grace period is the same tab, and keeps its connections with whatever they carry.
 * One that comes back after the grace period ran out is a new tab, with none: what its
 * old ones carried was closed, and the page builds them again.
 */
export interface MediaState {
  /** The connections the instance holds for this tab, made or being made. */
  connected: MediaPurpose[];
  /**
   * The kinds of share this tab sends that are live. A share of the member's that the
   * room lists but this tab does not send was ended here, or handed over to another tab
   * or device, while the tab was away.
   */
  sending: ShareKind[];
}

export type MediaRequest =
  /**
   * Make this tab's `connection`. A tab that has one, or is having one made, gets no
   * answer; except a tab whose socket was lost before the answer reached it, which gets a
   * new one if the old one carries nothing yet.
   */
  | { type: "connect"; connection: MediaPurpose }
  /**
   * The tab's sending connection has faltered while its socket is fine: the browser is
   * trying to recover it. The shares the tab sends stay live for 30 seconds, and end then
   * unless the tab says `recovered` first. A receiving connection that falters ends nothing.
   */
  | { type: "faltering" }
  /** The tab's sending connection has recovered from faltering. */
  | { type: "recovered" }
  /** The browser's SDP answer to the media server's offer in `pulled` or `moved`. The instance replies `answered`. */
  | { type: "answer"; answer: string }
  /**
   * Restart the tab's sending connection: the browser's SDP `offer` restarts its ICE,
   * keeping every share. A tab on the relay sends it with the fresh credential `renewed`
   * brought, and any tab whose sending connection the browser gave up on sends it. The
   * media server takes no offer without a track, so the offer carries an empty
   * transceiver of its own, on `mid`, which sends nothing. The instance replies
   * `restarted` or `restart-refused`.
   */
  | { type: "restart"; offer: string; mid: string }
  /**
   * The restart failed: let go of the tab's sending connection and the shares it carries.
   * They end; then it hears `dropped` for the sending connection, and makes a new one,
   * starting its shares again.
   */
  | { type: "reconnect" }
  /**
   * Replace the tab's receiving connection, which the browser gave up on, or which is on
   * the relay when its credential is renewed. The instance makes a new one and replies
   * `connected` for it (or `unavailable`), then pulls each of the tab's watches onto it
   * in turn, each with `pulled`, which the tab answers before the next comes; then it
   * closes the old connection's pulls, and the tab hears `replaced`. The tab sends its
   * final usage total first: the new connection counts from zero.
   */
  | { type: "replace" };

export type MediaChange =
  /**
   * The tab's `connection` is made. `iceServers` offer the relay over UDP, TCP and TLS
   * with a credential that lasts 12 hours, minted for this connection alone.
   */
  | { type: "connected"; connection: MediaPurpose; iceServers: IceServer[] }
  /**
   * 11 hours after the relay credential of the tab's `connection` was minted: a fresh
   * one, lasting 12 hours and minted for that connection alone. A tab on a direct path
   * takes it silently. One on the relay restarts its sending connection with it
   * (`restart`), or replaces its receiving connection (`replace`).
   */
  | { type: "renewed"; connection: MediaPurpose; iceServers: IceServer[] }
  /** The tab's `connection` could not be made. The tab may ask again. */
  | { type: "unavailable"; connection: MediaPurpose }
  /** This tab's share of `kind` is live: `answer` is the media server's SDP answer to its offer. */
  | { type: "published"; kind: ShareKind; answer: string }
  /** This tab's share of `kind` did not start: a check failed, or the media server did. */
  | { type: "refused"; kind: ShareKind }
  /**
   * `share` is pulled to this tab's receiving connection: its picture on the transceiver
   * `video`, and its screen audio, when it has any, on `audio`. `offer` is the media
   * server's SDP offer; the tab answers it with `answer`. A new watch goes on the stage
   * with the watching area's `watched`, which comes next; a watch pulled onto a
   * replacement connection is on the stage already.
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
  /** The restart was refused: the tab has no sending connection, or the media server failed it. */
  | { type: "restart-refused" }
  /**
   * The replacement is done: every watch that could be pulled onto the new receiving
   * connection is on it, and the old connection's pulls are closed. A watch that could not
   * be pulled again has left the stage, with the watching area's `unwatched`.
   */
  | { type: "replaced" }
  /**
   * The instance let go of this tab's `connection`. A sending connection: its media
   * faltered for 30 seconds, which ended its shares; or the tab asked it to
   * (`reconnect`). Either connection: a share or watch on it did not go live, and it
   * carried nothing else. The tab makes a new one the next time it needs it.
   */
  | { type: "dropped"; connection: MediaPurpose };
