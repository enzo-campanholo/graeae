# 49: Rows written within the free plan's day

**What to build:** An evening of use writes a small share of the free plan's 100,000 SQLite rows a day, not most of it.

**Why:** the research in [free-plan Durable Object limits](../../../docs/research/free-plan-durable-object-limits.md) (owner's verification, 2026-11-20) found that rows written is the only free-plan daily limit an evening can reach. Each byte report (`Usage.received`, `src/instance/usage.ts`) writes 3 to 4 rows, every tab sends one every 5 seconds (`USAGE_REPORT_EVERY_MS`, `src/shared/socket/usage.ts`), and the alarm is set again about every 5 seconds while tabs are open (one row per `setAlarm`, `src/instance/instance.ts`). Five friends for 5 hours write about 58,000 to 76,000 rows; a longer evening or 7 to 9 tabs runs out. Past the allowance every write fails until 00:00 UTC: byte reports, joins, invites, share and watch records, and the alarm that grace periods depend on.

Spec: [Usage budget](../spec.md) and the platform's free-plan promise. This blocks the 0.1 release.

**Status:** resolved

- [x] Byte reports write far fewer rows. A report carries the tab's running total, so reporting less often loses nothing a report covers; the candidates are a longer `USAGE_REPORT_EVERY_MS` (for example 60 s), holding totals in memory and writing them less often, or both. Weigh what each loses when a tab vanishes or the object restarts (the watch ceiling in `usage_watch` already charges a vanished tab's watches), and how late the owner's meter and the budget's warnings and stop may then react
- [x] The alarm is set only when its time changes, or its schedule is otherwise made to write rarely, with grace periods and the "reconnecting" marks keeping their timings
- [x] A test pins the rows written per minute for a steady room (several tabs watching), read from the instance's own counting (`ctx.storage.sql` cursors' `rowsWritten` or `databaseSize`-style figures) only in `test/harness.test.ts` style if the harness cannot see it over HTTP; otherwise pin the observable behaviour the change relies on
- [x] The research's evening (5 tabs, 5 hours) and a big one (10 tabs, 8 hours) come out, by the same arithmetic, under 20% of 100,000. Write the figures in this ticket's comments
- [x] README's Limits section mentions the daily row allowance only if a real evening can still come near it
- [x] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass

## Comments

### 2026-11-20: built

**Design** (recorded in [ADR 0004](../../../docs/adr/0004-rows-written-within-the-free-day.md)):

- **A tab reports once a minute** (`USAGE_REPORT_EVERY_MS` 5 s → 60 s). A report carries the running total, so nothing a report covers is lost, and an instance restart loses nothing either: the tab's last total and the day's count are written together, so the next report charges whatever the restart lost. Holding totals in memory and writing every minute was rejected: the same rows, but it keeps 12 times the requests and the `ws.in`/`ws.out` log lines, and adds state to reason about across a restart. What the longer interval costs: the meter, the 80% and 95% warnings and the stop react up to a minute late (at four 12 Mbps shares each watched by three, about 1 GB of overshoot at the stop, 0.1% of 1,000 GB). A tab that vanishes without a final total has its watches charged at maximum bitrate for up to a minute since its last report, not 5 s. That is the safe side.
- **A report writes 2 rows, not 3 to 4.** A report no longer rewrites `since` on each of the tab's watches: a gap is charged from the tab's `usage_tab.reported_at`, or the watch's start if later, with the tab's `relayed`. When a tab goes while a watch is still recorded (its close failing), that watch takes the tab's last report before the tab's row is deleted. The schema is unchanged, so there is no migration. A watch row written by the old code has a `since` no earlier than its start, and `MAX` with `reported_at` gives the same gap.
- **The alarm is set only when its time changes** (the instance keeps the time it last set). For an open tab it comes for the grace period's end, so about every 25 to 30 s while tabs beat, not every 5 s. A tab's 10-second silence is not scheduled ahead: when any tab's heartbeat finds an open room tab unheard for more than 6 s and not yet marked silent, `schedule()` brings the alarm forward to that tab's 10-second moment. Every tab beats, so where anyone could see a mark it still comes at 10 s, and the grace period still ends at 30 s. If a whole room falls silent at once, nobody is left to see the mark: it comes when the alarm next runs, at the latest at the grace period's end, and a tab that opens meanwhile gets it with its room (`open` already marks first). Lost tabs keep their fixed moments as before.

**Rows, by the research's arithmetic.** Each report writes 2 rows (the `usage_day` upsert and the `usage_tab` upsert; the delete of ended watches writes 0 in steady state). The alarm is set about 2.4 times a minute for the whole instance.

- The research's evening, 5 tabs for 5 hours: 5 × 300 min × 2 = 3,000 + 300 × 2.4 = 720, **about 3,700 rows, 3.7% of 100,000** (was 58,000 to 76,000). Joining, sharing, watching and invites add tens to hundreds.
- A big one, 10 tabs for 8 hours: 10 × 480 × 2 = 9,600 + 480 × 2.4 = 1,150, **about 10,750 rows, 11%**.
- Measured in the test's steady room (4 tabs, 2 webcams, everyone watching every share but their own, 10 minutes): 80 rows from reports and 24 alarms set, **2.6 rows a tab a minute** (48 before the change).

**README.** Its Limits section does not mention the row allowance, since a real evening no longer comes near it. Its usage-budget line now says that reports come once a minute, so the count, its warnings and the stop run up to a minute behind. The spec's "What is counted" now says once a minute, and its "left to the build" item names the interval and ADR 0004.

**Tests.** `test/harness.test.ts` checks that a steady room writes at most 4 rows a tab a minute (20% of 100,000 over 10 tabs and 480 minutes is 4.17). It counts the rows each SQL cursor wrote, key-value puts and deletes, and alarms set. Alarm deletes are left out, because the harness deletes each alarm before it runs it. By the arithmetic, each of the three changes is needed to pass: about 5 without the alarm change, and 4.1 with the per-watch update. `test/usage.test.ts` adds two tests: a gap counts from the latest report, and a watch whose close failed when its tab left is charged from the tab's last report (removing the copy in `tabGone` fails it). `test/grace.test.ts` checks that the mark comes at 10 s when the other tab's heartbeats fall on either side of that moment. The three journeys that wait on a report (`usage`, `relay`, `budget`) and the capture journeys set the fake media client's new `reportEvery` to 5 s. A real tab reports at `USAGE_REPORT_EVERY_MS` through `MediaClient.reportEvery`.

**Checks.** `pnpm typecheck` and `pnpm lint` pass. All 450 tests pass in the Workers runtime, and all 60 journeys pass (`vite build --mode fake-media && vitest run`, then `playwright test --workers=1`). Nothing was deployed.
