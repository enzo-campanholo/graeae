# 49: Rows written within the free plan's day

**What to build:** An evening of use writes a small share of the free plan's 100,000 SQLite rows a day, not most of it.

**Why:** the research in [free-plan Durable Object limits](../../../docs/research/free-plan-durable-object-limits.md) (owner's verification, 2026-11-20) found that rows written is the only free-plan daily limit an evening can reach. Each byte report (`Usage.received`, `src/instance/usage.ts`) writes 3 to 4 rows, every tab sends one every 5 seconds (`USAGE_REPORT_EVERY_MS`, `src/shared/socket/usage.ts`), and the alarm is set again about every 5 seconds while tabs are open (one row per `setAlarm`, `src/instance/instance.ts`). Five friends for 5 hours write about 58,000 to 76,000 rows; a longer evening or 7 to 9 tabs runs out. Past the allowance every write fails until 00:00 UTC: byte reports, joins, invites, share and watch records, and the alarm that grace periods depend on.

Spec: [Usage budget](../spec.md) and the platform's free-plan promise. This blocks the 0.1 release.

**Status:** ready-for-agent

- [ ] Byte reports write far fewer rows. A report carries the tab's running total, so reporting less often loses nothing a report covers; the candidates are a longer `USAGE_REPORT_EVERY_MS` (for example 60 s), holding totals in memory and writing them less often, or both. Weigh what each loses when a tab vanishes or the object restarts (the watch ceiling in `usage_watch` already charges a vanished tab's watches), and how late the owner's meter and the budget's warnings and stop may then react
- [ ] The alarm is set only when its time changes, or its schedule is otherwise made to write rarely, with grace periods and the "reconnecting" marks keeping their timings
- [ ] A test pins the rows written per minute for a steady room (several tabs watching), read from the instance's own counting (`ctx.storage.sql` cursors' `rowsWritten` or `databaseSize`-style figures) only in `test/harness.test.ts` style if the harness cannot see it over HTTP; otherwise pin the observable behaviour the change relies on
- [ ] The research's evening (5 tabs, 5 hours) and a big one (10 tabs, 8 hours) come out, by the same arithmetic, under 20% of 100,000. Write the figures in this ticket's comments
- [ ] README's Limits section mentions the daily row allowance only if a real evening can still come near it
- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass

## Comments
