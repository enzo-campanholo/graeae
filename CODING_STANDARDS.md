# Coding standards

What a review checks that no tool does. Typecheck and lint run before every commit, and
`pnpm test` before every push (`.githooks/`).

Read a change with `bash scripts/review-diff.sh <base> <dir>`: its `--stat`, then one patch per file in `<dir>`, with `.scratch/` left out.

## The real media client

A change to how `src/app/lib/media/browser.ts` negotiates is read against
`docs/media-server.md`.

- Each behaviour of the media server's that the change relies on is in that list, or is
  added there with where it was seen. Each behaviour of Chrome's is in a comment beside
  the code that relies on it, as in `stopping.ts`.
- Each behaviour the stand-in plays has a scenario in `test/loopback`. For each one it
  does not play, the ticket names a real-media check on `graeae-test`.
- A change to `docs/media-server.md` or to the stand-in
  (`test/loopback/page/media-server.ts`) is read against the other: each behaviour's
  note on whether the stand-in plays it is still true.

## Tests and docs

- A Seam 1 test asserts the fields it is about (`toMatchObject`, `expect.objectContaining`), so a new
  field in the room state breaks only the tests about that field.
- Journeys share one instance: a journey's members have names no other journey in `test/browser`
  uses.
- A changed value (a constant, a duration, a name) leaves none of its old literal behind in code,
  tests, comments or docs: grep for the old one.
- An ADR or spec change that brings in a domain term adds it to `GLOSSARY.md`.
