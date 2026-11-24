# Coding standards

What a review checks that no tool does. Typecheck and lint run before every commit, and
`pnpm test` before every push (`.githooks/`).

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
