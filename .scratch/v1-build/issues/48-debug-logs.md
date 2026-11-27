# 48: Nothing is recorded, so a test night's bad states are lost

**What to build:** After an evening where things go wrong, an agent can pull a record of what every tab and the instance did and work out what happened, for up to 3 days afterwards. The record covers both ends: the instance's side, and each browser's side, which the instance never sees.

Owner's note (2026-11-19, after testing on `graeae-test` with a friend): "We hit a ton of bad states and things not working, that was very useful data we did not keep. I know we cannot keep all data, but we should collect everything so that this can be used to debug later."

Blocked by: none

Status: resolved

## What is known

Checked on 2026-11-19:

- The code logs almost nothing. The only log line is one `console.error` in `src/instance/instance.ts`.
- Workers Logs is off for `graeae-test`: the Worker's `observability` setting is empty and Logpush is off. `wrangler.jsonc` has no `observability` key, so nothing from before this ticket is kept. `wrangler tail graeae-test` works but shows only live requests.
- `graeae-test` is the only Worker on the account. No `graeae` Worker exists.
- Workers Logs on the free plan keeps 3 days and takes 200,000 events a day. Past that, Cloudflare drops lines and never bills, which keeps the "never a surprise bill" promise.
- The wrangler login cannot read stored logs. The observability API answers `no_access_to_workers_observability`, and `wrangler login --scopes-list` offers no scope for it. Pulling logs needs an API token with Account → Workers Observability → Read, which the owner makes once in the dashboard.
- Every tab already wakes the Durable Object every 5 seconds with its heartbeat (`src/shared/socket/heartbeat.ts`, answered in code, not by auto-response). So log batches sent over a tab's socket add almost no Durable Object time (ADR 0002).

## Decisions

- **Where the logs live.** Only Workers Logs, for 3 days. No R2 (enabling it needs a payment method on the account), no rows in the Durable Object's SQLite (log lines would compete with the app for the free plan's daily row writes), no download script. When an evening goes wrong, the owner asks an agent to pull that window, and the agent saves it locally for the debugging work.
- **Both ends, one log.** The browser's events end up in Workers Logs next to the instance's, so one query shows a tab's view and the instance's view of the same moment.
- **Everything that matters, and no secrets.** Leave out only what is pure noise (each heartbeat and its answer) or must never be stored (below).

## What to build

### Turn it on

- `"observability": { "enabled": true }` in `wrangler.jsonc`, so every deploy keeps it on, including a second instance's (`--name`).
- Keep invocation logs on unless the daily budget below says otherwise. They give each request's status and timing for free.

### One line per event, one shape

- One JSON object per line, written with `console.log` (or `console.warn`/`console.error` for problems, so the level can be filtered on). Workers Logs indexes the fields of a JSON line, so every field can be queried.
- Shared fields on every line: `source` (`"instance"` or `"tab"`), `event` (a short fixed name such as `share.live` or `pc.state`), and whichever of `member`, `device`, `tab`, `room` apply. A line from a tab also carries the tab's own clock time and how long the page has been open, because a batch arrives late.
- Use the ids the instance already has, not display names, in these fields. One line when a tab connects maps its member id to its display name, so a reader can tell who is who.
- A small module builds every line, on each side, so the leave-out rules live in one place.

### The instance's side (Worker and Durable Object)

- Every HTTP request, its route and how it ended, including refusals and why the instance refused. The visitor still sees the one "nothing here" answer (spec 17), unchanged.
- Every socket opened, closed (with its close code), lost, taken back or timed out, and every grace period that starts, ends or runs out.
- Every message in and out of every socket, except heartbeats. A full `state` message is logged by size and areas, not in full.
- Every change of state: a member present or gone, "reconnecting" marks, a share live or ended, watching started or stopped, quality choices, faltering, retries, hand-overs, relay, cut-offs and the sweeps after them, usage counted and the budget reached, invites made and used, devices remembered and forgotten, members removed, migrations run and the restart recovery in `instance.ts`.
- Every media server and relay call (`src/instance/media/cloudflare.ts`): the operation, its media connection and track names, the status, each track's error code, and how long it took, including timeouts. Error bodies in full.
- Every exception, caught or not, with its stack.

