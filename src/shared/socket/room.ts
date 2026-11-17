// The room area: the room itself, as the bar's header shows it.

import { unknownChange } from "./area.ts";

/** The room a tab is showing. */
export interface RoomState {
  /** Fixed when the room is made; the room's page is `/r/<address>`. */
  address: string;
  name: string;
}

/** Changes to the room itself. None yet: ticket 08 adds renaming. */
export type RoomChange = never;

export function applyRoom(state: RoomState, change: RoomChange): RoomState {
  return unknownChange(state, change);
}
