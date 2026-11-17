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
// - The media area is the exception: it is this tab's own conversation about its media
//   connection. It holds no part of the room and changes nothing in `RoomView`.
// - A clean close by the tab (closed, reloaded, navigated away) ends its presence at once.

import type { MediaChange, MediaRequest } from "./media.ts";
import { applyPeople, type PeopleChange, type PeopleState } from "./people.ts";
import { applyPresence, type PresenceChange, type PresenceRequest, type PresenceState } from "./presence.ts";
import { applyRoom, type RoomChange, type RoomState } from "./room.ts";
import { applyShares, type SharesChange, type SharesRequest, type SharesState } from "./shares.ts";
import { applyUsage, type UsageChange, type UsageRequest, type UsageState } from "./usage.ts";

export type * from "./media.ts";
export type * from "./people.ts";
export type * from "./presence.ts";
export type * from "./room.ts";
export type * from "./shares.ts";
export type * from "./usage.ts";

/** Where a tab showing the room at `/r/<address>` opens its socket. */
export function roomSocketPath(address: string): string {
  return `/api/socket/${encodeURIComponent(address)}`;
}

/** The whole room as one tab sees it, area by area. */
export interface RoomView {
  room: RoomState;
  people: PeopleState;
  presence: PresenceState;
  shares: SharesState;
  usage: UsageState;
}

/** A message from the instance to a tab. */
export type ServerMessage =
  | { type: "state"; state: RoomView }
  | { type: "room"; change: RoomChange }
  | { type: "people"; change: PeopleChange }
  | { type: "presence"; change: PresenceChange }
  | { type: "shares"; change: SharesChange }
  | { type: "usage"; change: UsageChange }
  | { type: "media"; change: MediaChange };

/** A message from a tab to the instance. */
export type ClientMessage =
  | { type: "presence"; request: PresenceRequest }
  | { type: "shares"; request: SharesRequest }
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
    case "usage":
      return { ...view, usage: applyUsage(view.usage, message.change) };
    case "media":
      // About this tab's own media connection, not the room: the room client hands it on.
      return view;
    default:
      return view;
  }
}