### The tab's side

- Each tab keeps its events in memory and sends them in batches: every few seconds, at once for an error, and whatever is left on `pagehide` (`navigator.sendBeacon`).
- A tab with a signaling socket open (the room's or the list's) sends its batches over that socket as a new request area, `log`. The instance writes each event as a line, tagged from the socket's own member, device, tab and room, never from the tab's word.
- A page with no socket (setup, invite, owner, "You") posts its batches to `/api/log`. The instance writes them only for a remembered device, and answers every other visitor with the one "nothing here" answer. A page refused from the start sends nothing.
- While a socket is down, the tab keeps its events and sends them after it reconnects, so the lead-up to a dropped connection is not lost. Cap the buffer (for example 2,000 events, dropping the oldest and counting the drops) so a long outage cannot grow it without end.
- What a tab records:
  - Page changes and the router's choices.
  - Socket opened, closed (code and reason), given up on, reconnecting, and the heartbeat answers that are late or missing.
  - Every message in and out, except heartbeats. A full `state` by size and areas.
  - The peer connection: `connectionState`, `iceConnectionState`, `iceGatheringState` and `signalingState` changes, ICE restarts, offers and answers made, accepted or refused, and the candidate pair chosen (by candidate type and protocol, such as `relay`/`udp`).
  - Captures: asked for, granted, refused (with the error name), and tracks ended, muted or unmuted.
  - Every share and watch from the tab's side: asked for, confirmed, failed, and every gap shown to the member.
  - While sharing or watching, a `getStats` summary every 10 seconds for each track: bitrate, frames per second, resolution, packets lost, jitter, round trip, the quality layer received, and what limits the encoder (`qualityLimitationReason`). `src/app/lib/media/transport.ts` and `browser.ts` already read some of this.
  - `window.onerror`, `unhandledrejection` and every caught error, with its stack.
  - Once when the tab opens: the user agent, the screen size, and the app's build (a version or commit stamped in at build time), so a log can be matched to the code that ran.

### Never logged

- The setup secret, device cookies and their tokens, invite codes, the media server's application secret, the relay key and its credentials, `iceServers` (it holds relay credentials).
- SDP bodies and ICE candidates in full. They hold friends' IP addresses. Log what was offered or answered by its tracks and mids, and candidates by type and protocol.
- What is on anyone's screen or camera, which never reaches the instance anyway.

### The daily budget

200,000 events a day, invocation logs included. Estimate a 6-person, 5-hour evening once it is built: every heartbeat is still a Durable Object invocation and makes an invocation log (6 tabs at one every 5 seconds is about 22,000), plus the lines above. If the estimate goes past about half the budget, cut the `getStats` interval or turn invocation logs off before cutting events.

### Pulling the logs

- Add a short "Logs" section to `CLAUDE.md` for agents: what is recorded, the 3-day window, and how to pull one. The section covers asking the owner for the Workers Observability token with `request_secret`, never in chat. It shows the query that pulls a time window for `graeae-test` (or another `--name`) from the observability telemetry API, page by page. It says where to save the result: a gitignored folder (add it to `.gitignore`), because the logs hold friends' names.
- The README's deploying section says in one line that the instance keeps 3 days of logs in the owner's Cloudflare account.

## Testing

- Every test runs on the fakes. Logging must not make the test output unreadable. Silence the lines under the tests, or switch them off by a setting the tests pass.
- Seam 1: a `log` request over a room socket and a list socket is taken and changes nothing in any tab's view. `/api/log` from a stranger gets the "nothing here" answer, byte for byte the same as any refused address.
- The line builder, on both sides, leaves out every field on the never-logged list. Test it directly with a message that carries each one.
- Not automated: deploy to `graeae-test`, use it on two browsers for a few minutes (open a room, share, watch, close a tab, drop a network), then pull the window with a token. Check that both sides' lines are there, line up in time, and carry no secret or IP address.

