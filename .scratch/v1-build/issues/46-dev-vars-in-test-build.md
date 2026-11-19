# 46: The fake-media build takes `.dev.vars`, so the journeys fail wherever it exists

**What to build:** `pnpm test`, `pnpm capture` and `pnpm perf` pass on a machine that has real secrets in `.dev.vars` (which `pnpm dev` needs for sharing), with no file deleted by hand.

**What happens.** `vite build --mode fake-media` copies the root `.dev.vars` into `dist/graeae/.dev.vars`. `vite preview` then reads it over the secrets the Seam 2 config passes in its environment (`test/browser/app.ts`'s `SECRETS`). Setup refuses the Seam 2 setup secret, so every journey fails at "First room", and the capture's journeys fail at setup.

**Workaround meanwhile.** Run the steps of the script by hand and delete `dist/graeae/.dev.vars` between the build and `playwright test`. Tickets 40 and 41 ran their journeys this way.

**Blocked by:** none

**Status:** needs-triage

## Open questions

- Should the test build never copy `.dev.vars`, or should the preview's environment win over the copied file? Either way, `pnpm run deploy` must still never upload it.
