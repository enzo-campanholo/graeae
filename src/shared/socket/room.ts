// The room area: the room itself, as the bar's header shows it.

import { unknownChange } from "./area.ts";

/** The room a tab is showing. */
export interface RoomState {
  /** Fixed when the room is made; the room's page is `/r/<address>`. */
  address: string;
  name: string;
}

export type RoomChange =
  /** The owner renamed the room. Its address stays as it was. */
  { type: "renamed"; name: string };

export function applyRoom(state: RoomState, change: RoomChange): RoomState {
  switch (change.type) {
    case "renamed":
      return { ...state, name: change.name };
    default:
      // A union of one kind does not narrow to `never`, but its `type` does.
      return unknownChange(state, change.type);
  }
}
