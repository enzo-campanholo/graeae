# Free-plan Durable Object limits, and an evening of graeae

Researched 2026-11-20 against Cloudflare's docs, the workers-sdk source (main at
`2ace09be`, 2026-11-20) and the wrangler the repo installs (4.162.0). Figures from
graeae's code are from branch `v1-build` at `5ac02f2`.

The fair evening used throughout: five friends, one room tab each, all sharing or
watching (so all five tabs hold a media connection), for 5 hours. Every tab beats every
5 s (`HEARTBEAT_EVERY_MS`, `src/shared/socket/heartbeat.ts`) and sends a byte report every
5 s once its media connection is made (`USAGE_REPORT_EVERY_MS`,
`src/shared/socket/usage.ts`; `src/app/lib/usage-reports.ts`), and sends its log batches
every 5 s (`POST_EVERY_MS`, `src/app/lib/log.ts`).

## Summary

| Free-plan daily allowance (per account, resets 00:00 UTC) | An evening of graeae | Share |
|---|---|---|
| Duration, 13,000 GB-s | at most 2,250 GB-s (5 h awake); 10,800 GB-s even awake 24 h | ≤17%; ≤83% for a whole day |
| Requests, 100,000 | about 3,000 to 6,000 if the 20:1 WebSocket ratio applies; about 58,000 if it does not | 3–6%, or 58% |
| **SQLite rows written, 100,000** | **about 58,000 to 76,000** | **58–76%** |
| SQLite rows read, 5,000,000 | about 1.8 million | about 35% |

Duration cannot run out for one object. **Rows written is the limit an evening can
reach**, and it is driven almost entirely by the byte reports.

## 1. Durable Object duration

### The allowance and how it is billed

- The Workers Free plan includes **13,000 GB-s of Durable Object duration per day**,
  100,000 requests per day, 5 million SQLite rows read per day, 100,000 rows written per
  day, and 5 GB stored in total.
  ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/))
- "Duration billing charges for the 128 MB of memory your Durable Object is allocated,
  regardless of actual usage"; objects that share an isolate are each still billed 128 MB.
  ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/))
- Duration is billed for wall-clock time while the object is actively running, or idle in
  memory but **not** eligible for hibernation. Objects "idle and eligible for hibernation
  are not billed for duration, even before the runtime has hibernated them". Concurrent
  requests on one object share the same duration. Calling `accept()` on a WebSocket bills
  duration for the whole time it is connected; the Hibernation API stops the charge once
  the handlers finish. Auto-response messages incur no wall-clock time.
  ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/))
- An object is eligible for hibernation when no `setTimeout`/`setInterval` callback is
  set, no I/O or `ctx.waitUntil()` promise is unfinished and no outbound connection is
  open, no standard-API WebSocket is used, and no request or event is still being
  processed. It hibernates after about 10 s of inactivity in that state; an object that is
  not eligible is evicted after 70 to 140 s with no requests or events. Pending
  operations count for up to 15 minutes each.
  ([DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/))

### What that means for graeae

- graeae accepts every socket with `ctx.acceptWebSocket` (the Hibernation API,
  `src/instance/signaling.ts:176,194`) and sets no timers in the instance (`setTimeout`
  appears only in the fake media server, `src/instance/media/fake.ts`). So between
  messages the object is idle and eligible for hibernation, and by the pricing page's
  wording **not billed**, even though a 5-second heartbeat means it never actually
  hibernates (it would need 10 s of quiet). Answering the heartbeat itself rather than with
  `setWebSocketAutoResponse` costs only the handler's own run time per beat; it does not
  make the gaps billable. Billed time is the handlers' wall time, plus any
  `ctx.waitUntil` work after an answer (`src/instance/instance.ts:676`) and awaits on the
  media server.
- That is a refinement. The bound that settles the question needs none of it: one object
  billed at 0.125 GB for every second of a day is
  **86,400 s × 0.125 GB = 10,800 GB-s, 83% of 13,000**. One object cannot exceed the
  allowance whatever its message rate, heartbeat or byte reports, because duration is
  wall-clock time and a day has only 86,400 seconds. A 5-hour evening awake throughout is
  18,000 s × 0.125 GB = 2,250 GB-s, 17%.
- **This settles the spec's check** "The Durable Object stays under the free plan's daily
  duration quota across a real evening" (`.scratch/v1-build/spec.md:473`) without a
  measured evening, for an account holding one graeae instance and no other Durable
  Objects.
