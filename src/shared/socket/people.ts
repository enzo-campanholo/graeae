// The people area: the members with access to the room, present or not, and which of
// them the tab belongs to. The owner is listed like anyone else.

import { unknownChange } from "./area.ts";

export interface Person {
  /** Stable for as long as the member exists. Other areas name members by it. */
  id: string;
  /** Their display name. */
  name: string;
}

export interface PeopleState {
  /**
   * The member the tab belongs to, who is always among `members`, and how many rooms they
   * have access to: the bar links back to the list of rooms only when it is more than one.
   */
  you: { id: string; owner: boolean; rooms: number };
  /** Every member with access to the room, the owner among them, in no particular order. */
  members: Person[];
}

export type PeopleChange =
  /** A member gained access to the room: they pressed an invite to it, or the owner ticked it. */
  | { type: "added"; person: Person }
  /** A member lost access to the room: the owner removed them from it or from the instance. */
  | { type: "removed"; member: string }
  /** A member changed their display name. */
  | { type: "renamed"; member: string; name: string }
  /** The tab's own member now has access to this many rooms. Sent to that member's tabs alone. */
  | { type: "access"; rooms: number };

export function applyPeople(state: PeopleState, change: PeopleChange): PeopleState {
  switch (change.type) {
    case "added":
      return {
        ...state,
        members: [...state.members.filter((person) => person.id !== change.person.id), change.person],
      };
    case "removed":
      return { ...state, members: state.members.filter((person) => person.id !== change.member) };
    case "renamed":
      return {
        ...state,
        members: state.members.map((person) =>
          person.id === change.member ? { ...person, name: change.name } : person,
        ),
      };
    case "access":
      return { ...state, you: { ...state.you, rooms: change.rooms } };
    default:
      return unknownChange(state, change);
  }
}
