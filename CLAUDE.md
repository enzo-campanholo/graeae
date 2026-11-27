# graeae

## Agent skills

### Issue tracker

Issues are markdown files under `.scratch/<feature>/` in this repo. `docs/agents/issue-tracker.md` gives their conventions and the steps for closing one.

### Triage labels

The five default triage roles, each recorded as a `Status:` line in the issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Research

Findings go in `docs/research/<topic>.md`. See `docs/research/README.md`.

## Working in the repo

Node, pnpm and `GRAEAE_CHROMIUM` (the Chromium any Playwright script launches, as `executablePath`) come from `shell.nix`: run commands as `nix-shell --run '<command>'`. The shell outside it has `git`, `rg`, `jq`, `curl` and `flock` but no `node`, `python3` or `perl`, so edit files with the Edit tool.

- `pnpm dev`: the whole app locally (Worker, Durable Object and front end), on the real media server, so sharing needs real secrets in `.dev.vars`. `pnpm dev:fake-media` runs it on the fakes instead.
- `pnpm test`: builds the front end with `--mode fake-media`, runs the tests in the Workers runtime (Vitest), then the browser journeys and the media client's loopback (Playwright, `test/loopback`: the real media client in Chromium against a stand-in media server); a report gives both counts and the exit status. Once a build exists, `pnpm exec vitest run <file>` runs one file and `pnpm exec playwright test <file> -g <name>` one journey. Every test runs on the fakes; nothing automated may call Cloudflare. The pre-push hook runs it.
- `pnpm typecheck`, `pnpm lint`.
- `pnpm capture`: screenshots of every surface and state on the fakes, at 1920x953 and 1366x768, dark and light, into `.impeccable/review/captures/<label>/` with a contact sheet (`GRAEAE_CAPTURE=<label>`, and `GRAEAE_CAPTURE_AGAINST=<label>` to compare with an earlier set). It is not a test; see `scripts/capture/`.
- `pnpm perf`: times each move around the app on the fakes and fails when one flashes a loading state (painted for under 300ms). `GRAEAE_PERF_RTT=60` adds a round trip to HTTP and the sockets. Not a test; see `scripts/perf/`.
- `pnpm run deploy`: see `scripts/deploy.mjs`.
- `pnpm real-media`: one member of a deployed instance in a real Chromium, on the real media server, driven by typed or piped commands; not a test. See `scripts/real-media/member.ts`. Every owner action (signing this machine in, rooms, invites, removing members) goes through `pnpm as-owner` (`scripts/owner.ts`); `/setup` signs the owner out of every other device.

This machine has 7.5 GB of RAM: at most two agents run at once, subagents and delegates included. `pnpm test`, `test:browser`, `capture` and `perf` queue behind each other by themselves (`scripts/heavy.sh`).

While working a ticket, ask the owner only for what no agent on this machine can do (a second machine, a Windows browser, a secret), all of it in one message with each step written out. For webrtc-internals numbers, ask for the saved dump file (`scripts/real-media/webrtc-dump.ts` reads it).

Sharing a window of a browser that also holds a watching graeae tab (another profile or the same one) sends that tab's sound back out, and it loops until the watching tab is muted. To share and watch on one Windows machine, use two browsers, as `scripts/owner-checks.sh` does.

Seam 1 tests use the harness in `test/harness.ts`: HTTP, sockets, the test's clock, the fake media server's controls (`instance.media`) and the instance's log lines (`instance.logs()`) only. `test/harness.test.ts`, the harness's own test, may reach inside the instance.

## Logs

A deployed instance writes one JSON line per event to Workers Logs: its own (every request, socket, message, state change, media server call and exception) and each tab's, which the tabs send it in batches. The events, their fields and what is never logged are listed at the top of `src/shared/log.ts`; every line goes through that file. Workers Logs keeps lines for 3 days (7 from 1 December 2026), and drops them past the free plan's daily allowance.

To debug an evening, run `pnpm logs <worker> <from> <to>` (the Worker is `graeae-test`, or the `--name` it was deployed with) once the window is a few minutes old, since lines keep arriving minutes after it ends, and work from the file it saves in `.logs/`, gitignored because the lines hold friends' display names. `scripts/logs/pull.ts` says what the file keeps and drops. `pnpm logs:view <file>` reads it by tab, by media server call, or by failure (`scripts/logs/view.ts`).

It reads the owner's API token from `.logs/cloudflare-token`. When it says the token is missing or no longer active, give the owner the steps it prints, then ask for the token with `request_secret`, `delivery: "file"`, never in chat.

In each event, the line graeae wrote is the object at `.source` (so its own `source` field is `.source.source`), next to Cloudflare's `$workers` and `$metadata`. The file is in `.source.at` order, which lines up a tab's view with the instance's: a tab's lines arrive in batches, seconds after their `at`, and the lead-up to a dropped socket arrives after it reconnects.

## Migrations

Schema changes are SQL files in `src/instance/migrations/`, named `NNNN-what-it-does.sql` and numbered 1, 2, 3… with none shared or skipped. They are forward-only: never edit one that has merged.

- A ticket that adds a migration renumbers it to follow the last one on the integration branch after merging that branch in, and before reporting done.
- A ticket that adds a migration tests it on an instance that already holds earlier data: start the harness on the migrations before it, add data over HTTP, `restart` on the full list, and check the data over HTTP. Where today's code cannot make that data on the older schema, as with media, `test/migrations.test.ts` shows the way round.