## Open questions

- The exact field names and event names are left to the build. Keep them few and consistent, and list them in one place a reader of the logs can find, such as the logging module's header comment.

## Comments

**2026-11-20, built; the deployed check is left to the owner.** Everything in "What to build" is in. What remains is the "Not automated" step, which needs a deploy, two browsers and the owner's token, so the status is `ready-for-human`.

- **One builder.** `src/shared/log.ts` builds every line on both sides and holds every leave-out rule. Its header lists the events and fields. Secrets, cookies and tokens, invite codes (also inside addresses), `iceServers` and relay credentials are left out by field name. The instance also leaves out its own secrets by value. SDP is written by size and media sections, a candidate by type and protocol, and IP addresses are masked inside any text. `test/log.test.ts` checks all of this for both sides.
- **Instance.** `src/instance/log.ts` writes every line. The instance logs every request with its route, status, time and why it was refused, and every socket's life. It logs every message but heartbeats (a full state by size and areas), every state change, and every media server or relay call through `media/logged.ts`, with the full error body and track error codes. Exceptions are caught in `fetch`, the socket handlers, the alarm, background work and the Worker.
- **Tab.** `src/app/lib/log.ts` buffers up to 2,000 events, dropping the oldest and counting the drops. It sends a batch with each heartbeat and holds it until that heartbeat's answer confirms it, so a batch on a socket that died is sent again on the next one. A page with no socket posts to `/api/log`, and a beacon goes on `pagehide`. A page refused from the start sends nothing. `/api/log` from a stranger gets the same "nothing here" answer, byte for byte (`test/logs.test.ts`).
- **Budget.** Estimated at about 85,000 lines for 6 people over 5 hours. Staying under half the allowance took both of the ticket's cuts: `getStats` every 15 seconds instead of 10 (about 102,000 lines at 10), and invocation logs off in `wrangler.jsonc`, which saves about 65,000 more. The arithmetic is in the header of `src/shared/log.ts`.
- **Tests.** Lines are kept in memory under Seam 1 (`instance.logs()`). A fake-media build writes them all to standard output, so the journeys' output stays readable. Typecheck and lint pass; all 444 tests in the Workers runtime and all 60 journeys pass. Three checks in `test/browser/people.spec.ts` still expected ticket 47's old wording; they now match the app.

**What differs from the ticket.**

- Cloudflare's API reference lists only **Workers Observability Write** for the telemetry query endpoint, not Read, so CLAUDE.md asks the owner for Edit.
- From 1 December 2026 the free plan changes to 0.5 GB a day with 7 days of retention. CLAUDE.md says so; the README still says 3 days.

**Check first when pulling the window.**

1. Do the events' Workers metadata (`$workers`, `$metadata`) carry the request URL or headers? If so, `/invite/<code>` addresses, and possibly cookies, are stored outside the line builder's reach. This could not be checked without a deploy.
2. Both sides' lines should be there, line up by `at`, and carry no secret or IP address.
3. The query in CLAUDE.md (paging by `offset`, events at `result.events.events`) follows the API reference but has not been run.

### 2026-11-20: checked on `graeae-test` and closed

**Deployed** from `de98a3b` (version `9ea3f644`) with `pnpm run deploy --name graeae-test`, with `"observability": {"enabled": true, "logs": {"invocation_logs": false}}` and the secrets left as they were.

**Used as a stranger** (03:40 UTC): `/`, `/r/a-room`, `/setup`, `/a/b?x=1`, `/invite/<marker>` and `/api/invites/<marker>`, with a marker device cookie, and a `POST /api/log` with no cookie. Each got 404, and each was logged as an `http` line with `refused` and why.

**Used as a member** (12:51 to 12:53 UTC), in headless Chromium with a fake camera: the throwaway "Log check" member joined from an owner's invite, shared the webcam, and made a second device with "Add a device", which joined too. Then the first device sat for 45 seconds, went offline for 15 seconds and came back, and both tabs were closed. The script recorded every secret the pages received: both invite codes, both device cookies, and the relay username and credential from `media.connected`.

