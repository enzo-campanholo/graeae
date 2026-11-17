// The usage area: the month's usage against the usage budget.
//
// Every tab with a media connection reports, every few seconds, the running total of
// bytes its media connection's transport has received since it opened, and whether that
// connection is on the relay. The instance counts usage from these reports alone (spec,
// Usage and the usage budget). A tab about to restart its media connection sends the total
// so far as final, and its next connection's totals start again from zero.
//
// The room hears nothing of usage yet: members see nothing about it, and the owner reads
// it on the owner page. Ticket 24 adds the warnings.

import { unknownChange } from "./area.ts";

/** Nothing yet. Ticket 24 adds the warnings. */
export type UsageState = Record<never, never>;

export type UsageChange = never;

export type UsageRequest =
  /**
   * `bytes` is the running total this tab's media connection's transport has received
   * since it opened; `relayed`, whether the connection goes through the relay now.
   * `final` says it is the last total of this connection: the next starts from zero.
   */
  { type: "received"; bytes: number; relayed: boolean; final?: true };

/** How often a tab with a media connection reports what it has received. */
export const USAGE_REPORT_EVERY_MS = 5_000;

export function applyUsage(state: UsageState, change: UsageChange): UsageState {
  return unknownChange(state, change);
}
