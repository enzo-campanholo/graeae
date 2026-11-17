// The usage count (spec, Usage and the usage budget): the media members have watched this
// month, in bytes, counted from what their tabs report and from the instance's own
// records where a tab falls silent. Enforcement runs on this count alone; Cloudflare's
// own figure is not read.
//
// The rules, each applied as a charge is made:
// - Each tab with a media connection reports the running total its transport has received
//   since it opened. The difference from the tab's last report is charged, so the first
//   report is charged in full and a lost report is made up by the next. A final total,
//   sent before a connection restart, makes the next total count from zero; so does a
//   total lower than the last, a restart whose final total was lost.
// - Every reported byte has a fixed 5% added (`SAFETY_MARGIN_PERCENT`), so the count never reads
//   below Cloudflare's own figure.
// - Relayed watching is counted twice (`RELAYED_COUNTS_TWICE`): what a tab reports while
//   its connection is on the relay, and any charge for a gap after such a report.
// - Where no later total arrives, each share the tab watched is charged at its maximum
//   bitrate from the tab's last report (or the watch's start, if later) until the instance
//   recorded the watch as ended. A watch that ends while its tab can still report waits:
//   the tab's next report covers it, and only if the tab goes without one is it charged.
// - A sharer's upload is never reported, so never counted: a tab reports what it received.
//
// Each charge goes to the UTC day it is made on. The month runs from the owner's reset
// day, at midnight UTC, to the same day of the next month, and sums the days between.

import { GIGABYTE, type UsageAnswer } from "../shared/api.ts";

/** The share of every reported byte added on top, in percent. A constant, not a setting. */
export const SAFETY_MARGIN_PERCENT = 5;

/** Whether relayed watching is counted twice. The one place to switch the doubling off. */
export const RELAYED_COUNTS_TWICE = true;

/** The usage budget: 1,000 GB, Cloudflare's monthly allowance. Ticket 24 makes it the owner's to set. */
export const USAGE_BUDGET_BYTES = 1_000 * GIGABYTE;

/** The day of the month usage resets on until the owner sets another. */
export const DEFAULT_RESET_DAY = 1;

const DAY_MS = 86_400_000;
const RESET_DAY_SETTING = "reset_day";

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
   * opened, and goes through the relay now if `relayed`. A `final` total is that
   * connection's last; the tab's next total counts from zero.
   */
  received(tab: string, bytes: number, relayed: boolean, final: boolean) {
    const last = this.sql
      .exec<TabRow>("SELECT total, relayed, restarted FROM usage_tab WHERE tab_id = ?", tab)
      .toArray()[0];
    const from = !last || last.restarted === 1 || bytes < last.total ? 0 : last.total;
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
      final ? 1 : 0,
    );
    // This total covers everything the tab received until now: watches that ended since
    // the last report need no charge of their own, and those still going start again here.
    this.sql.exec("DELETE FROM usage_watch WHERE tab_id = ? AND ended_at IS NOT NULL", tab);
    this.sql.exec("UPDATE usage_watch SET since = ?, relayed = ? WHERE tab_id = ?", now, relayed ? 1 : 0, tab);
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
    if (!tabReports) this.chargeGaps("WHERE watch_id = ? AND ended_at IS NOT NULL", watch);
  }

  /**
   * `tab` is gone, and will report no more: each watch of its that ended since its last
   * report is charged. A watch still recorded (its close failing) is charged when it ends.
   */
  tabGone(tab: string) {
    this.chargeGaps("WHERE tab_id = ? AND ended_at IS NOT NULL", tab);
    this.sql.exec("DELETE FROM usage_tab WHERE tab_id = ?", tab);
  }

  /** The month's usage as the owner page shows it. */
  answer(): UsageAnswer {
    const now = Date.now();
    const resetDay = this.resetDay();
    const { since, until } = month(now, resetDay);
    const used =
      this.sql
        .exec<{ used: number | null }>("SELECT SUM(bytes) AS used FROM usage_day WHERE day >= ? AND day < ?", since, until)
        .one().used ?? 0;
    // At the same daily rate as the month so far; the first day counts as a whole day, so
    // the first hours of a month do not project a wild figure.
    const projected = (used / Math.max(now - since, DAY_MS)) * (until - since);
    return {
      used: Math.round(used),
      budget: USAGE_BUDGET_BYTES,
      projected: Math.round(Math.max(projected, used)),
      resetDay,
      since,
      until,
    };
  }

  /** Sets the day of the month usage resets on: a whole number from 1 to 31. False, and nothing changed, otherwise. */
  setResetDay(day: unknown): boolean {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) return false;
    this.sql.exec(
      "INSERT INTO setting (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
      RESET_DAY_SETTING,
      day,
    );
    return true;
  }

  private resetDay(): number {
    const row = this.sql.exec<{ value: number }>("SELECT value FROM setting WHERE name = ?", RESET_DAY_SETTING).toArray()[0];
    return row?.value ?? DEFAULT_RESET_DAY;
  }

  /** Charges each watch `where` takes in at its maximum bitrate over its gap, and forgets it. */
  private chargeGaps(where: string, ...bindings: SqlStorageValue[]) {
    const gaps = this.sql
      .exec<WatchRow>(`SELECT watch_id, max_bitrate, since, relayed, ended_at FROM usage_watch ${where}`, ...bindings)
      .toArray();
    for (const gap of gaps) {
      const seconds = Math.max(0, (gap.ended_at ?? gap.since) - gap.since) / 1000;
      this.charge(((gap.max_bitrate / 8) * seconds) * relayFactor(gap.relayed === 1));
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
