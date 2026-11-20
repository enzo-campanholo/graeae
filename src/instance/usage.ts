// The usage count (spec, Usage and the usage budget): the media members have watched this
// month, in bytes, counted from what their tabs report and from the instance's own
// records where a tab falls silent. Enforcement runs on this count alone; Cloudflare's
// own figure is not read.
//
// The rules, each applied as a charge is made:
// - Each tab with a media connection reports the running total its transport has received
//   since it opened. The difference from the tab's last report is charged, so the first
//   report is charged in full and a lost report is made up by the next. The next total
//   counts from zero only once the instance itself has made the tab a new media
//   connection or restarted its old one (the tab sends its final total before either). A
//   total lower than the last on the same connection is ignored, so a tab cannot have
//   what it already reported charged again.
// - Every reported byte has a fixed margin added (`SAFETY_MARGIN_PERCENT`), so the count
//   never reads below Cloudflare's own figure. It is 0%: on a real session the browser's
//   own total read 7.9% above Cloudflare's media server egress, since it counts packet
//   overhead that Cloudflare leaves out, and 5% on top took the count past the 0 to 10%
//   above it that the spec allows.
// - Relayed watching is counted twice (`RELAYED_COUNTS_TWICE`): what a tab reports while
//   its connection is on the relay, and any charge for a gap after such a report.
//   Cloudflare bills traffic between its relay and its media server once, but on a TCP
//   relay the media server's egress read 16% above what the browser received, so counting
//   it once could read below the bill.
// - Where no later total arrives, each share the tab watched is charged at its maximum
//   bitrate from the tab's last report (or the watch's start, if later) until the instance
//   recorded the watch as ended. A watch that ends while its tab can still report waits:
//   the tab's next report covers it, and only if the tab goes without one is it charged.
// - A sharer's upload is never reported, so never counted: a tab reports what it received.
//
// Each charge goes to the UTC day it is made on. The month runs from the owner's reset
// day, at midnight UTC, to the same day of the next month, and sums the days between.
//
// The usage budget is the owner's, in whole GB a month, 1,000 until set. The month's
// `level` against it is what the instance warns of and stops watching at; graeae never
// lowers quality on its own.

import { GIGABYTE, type UsageAnswer } from "../shared/api.ts";
import type { BudgetLevel } from "../shared/socket/usage.ts";
import { log } from "./log.ts";

/**
 * The share of every reported byte added on top, in percent. A constant, not a setting;
 * see the top of this file for why it is 0.
 */
export const SAFETY_MARGIN_PERCENT = 0;

/** Whether relayed watching is counted twice. The one place to switch the doubling off. */
export const RELAYED_COUNTS_TWICE = true;

/** The usage budget until the owner sets another, in GB: 1,000, Cloudflare's monthly allowance. */
export const DEFAULT_BUDGET_GIGABYTES = 1_000;

/** The day of the month usage resets on until the owner sets another. */
export const DEFAULT_RESET_DAY = 1;

const DAY_MS = 86_400_000;
const RESET_DAY_SETTING = "reset_day";
const BUDGET_SETTING = "budget_gigabytes";

interface TabRow extends Record<string, SqlStorageValue> {
  total: number;
  relayed: number;
  restarted: number;
}

interface WatchRow extends Record<string, SqlStorageValue> {
  watch_id: string;
  max_bitrate: number;
  since: number;
  relayed: number;
  ended_at: number | null;
}

export class Usage {
  constructor(private readonly sql: SqlStorage) {}

