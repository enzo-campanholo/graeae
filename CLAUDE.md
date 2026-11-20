# graeae

## Agent skills

### Issue tracker

Issues are markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each recorded as a `Status:` line in the issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Working in the repo

Node and pnpm come from `shell.nix`: run commands as `nix-shell --run '<command>'`.

- `pnpm dev`: the whole app locally (Worker, Durable Object and front end), on the real media server, so sharing needs real secrets in `.dev.vars`. `pnpm dev:fake-media` runs it on the fakes instead.
- `pnpm test`: builds the front end with `--mode fake-media`, then runs the tests in the Workers runtime. `pnpm exec vitest run <file>` runs one file once a build exists. Every test runs on the fakes; nothing automated may call Cloudflare.
- `pnpm typecheck`, `pnpm lint`.
- `pnpm capture`: screenshots of every surface and state on the fakes, at 1920x953 and 1366x768, dark and light, into `.impeccable/review/captures/<label>/` with a contact sheet (`GRAEAE_CAPTURE=<label>`, and `GRAEAE_CAPTURE_AGAINST=<label>` to compare with an earlier set). It is not a test; see `scripts/capture/`.
- `pnpm perf`: times each move around the app on the fakes and fails when one flashes a loading state (painted for under 300ms). `GRAEAE_PERF_RTT=60` adds a round trip to HTTP and the sockets. Not a test; see `scripts/perf/`.
- `pnpm run deploy`: see `scripts/deploy.mjs`.

Seam 1 tests use the harness in `test/harness.ts`: HTTP, sockets, the test's clock, the fake media server's controls (`instance.media`) and the instance's log lines (`instance.logs()`) only. `test/harness.test.ts`, the harness's own test, may reach inside the instance.

## Logs

A deployed instance writes one JSON line per event to Workers Logs: its own (every request, socket, message, state change, media server call and exception) and each tab's, which the tabs send it in batches. The events, their fields and what is never logged are listed at the top of `src/shared/log.ts`; every line goes through that file. Workers Logs keeps lines for 3 days (7 from 1 December 2026), and drops them past the free plan's daily allowance.

To debug an evening, pull its window and work from the saved file:

1. Ask the owner for an API token with Account › Workers Observability › Edit (the query endpoint accepts only that permission; the wrangler login cannot read logs) and the account id (`pnpm exec wrangler whoami`). Ask with `request_secret`, `delivery: "file"`, never in chat.
2. Query `POST https://api.cloudflare.com/client/v4/accounts/<account id>/workers/observability/telemetry/query` with `Authorization: Bearer <token>` and this body, `from` and `to` in milliseconds since the epoch, and the Worker's name (`graeae-test`, or the `--name` it was deployed with):

   ```json
   { "queryId": "graeae-pull", "view": "events", "limit": 2000,
     "timeframe": { "from": 1795100000000, "to": 1795118000000 },
     "parameters": { "filters": [{ "key": "$metadata.service", "operation": "eq", "type": "string", "value": "graeae-test" }] } }
   ```

   The events are in `result.events.events`. For the next page, send the same body with `"offset": "<the last event's $metadata.id>"` and `"offsetDirection": "next"`, until a page comes back short.
3. Save every event, one JSON per line, to `.logs/<worker>-<from>-<to>.jsonl`. `.logs/` is gitignored because the lines hold friends' display names. Sort by the line's `at` to line up a tab's view with the instance's: a tab's lines arrive in batches, seconds after its `at`.

## Migrations

Schema changes are SQL files in `src/instance/migrations/`, named `NNNN-what-it-does.sql` and numbered 1, 2, 3… with none shared or skipped. They are forward-only: never edit one that has merged.

- A ticket that adds a migration renumbers it to follow the last one on the integration branch after merging that branch in, and before reporting done.
- A ticket that adds a migration tests it on an instance that already holds earlier data: start the harness on the migrations before it, add data over HTTP, `restart` on the full list, and check the data over HTTP.