- The limits that remain: the allowance is per account. Two objects awake all day
  (21,600 GB-s) exceed it, so a second instance deployed with `--name` (wrangler.jsonc's
  first comment) or another Durable Object project on the same account shares the 13,000.
  Two instances both busy for 5 hours (4,500 GB-s) are still fine.

### The spec's 42% estimate

ADR 0002 and `.scratch/v1/issues/04-app-hosting-on-free-tiers.md` say one object stays
under 42% of the quota during sessions and uses 83% awake for 24 hours, and that both
"rest on assumed message rates". The 83% is right (10,800 / 13,000). 42% is 12 hours
awake (5,400 / 13,000 = 41.5%), so it is right for sessions up to 12 hours a day. Neither
depends on message rates: both are upper bounds from wall-clock time alone, and the
heartbeat and byte reports, which came later, cannot raise them. The spec's note that the
42% "predates both" is true but does not matter.

### When an allowance is exceeded

"If you exceed any one of the free tier limits, further operations of that type will fail
with an error", and "Daily free limits reset at 00:00 UTC."
([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)) The
docs do not say what error a request sees when duration runs out; it is moot for one
object.

## Other free-plan daily limits an evening could hit

### Rows written: 100,000 per day (the real risk)

What counts: rows written by `INSERT`, `UPDATE` and `DELETE`; the key-value API on a
SQLite object is billed as rows read and written; "Each `setAlarm()` counts as one row
written", and deletes count as rows written.
([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/))

What graeae writes, from the code:

- **Each byte report** (`usage.received`, `src/instance/usage.ts:82-105`) upserts
  `usage_day`, upserts `usage_tab`, deletes the tab's ended `usage_watch` rows and updates
  `since` on each of the tab's current watches. Measured locally (wrangler 4.162.0's
  `wrangler dev`, workerd 1.20261113, the real migrations, each statement's
  `cursor.rowsWritten`): in steady state `usage_day` 1, `usage_tab` 1, the delete 0, the
  update 1 per watch. So **3 rows for a tab watching one share, 4 for two.** Not every
  report lands with bytes > 0, but the sharer's tab also receives a little, so 3 is a fair
  average.
- **Each heartbeat** writes nothing to storage: it updates the socket's attachment
  (`serializeAttachment`) and only writes the "reconnecting" marks when one changes
  (`src/instance/signaling.ts:330-337`).
- **The alarm.** `schedule()` sets the alarm for each tab's `heardAt + 10 s`
  (`nextMoment`, `src/instance/signaling.ts:566-575`), and a heartbeat does not move it,
  so the alarm fires about every 5 to 6 s while tabs are open, and each run ends by calling
  `setAlarm` again (`src/instance/instance.ts:180,712`): one row each, about 3,000 to
  3,600 in 5 hours.
- Joining, sharing, watching, invites and device visits write tens to hundreds of rows in
  an evening.

An evening: 5 tabs × 720 reports an hour × 5 h = 18,000 reports × 3 to 4 rows = 54,000
to 72,000, plus about 3,600 for the alarm: **about 58,000 to 76,000 rows written, 58% to
76% of the day's 100,000.** Under the same use it runs out after about 6.5 to 8.5 hours,
or in 5 hours with about 7 to 9 media tabs (friends with a second tab, or more friends).
The allowance is per account and per UTC day, so an evening that straddles 00:00 UTC
splits across two days.

Past the allowance, writes "fail with an error" until 00:00 UTC. In graeae every write
then throws: byte reports, joins, invites, share and watch records, and `setAlarm`, which
the grace periods and the silence marks depend on. The docs do not say whether the
failure also resets the object; that is unverified.

The byte reports are almost all of it. Writing the count less often (holding totals in
memory and writing every minute or so, as a restart already loses at most one interval),
or reporting less often, would bring an evening down to a few thousand rows.

### Rows read: 5,000,000 per day

Measured the same way: `counting()` reads all 37 rows of `sqlite_master` on the full
schema, and it runs inside `level()` on every byte report and every alarm through
`checkBudget()` (`src/instance/instance.ts:629`, `src/instance/usage.ts:193-210`), next to
two setting reads and `used()`, which reads up to a month of `usage_day` rows (up to 31).
So about 80 rows read per report or alarm late in the month. An evening: (18,000 reports
+ 3,600 alarms) × about 80, plus 2 key-value reads per heartbeat (36,000): **about 1.8
million, 35%.** Not a risk at five friends; `counting()` is the biggest single cost and
could be checked once at start.

