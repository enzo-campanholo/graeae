// The signaling connection: the one WebSocket each open tab holds to the instance. Both
// sides import these types, so the instance and the page cannot disagree about a message.
//
// Connecting. A tab showing the room at `/r/<address>` opens `roomSocketPath(address)`.
// The instance refuses the socket with its one "nothing here" answer (status 404, no
// upgrade) unless the browser is a remembered device of a member with access to that
// room. Whatever reaches the socket is therefore for that member and that room.
//
// The conversation. Every message is one JSON text frame.
// - The instance sends `{ type: "state" }` first, holding the whole room as it is, then
//   one message per change as it happens. A tab that connects again gets the whole state
//   again; nothing is replayed.
// - Every other message carries a change for one area of the room. Each area lives in its
//   own file with its slice of the state, its changes, what a tab may ask of it, and how a
//   change applies, so tickets that touch different areas rarely edit the same lines.
//   A new kind of change goes in its area's union; this file changes only for a new area.
// - The tab sends requests the same way, by area. A request the instance does not
//   understand is ignored.
// - The tab sends `{ type: "heartbeat" }` every 5 seconds and the instance answers each
//   with `{ type: "heard" }` (`heartbeat.ts`).
// - The media area is the exception: it is this tab's own conversation about its media
//   connection. It holds no part of the room and changes nothing in `RoomView`.
// - A clean close by the tab (closed, reloaded, navigated away) ends its presence at once.
//   A lost connection (a failed socket, a close with `LOST_CLOSE_CODE`, or silence) keeps
//   it present through the grace period while the tab reconnects; a tab whose grace
//   period ran out on a socket still open has that socket closed with `SILENT_CLOSE_CODE`.
//   A tab reconnects by naming the id its full state gave it, and takes its tab back even
//   when the instance still holds the old socket open: that one is closed with
//   `TAKEN_BACK_CLOSE_CODE`, and the tab does not leave.
// - A tab whose device is no longer remembered gets `{ type: "gone" }`, and then the
//   instance closes its socket. Its page becomes "nothing here", saying nothing more.

import type { Heard, Heartbeat } from "./heartbeat.ts";
import type { MediaChange, MediaRequest, MediaState } from "./media.ts";
import { applyPeople, type PeopleChange, type PeopleState } from "./people.ts";
import { applyPresence, type PresenceChange, type PresenceRequest, type PresenceState } from "./presence.ts";
import { applyRoom, type RoomChange, type RoomState } from "./room.ts";
import { applyShares, type SharesChange, type SharesRequest, type SharesState } from "./shares.ts";
import { applyUsage, type UsageChange, type UsageRequest, type UsageState } from "./usage.ts";
import { applyWatching, type WatchingChange, type WatchingRequest, type WatchingState } from "./watching.ts";

export type * from "./media.ts";
export type * from "./people.ts";
export type * from "./presence.ts";
export type * from "./room.ts";
export type * from "./shares.ts";
export type * from "./usage.ts";
export type * from "./watching.ts";

/**
 * Where a tab showing the room at `/r/<address>` opens its socket. A page reconnecting
 * names the `tab` its last full state said it was, to take that tab back.
 */
export function roomSocketPath(address: string, tab?: string): string {
  const path = `/api/socket/${encodeURIComponent(address)}`;
  return tab === undefined ? path : `${path}?tab=${encodeURIComponent(tab)}`;
}

/** The whole room as one tab sees it, area by area. */
export interface RoomView {
  room: RoomState;
  people: PeopleState;
  presence: PresenceState;
  shares: SharesState;
  watching: WatchingState;
  usage: UsageState;
}

/** A message from the instance to a tab. */
export type ServerMessage =
  /** The whole room, this tab's id, and its own media connection as the instance holds it. */
  | { type: "state"; tab: string; state: RoomView; media: MediaState }
  /** This tab's device is forgotten: the socket closes next and the page is "nothing here". */
  | { type: "gone" }
  | Heard
  | { type: "room"; change: RoomChange }
  | { type: "people"; change: PeopleChange }
  | { type: "presence"; change: PresenceChange }
  | { type: "shares"; change: SharesChange }
  | { type: "watching"; change: WatchingChange }
  | { type: "usage"; change: UsageChange }
  | { type: "media"; change: MediaChange };

/** A message from a tab to the instance. */
export type ClientMessage =
  | Heartbeat
  | { type: "presence"; request: PresenceRequest }
  | { type: "shares"; request: SharesRequest }
  | { type: "watching"; request: WatchingRequest }
  | { type: "usage"; request: UsageRequest }
  | { type: "media"; request: MediaRequest };

/** The room after `message`. A full state replaces whatever the tab held. */
export function applyMessage(view: RoomView | null, message: ServerMessage): RoomView | null {
  if (message.type === "state") return message.state;
  if (!view) return null;
  switch (message.type) {
    case "room":
      return { ...view, room: applyRoom(view.room, message.change) };
    case "people":
      return { ...view, people: applyPeople(view.people, message.change) };
    case "presence":
      return { ...view, presence: applyPresence(view.presence, message.change) };
    case "shares":
      return { ...view, shares: applyShares(view.shares, message.change) };
    case "watching":
      return { ...view, watching: applyWatching(view.watching, message.change) };
    case "usage":
      return { ...view, usage: applyUsage(view.usage, message.change) };
    case "media":
      // About this tab's own media connection, not the room: the room client hands it on.
      return view;
    default:
      return view;
  }
}
