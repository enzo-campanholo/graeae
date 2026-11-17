// The presence area: which members are present in the room, and which of them the room
// has stopped hearing. A member is present while at least one of their tabs has the room
// open, and is present once however many tabs and devices that is. A tab's presence ends
// at once when it leaves cleanly. A tab whose connection is lost keeps its member present
// through a grace period (see `heartbeat.ts`), and after about 10 seconds of silence the
// member is marked "reconnecting" unless another of their tabs in the room is still heard.

import { unknownChange } from "./area.ts";

export interface PresenceState {
  /** The ids of the members present, each once. The tab's own member is among them. */
  present: string[];
  /** The ids of the present members the room has not heard from for about 10 seconds. */
  reconnecting: string[];
}

export type PresenceChange =
  /** A member who was not present now is: their first tab opened the room. */
  | { type: "arrived"; member: string }
  /** A member who was present no longer is: their last tab left, or its grace period ran out. */
  | { type: "left"; member: string }
  /** A present member has not been heard for about 10 seconds: no tab of theirs in the room is. */
  | { type: "reconnecting"; member: string }
  /** A member marked "reconnecting" is heard again. */
  | { type: "reconnected"; member: string };

/** What a tab may ask of the presence area. Nothing: the heartbeat is the connection's own. */
export type PresenceRequest = never;

export function applyPresence(state: PresenceState, change: PresenceChange): PresenceState {
  switch (change.type) {
    case "arrived":
      return state.present.includes(change.member) ? state : { ...state, present: [...state.present, change.member] };
    case "left":
      return {
        present: state.present.filter((member) => member !== change.member),
        reconnecting: state.reconnecting.filter((member) => member !== change.member),
      };
    case "reconnecting":
      return state.reconnecting.includes(change.member)
        ? state
        : { ...state, reconnecting: [...state.reconnecting, change.member] };
    case "reconnected":
      return { ...state, reconnecting: state.reconnecting.filter((member) => member !== change.member) };
    default:
      return unknownChange(state, change);
  }
}