### Requests: 100,000 per day

Requests include "HTTP requests, RPC sessions, WebSocket messages, and alarm
invocations"; "a 20:1 ratio is applied to incoming WebSocket messages", which is
"billing-only", and incoming protocol pings and outgoing messages are free.
([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)) The
docs do not say whether the 20:1 ratio also applies to the free plan's 100,000 a day; the
row spans both plans, which suggests it does, but that is an inference.

An evening's incoming messages: per tab 720 heartbeats + 720 byte reports + up to 720 log
batches an hour, so 5 tabs × 5 h × 2,160 = up to 54,000, plus about 3,600 alarms and a few
hundred HTTP requests. **About 3,000 to 6,000 requests with the ratio, about 58,000
without.** Comfortable either way at five friends; without the ratio it would join rows
written as a limit for longer evenings.

The Worker in front has its own Workers Free limit of 100,000 requests a day (Error 1027
past it); only HTTP requests and socket openings pass through it.
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))

### Workers Logs: 200,000 events per day

Not a Durable Object limit, but every byte report becomes an instance `ws.in` line and a
tab `ws.out` line (`src/shared/log.ts` header), so an evening is at least 36,000 lines
from the reports alone, plus everything else the tabs log. The free plan keeps 200,000
events a day for 3 days; the page does not say what happens past it on the free plan.
([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/))
Worth a look at a real evening's count; CLAUDE.md already notes lines are dropped past the
allowance.

## 2. Which CPU limit applies to a free-plan Durable Object

- The Durable Objects limits table gives SQLite-backed objects "30 seconds (default) /
  configurable to 5 minutes of active CPU time" per request, with no separate free-plan
  figure. "Each incoming HTTP request or WebSocket message resets the remaining available
  CPU time to 30 seconds." The FAQ: "the maximum CPU time per Durable Objects invocation
  (HTTP request, WebSocket message, or Alarm) is set to 30 seconds", raised with
  `limits.cpu_ms`.
  ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/))
- The same FAQ also says "Durable Objects are Worker scripts, and have the same per
  invocation CPU limits as any Workers do", linking to the Workers plan limits, where Free
  is 10 ms per HTTP request.
  ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) The
  primary sources contradict each other, and the free-tier changelog gives no CPU figure
  ([changelog, 2025-04-07](https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/)).
- A secondary source resolves it: a third-party probe on a Free account on 2026-11-19 found
  a Durable Object request ran to about 25 s of CPU and was killed at about 35 s, matching
  30 s, not 10 ms. The caller got a 502 "Durable Object exceeded its CPU time limit and was
  reset", the object was reset and its WebSocket clients dropped with code 1006.
  ([logseq-cloudflare-selfhost PR #55](https://github.com/C0ntr0lledCha0s/logseq-cloudflare-selfhost/pull/55);
  one person's measurement, not Cloudflare's statement.)
- **Answer:** 30 s of CPU per invocation (each HTTP request, each WebSocket message and
  each alarm gets its own budget), by the limits table and one measurement; 10 ms by one
  ambiguous FAQ sentence. CPU excludes time waiting on network, storage and other I/O.
  Past the limit "there is a heightened chance that the individual Durable Object is
  evicted and reset"
  ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)), which
  loses in-memory state and drops every socket; graeae's restart path (grace periods
  restored from storage) is what then runs.

**graeae's heaviest paths**, all working on tens of rows and a handful of sockets:

- Startup (`src/instance/instance.ts:113-124`): `applyMigrations` runs at most 7 small DDL
  files once, then reads `_migrations`; `restored()` reads a few key-value entries and the
  socket list. The sweep after a restart (`afterRestart`) is mostly awaits on the media
  server, which is I/O and does not count.
- The alarm (`alarmed`, `src/instance/instance.ts:698-713`): loops over the open sockets
  and a few key-value entries, then `checkBudget()` (the ~80-row reads above).
- A byte report: about 8 statements plus `checkBudget()`.
- A log batch: parsing and writing at most `MAX_BATCH_EVENTS` lines, each cleaned to
  bounded depth and size (`src/shared/log.ts`).
- A tab connecting: building the room's full state as JSON.

None plausibly nears 30 s; each is likely well under a millisecond to a few milliseconds
of CPU, which would also fit a 10 ms limit, though that is an estimate, not a
measurement. The one to keep an eye on under a 10 ms reading would be the first start
after a deploy with several migrations to apply, which runs once.

## 3. Does `wrangler deploy` with no routes remove a dashboard Custom Domain?

