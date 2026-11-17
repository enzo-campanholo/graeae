// The list of rooms' connection: the one WebSocket the list at the root address holds to
// the instance. It is a signaling connection of its own kind, which shows a member each
// of their rooms and who is present in it, live, without making them present anywhere.
//
// Connecting. The list opens `LIST_SOCKET_PATH`. The instance refuses it with its one
// "nothing here" answer unless the browser is a remembered device.
//
// The conversation. Every message is one JSON text frame. The instance sends
// `{ type: "state" }` first, holding the whole list, then a `rooms` change each time a
// room's line in the list changes: a room renamed, someone arriving or leaving, or a
// room the member newly has access to. A list that connects again gets the whole list
// again. The list sends only the heartbeat, which the instance answers, as on a room's
// socket (`heartbeat.ts`); a list's lost connection has no presence to keep.

import { unknownChange } from "./area.ts";
import type { Heard, Heartbeat } from "./heartbeat.ts";

export const LIST_SOCKET_PATH = "/api/socket";

/** One room's line in the list. */
export interface ListedRoom {
  /** Fixed when the room is made; the room's page is `/r/<address>`. */
  address: string;
  name: string;
  /** The display names of the members present, in alphabetical order. */
  present: string[];
}

export interface ListState {
  /** The member the list belongs to. */
  you: { owner: boolean };
  /** Every room the member has access to, oldest first. */
  rooms: ListedRoom[];
}

export type ListChange =
  /** A room's line as it is now: one already listed is replaced, a new one is added at the end. */
  { type: "listed"; room: ListedRoom };

/**
 * A message from the instance to the list. `gone` means this tab's device is forgotten:
 * the socket closes next and the page is "nothing here".
 */
export type ListMessage =
  | { type: "state"; state: ListState }
  | { type: "rooms"; change: ListChange }
  | { type: "gone" }
  | Heard;

/** A message from the list to the instance. */
export type ListClientMessage = Heartbeat;

export function applyList(state: ListState, change: ListChange): ListState {
  switch (change.type) {
    case "listed": {
      const { room } = change;
      const known = state.rooms.some((listed) => listed.address === room.address);
      return {
        ...state,
        rooms: known
          ? state.rooms.map((listed) => (listed.address === room.address ? room : listed))
          : [...state.rooms, room],
      };
    }
    default:
      // A union of one kind does not narrow to `never`, but its `type` does.
      return unknownChange(state, change.type);
  }
}

/** The list after `message`. A full state replaces whatever the list held. */
export function applyListMessage(state: ListState | null, message: ListMessage): ListState | null {
  if (message.type === "state") return message.state;
  if (!state) return null;
  return message.type === "rooms" ? applyList(state, message.change) : state;
}
