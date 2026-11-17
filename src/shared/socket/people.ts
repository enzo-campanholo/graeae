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
  /** The member the tab belongs to, who is always among `members`. */
  you: { id: string; owner: boolean };
  /** Every member with access to the room, the owner among them, in no particular order. */
  members: Person[];
}

export type PeopleChange =
  /** A member gained access to the room, for instance by pressing an invite to it. */
  | { type: "added"; person: Person }
  /** A member changed their display name. Ticket 07 sends it. */
  | { type: "renamed"; member: string; name: string };

export function applyPeople(state: PeopleState, change: PeopleChange): PeopleState {
  switch (change.type) {
    case "added":
      return {
        ...state,
        members: [...state.members.filter((person) => person.id !== change.person.id), change.person],
      };
    case "renamed":
      return {
        ...state,
        members: state.members.map((person) =>
          person.id === change.member ? { ...person, name: change.name } : person,
        ),
      };
    default:
      return unknownChange(state, change);
  }
}