**No, by the source.** In `triggersDeploy`
(`packages/deploy-helpers/src/triggers/deploy.ts`, workers-sdk main), routes are split
into `routesOnly` and `customDomainsOnly`, and:

- the routes call, `PUT …/workers/scripts/<name>/routes` ("Note: PUT will delete previous
  routes on this script", `publish-routes.ts:107-108`), runs only
  `if (routesOnly.length > 0)` (`deploy.ts:342`);
- the custom-domains call, `POST …/domains/changeset?replace_state=true`, which would
  replace the set of custom domains with the configured ones (`publish-routes.ts:285`),
  runs only `if (customDomainsOnly.length > 0)` (`deploy.ts:366`).

With no `route`/`routes` in the config and no `--routes` or `--domain` flag, `routes`
resolves to `[]` (`packages/wrangler/src/deployment-bundle/resolve-config-args.ts:47-50`),
so neither call is made and the attached domains are left alone. The installed wrangler
4.162.0 has the same two guards (`node_modules/wrangler/wrangler-dist/cli.js:167806,
167825`) and the same `replace_state=true` call (line 167032). `workers_dev: true` and
`preview_urls: false` only touch the workers.dev subdomain and preview settings
(`subdomainDeploy`). The "local configuration differs from the remote configuration"
warning runs only for a Worker last deployed from the dashboard, and then fetches remote
custom domains only when the config has some (`cli.js:183282-183293`).

The docs agree for routes: wrangler overrides dashboard routes "with the routes you have
set in your Wrangler configuration file", and to manage routes only in the dashboard,
remove any `route` and `routes` keys.
([Wrangler configuration, "Source of truth"](https://developers.cloudflare.com/workers/wrangler/configuration/))
The Custom Domains page does not say how a deploy treats domains added in the dashboard
([Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).

What would remove it: adding any `routes` entry with `custom_domain: true` (or passing
`--domain`) makes the deploy replace the Worker's custom domains with the listed ones, so a
domain attached in the dashboard but not listed would go. A plain route entry replaces the
Worker's routes, not its custom domains.

## What graeae-test's logs show

Pulled 2026-11-20 as CLAUDE.md's "Logs" describes, for the last 3 days, into
`.logs/graeae-test-1794926137065-1795184737065.jsonl`: 3,984 events, all from
2026-11-20 03:40 to 14:25 UTC (the account holds no Workers Logs events before 03:40 UTC
that day, so nothing earlier exists to pull). This is test use, not a real evening: one
tab held a socket from about 12:55 to 14:25 UTC through three deploy restarts, and a few
others came and went.

- **CPU per invocation cannot be measured from these logs.** No event carries
  `$workers.cpuTimeMs` or `$workers.wallTimeMs`: those come with invocation logs, which
  `wrangler.jsonc` turns off (`"invocation_logs": false`). The events are only the lines
  graeae writes. The instance's own `http` lines carry `ms` (p50 0, p99 68, max 128 over
  108 requests), but that is `Date.now()` around the handler, and in Workers the clock
  only advances on I/O, so it measures waiting on storage and the media server, not CPU.
  Measuring CPU needs invocation logs turned on for a while, or the GraphQL Analytics API
  (`cpuTime` on Durable Object invocations), which this token cannot read.
- **Awake time on a real day is not in the logs either.** No duration figure is logged,
  and the window holds no real evening. Question 1 rests on the wall-clock bound above,
  which needs no measurement.
- **The byte-report rate is confirmed.** The long-lived tab sent 1,139 byte reports from
  12:51 to 14:25 UTC, a mean gap of 4.96 s: 720 an hour per tab, as assumed above, so
  about 3,400 rows written from one tab in that hour and a half.
- **Log volume.** About 2,650 events an hour came from mostly that one tab (instance
  `ws.in` and tab `ws.out` for each report, and the tab's `stats` every 15 s), which puts
  five tabs for five hours near 66,000 events, a third of Workers Logs' 200,000 a day.

## Not verified

- Whether the 20:1 WebSocket ratio counts toward the free plan's 100,000 requests a day.
- Whether the rows counted locally by workerd match what Cloudflare bills. The counter is
  workerd's own, but the bill is not checked against it here.
- What a Durable Object does when a write fails past the rows-written allowance: whether
  only the write throws or the object is reset.
- The free-plan CPU limit, beyond the docs' 30 s table and one third-party measurement.
- graeae's actual CPU per invocation: graeae-test's logs hold no CPU figures (see above).