  /**
   * A report from `tab`: its media connection's transport has received `bytes` since it
   * opened, or since it was restarted, and goes through the relay now if `relayed`. A
   * total lower than the last, on the same connection, is ignored.
   */
  received(tab: string, bytes: number, relayed: boolean) {
    const last = this.sql
      .exec<TabRow>("SELECT total, relayed, restarted FROM usage_tab WHERE tab_id = ?", tab)
      .toArray()[0];
    const from = !last || last.restarted === 1 ? 0 : last.total;
    if (bytes < from) return;
    this.charge(((bytes - from) * (100 + SAFETY_MARGIN_PERCENT)) / 100 * relayFactor(relayed));

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO usage_tab (tab_id, total, reported_at, relayed, restarted) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (tab_id) DO UPDATE SET total = excluded.total, reported_at = excluded.reported_at,
         relayed = excluded.relayed, restarted = excluded.restarted`,
      tab,
      bytes,
      now,
      relayed ? 1 : 0,
      0,
    );
    // This total covers everything the tab received until now: watches that ended since
    // the last report need no charge of their own, and those still going start again
    // here, from the tab's `reported_at` (see `chargeGaps`). Not writing each watch's
    // `since` saves a row per watch on every report.
    this.sql.exec("DELETE FROM usage_watch WHERE tab_id = ? AND ended_at IS NOT NULL", tab);
  }

  /**
   * The instance made `tab` a new media connection, or restarted its old one: the tab's
   * next total counts from zero. (The `restarted` column holds this; the name is older.)
   */
  newTotal(tab: string) {
    // An instance started on an older schema than this code's has no totals to reset.
    if (!this.counting()) return;
    this.sql.exec("UPDATE usage_tab SET restarted = 1 WHERE tab_id = ?", tab);
  }

  /** `tab` began watching a share sent at up to `maxBitrate` bits per second: the watch `watch`. */
  watching(watch: string, tab: string, maxBitrate: number) {
    const relayed = this.sql.exec<{ relayed: number }>("SELECT relayed FROM usage_tab WHERE tab_id = ?", tab).toArray()[0];
    this.sql.exec(
      "INSERT OR IGNORE INTO usage_watch (watch_id, tab_id, max_bitrate, since, relayed) VALUES (?, ?, ?, ?, ?)",
      watch,
      tab,
      maxBitrate,
      Date.now(),
      relayed?.relayed ?? 0,
    );
  }

  /**
   * The instance recorded the watch `watch` as ended. If its tab can still report
   * (`tabReports`), its next report covers the watch; otherwise the gap is charged now.
   */
  watchEnded(watch: string, tabReports: boolean) {
    this.sql.exec("UPDATE usage_watch SET ended_at = ? WHERE watch_id = ? AND ended_at IS NULL", Date.now(), watch);
    if (!tabReports) this.chargeGaps("WHERE w.watch_id = ? AND w.ended_at IS NOT NULL", watch);
  }

  /**
   * `tab` is gone, and will report no more: each watch of its that ended since its last
   * report is charged. A watch still recorded (its close failing) is charged when it ends.
   */
  tabGone(tab: string) {
    this.chargeGaps("WHERE w.tab_id = ? AND w.ended_at IS NOT NULL", tab);
    // A watch still recorded keeps the tab's last report as its own, since that goes with the tab.
    this.sql.exec(
      `UPDATE usage_watch SET since = MAX(since, t.reported_at), relayed = t.relayed
       FROM usage_tab AS t WHERE usage_watch.tab_id = ? AND t.tab_id = usage_watch.tab_id`,
      tab,
    );
    this.sql.exec("DELETE FROM usage_tab WHERE tab_id = ?", tab);
  }

  /** The month's usage as the owner page shows it. */
  answer(): UsageAnswer {
    const now = Date.now();
    const resetDay = this.resetDay();
    const { since, until } = month(now, resetDay);
    const used = this.used(since, until);
    // At the same daily rate as the month so far; the first day counts as a whole day, so
    // the first hours of a month do not project a wild figure.
    const projected = (used / Math.max(now - since, DAY_MS)) * (until - since);
    return {
      used: Math.round(used),
      budget: this.budget(),
      projected: Math.round(Math.max(projected, used)),
      resetDay,
      since,
      until,
    };
  }

  /** Sets the day of the month usage resets on: a whole number from 1 to 31. False, and nothing changed, otherwise. */
  setResetDay(day: unknown): boolean {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) return false;
    this.setSetting(RESET_DAY_SETTING, day);
    return true;
  }

  /**
   * Sets the usage budget to `gigabytes` GB a month: a whole number from 1, with no upper
   * limit. False, and nothing changed, otherwise.
   */
  setBudget(gigabytes: unknown): boolean {
    if (typeof gigabytes !== "number" || !Number.isSafeInteger(gigabytes) || gigabytes < 1) return false;
    this.setSetting(BUDGET_SETTING, gigabytes);
    return true;
  }

  /** The usage budget, in bytes. */
  budget(): number {
    return (this.setting(BUDGET_SETTING) ?? DEFAULT_BUDGET_GIGABYTES) * GIGABYTE;
  }

  /**
   * How far this month has gone into the usage budget: past 80% (the owner's warning),
   * past 95% (everyone's), "used up" at the budget itself, or null below 80%.
   */
  level(): BudgetLevel | null {
    // An instance started on an older schema than this code's, as the migration tests do,
    // has no usage to hold against a budget.
    if (!this.counting()) return null;
    const { since, until } = month(Date.now(), this.resetDay());
    const share = this.used(since, until) / this.budget();
    return share >= 1 ? "used up" : share >= 0.95 ? "95%" : share >= 0.8 ? "80%" : null;
  }

  /** When this month ends and usage starts again from nothing. */
  resetsAt(): number {
    return month(Date.now(), this.resetDay()).until;
  }

  /** Whether the storage holds the usage count's tables. */
  private counting(): boolean {
    return this.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'setting'").toArray().length > 0;
  }

  /** The usage charged from `since` until `until`, in bytes. */
  private used(since: number, until: number): number {
    return (
      this.sql
        .exec<{ used: number | null }>("SELECT SUM(bytes) AS used FROM usage_day WHERE day >= ? AND day < ?", since, until)
        .one().used ?? 0
    );
  }

  private resetDay(): number {
    return this.setting(RESET_DAY_SETTING) ?? DEFAULT_RESET_DAY;
  }

  private setting(name: string): number | null {
    return this.sql.exec<{ value: number }>("SELECT value FROM setting WHERE name = ?", name).toArray()[0]?.value ?? null;
  }

  private setSetting(name: string, value: number) {
    this.sql.exec(
      "INSERT INTO setting (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
      name,
      value,
    );
  }

  /**
   * Charges each watch `where` takes in (as `w`) at its maximum bitrate over its gap, and
   * forgets it. The gap starts at the tab's last report, or the watch's start if later,
   * and is charged as relayed when that report was.
   */
  private chargeGaps(where: string, ...bindings: SqlStorageValue[]) {
    const gaps = this.sql
      .exec<WatchRow>(
        `SELECT w.watch_id, w.max_bitrate, MAX(w.since, COALESCE(t.reported_at, w.since)) AS since,
           COALESCE(t.relayed, w.relayed) AS relayed, w.ended_at
         FROM usage_watch AS w LEFT JOIN usage_tab AS t ON t.tab_id = w.tab_id ${where}`,
        ...bindings,
      )
      .toArray();
    for (const gap of gaps) {
      const seconds = Math.max(0, (gap.ended_at ?? gap.since) - gap.since) / 1000;
      const bytes = (gap.max_bitrate / 8) * seconds * relayFactor(gap.relayed === 1);
      log.info("usage.gap-charged", { watch: gap.watch_id, seconds, bytes: Math.round(bytes), relayed: gap.relayed === 1 });
      this.charge(bytes);
      this.sql.exec("DELETE FROM usage_watch WHERE watch_id = ?", gap.watch_id);
    }
  }

  /** Adds `bytes` to today's usage. */
  private charge(bytes: number) {
    if (!(bytes > 0)) return;
    const day = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    this.sql.exec(
      "INSERT INTO usage_day (day, bytes) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET bytes = bytes + excluded.bytes",
      day,
      bytes,
    );
  }
}

function relayFactor(relayed: boolean): number {
  return relayed && RELAYED_COUNTS_TWICE ? 2 : 1;
}

/**
 * The month `now` falls in, for usage that resets on `resetDay`: from that day's midnight
 * UTC to the same day of the next month. A month shorter than `resetDay` resets on its
 * last day.
 */
export function month(now: number, resetDay: number): { since: number; until: number } {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const index = date.getUTCMonth();
  const startsIn = resetIn(year, index, resetDay) <= now ? index : index - 1;
  return { since: resetIn(year, startsIn, resetDay), until: resetIn(year, startsIn + 1, resetDay) };
}

/** Midnight UTC on `day` of the month `index` of `year` (an index past either end runs into the next year), or on its last day. */
function resetIn(year: number, index: number, day: number): number {
  const last = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return Date.UTC(year, index, Math.min(day, last));
}
