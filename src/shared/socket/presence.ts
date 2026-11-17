// The presence area: which members are present in the room. A member is present while
// at least one of their tabs has the room open, and is present once however many tabs
// and devices that is. A tab's presence ends at once when it leaves cleanly.

import { unknownChange } from "./area.ts";

export interface PresenceState {
  /** The ids of the members present, each once. The tab's own member is among them. */
  present: string[];
}

export type PresenceChange =
  /** A member who was not present now is: their first tab opened the room. */
  | { type: "arrived"; member: string }
  /** A member who was present no longer is: their last tab left. */
  | { type: "left"; member: string };

/** What a tab may ask of the presence area. Nothing yet: ticket 06 adds the heartbeat. */
export type PresenceRequest = never;

export function applyPresence(state: PresenceState, change: PresenceChange): PresenceState {
  switch (change.type) {
    case "arrived":
      return state.present.includes(change.member) ? state : { present: [...state.present, change.member] };
    case "left":
      return { present: state.present.filter((member) => member !== change.member) };
    default:
      return unknownChange(state, change);
  }
}
