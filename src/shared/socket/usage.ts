// The usage area: the month's usage against the usage budget.
//
// Every tab with a receiving connection reports, once a minute, the running total of
// bytes that connection's transport has received since it opened, and whether it is on
// the relay; the sending connection reports nothing (ADR 0005). The instance counts usage
// from these reports alone (spec, Usage and the usage budget). A tab about to replace or
// let go of its receiving connection sends the total so far as final, and its next
// connection's totals start again from zero. The instance counts from zero only once it
// has made or replaced that connection itself: a lower total on the same connection is
// ignored.
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
   * `final` says it is the last total of this connection, before the tab makes a new one
   * or restarts it; the instance needs nothing from it, since it made or restarted the
   * connection itself.
   */
  { type: "received"; bytes: number; relayed: boolean; final?: true };

/**
 * How often a tab with a media connection reports what it has received: once a minute.
 * Each report writes rows, of which the free plan allows 100,000 a day (ADR 0004). A
 * report carries the running total, so a rarer one loses nothing; what it costs is a
 * meter and budget warnings up to a minute behind, and a tab that vanishes charged at its
 * watches' maximum bitrate for up to a minute since its last report.
 */
export const USAGE_REPORT_EVERY_MS = 60_000;

export function applyUsage(state: UsageState, change: UsageChange): UsageState {
  switch (change.type) {
    case "budget":
      return change.budget === null ? {} : { budget: change.budget };
    default:
      // A union of one kind does not narrow to `never`, but its `type` does.
      return unknownChange(state, change.type);
  }
}