**Pulled** both windows with an API token (Account › Workers Observability › Edit, which worked as named) into `.logs/`: 10 lines and 182 lines.

**What was stored.**

- **Graeae's own lines carry no secret.** The recorded invite codes, cookies and relay credentials appear nowhere, and neither does the marker cookie. `iceServers` shows as `[left out]`, and nothing matches an SDP body, a candidate, or an IPv4 or IPv6 address. The only hits were `HeadlessChrome/157.0.0.0` in `userAgent` and a clock time.
- **Cloudflare's metadata holds each request's address.** That is the open risk from the build. `$workers.event.request.url` and `.path`, and `$metadata.trigger` (`GET /invite/<code>`), carry the address, and `search` holds the query string parsed. Headers, cookies and IP addresses are not stored. Cloudflare wrote every real invite code as `REDACTED`, but it stored the marker code in the clear. The rule, documented for Tail Workers' `TailRequest.url`, masks a run of 21 or more ID characters only if it holds at least 2 capitals, 2 lower case letters and 2 digits. About 1 in 7 random 22-character codes (13.9% in a simulation) has fewer than 2 digits, so it would have been stored in the clear.
- **Fixed, by the owner's choice.** `newInviteCode` now draws again until a code passes that rule (about 127.8 random bits), and `test/invites.test.ts` checks 60 codes. CLAUDE.md's pull drops `$workers.event.request` and `$metadata.trigger` before saving. The rule is Cloudflare's heuristic, not a promise for Workers Logs. A code that never reaches Cloudflare would need it moved out of the address (`/invite#<code>`), which was left for later.

**Both sides line up.** 76 instance lines and 106 tab lines, sorted by `at`, read as one story: invite opened, joined, capture granted, `media.connected` on both ends, offer, `share.live` and `share.confirmed`, ICE connected, and `stats` every 15 seconds. Then came `page.offline`, `reconnecting.shown`, `ws.lost` (heartbeat unanswered) and the retries (`http.failed`, "Failed to fetch"). On the instance's side, `tab.silent`, then `grace.start` and `grace.end` as the socket was taken back. After that came `media.rejoined` and `reconnecting.cleared`, both tabs' `page.leave` beacons, and the cut-offs. Tab lines arrived 0.1 to 7 seconds after their `at`, and the drop's lead-up up to 21 seconds after, once the tab reconnected.

**Found and fixed on the way.**

- A tab's invite route was written `/invite/[left out] out]`. The instance runs a tab's line through the builder a second time, and the invite rule matched `[left`. That rule now skips a code already left out, and `test/log.test.ts` checks that a second pass changes nothing.
- One tab batch arrived twice. Its socket was taken back before the heartbeat answer confirmed it, so it was sent again. Delivery is at least once, so CLAUDE.md says to treat identical tab lines as one.

**The query in CLAUDE.md works.** The events are at `result.events.events`, newest first. Paging by `offset` (`$metadata.id`, which is shared by lines written in the same millisecond) and `offsetDirection: "next"` gave exactly the lines of a single pull at page sizes of 49, 50, 51 and 100, even with a page boundary inside a shared id. A `limit` above 2000 is refused with a validation error. Lines kept arriving for a few minutes after the window: 156 at first, then 181. CLAUDE.md now says all this, says each line sits at `.source`, and gives the token steps the owner followed. The README's logs line now says 7 days from 1 December 2026.

**Tests.** Typecheck and lint pass; all 446 tests in the Workers runtime and all 60 journeys pass.

**Deployed the fixes** from `626631f` (version `352a9b28`) with `pnpm run deploy --name graeae-test`. As with ticket 47, the instance kept serving the old page (`index-CJ-lIM3B.js`) for 320 seconds after the deploy. Its `instance.start` line at 13:55:36 UTC carries `build: "626631f"`.

**Kept on purpose.** The owner keeps the "Log check" member and the `graeae logs` token, which expires on 2026-11-28, in case another pull is needed.
