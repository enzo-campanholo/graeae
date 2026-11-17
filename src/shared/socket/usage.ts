// The usage area: the month's usage against the usage budget. Empty until ticket 23.

import { unknownChange } from "./area.ts";

/** Nothing yet. Tickets 23 and 24 add the usage and its warnings. */
export type UsageState = Record<never, never>;

export type UsageChange = never;

export type UsageRequest = never;

export function applyUsage(state: UsageState, change: UsageChange): UsageState {
  return unknownChange(state, change);
}
