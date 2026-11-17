// The usage area: the month's usage against the usage budget.
//
// Every tab with a media connection reports, every few seconds, the running total of
// bytes its media connection's transport has received since it opened, and whether that
// connection is on the relay. The instance counts usage from these reports alone (spec,
// Usage and the usage budget). A tab about to restart its media connection sends the total
// so far as final, and its next connection's totals start again from zero.
//
// The room hears how far the month has gone into the usage budget, and only once it
// matters to the member: the owner's tabs from 80%, everyone's from 95%. At the limit
// every watch has stopped and no new one is allowed until the month resets or the owner
// raises the budget; shares stay live. Below its warning a tab's state says nothing.

import { unknownChange } from "./area.ts";

/**
 * How far the month has gone into the usage budget, as one member is told it: "80%" (the
 * owner only), "95%" (everyone), or "used up", when watching has stopped.
 */
export type BudgetLevel = "80%" | "95%" | "used up";

export interface UsageState {
  /** Absent while the month is below the member's warning. */
  budget?: BudgetLevel;
}

/** The level changed for this member; null when it fell below their warning. */
export type UsageChange = { type: "budget"; budget: BudgetLevel | null };

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
  if (change.type === "budget") return change.budget === null ? {} : { budget: change.budget };
  return unknownChange(state, change);
}
