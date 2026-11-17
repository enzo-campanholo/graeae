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
- `pnpm run deploy`: see `scripts/deploy.mjs`.

Seam 1 tests use the harness in `test/harness.ts`: HTTP, sockets and the test's clock only.

## Migrations

Schema changes are SQL files in `src/instance/migrations/`, named `NNNN-what-it-does.sql` and numbered 1, 2, 3… with none shared or skipped. They are forward-only: never edit one that has merged.

- A ticket that adds a migration renumbers it to follow the last one on the integration branch after merging that branch in, and before reporting done.
- A ticket that adds a migration tests it on an instance that already holds earlier data: start the harness on the migrations before it, add data over HTTP, `restart` on the full list, and check the data over HTTP.
