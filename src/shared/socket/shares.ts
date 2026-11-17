// The shares area: the room's live shares and who watches them. Empty until ticket 10.

import { unknownChange } from "./area.ts";

/** Nothing yet. Ticket 10 adds the live shares. */
export type SharesState = Record<never, never>;

export type SharesChange = never;

export type SharesRequest = never;

export function applyShares(state: SharesState, change: SharesChange): SharesState {
  return unknownChange(state, change);
}
