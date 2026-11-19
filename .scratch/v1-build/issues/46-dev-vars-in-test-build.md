# 46: The fake-media build takes `.dev.vars`, so the journeys fail wherever it exists

**What to build:** `pnpm test`, `pnpm capture` and `pnpm perf` pass on a machine that has real secrets in `.dev.vars` (which `pnpm dev` needs for sharing), with no file deleted by hand.

**What happens.** `vite build --mode fake-media` copies the root `.dev.vars` into `dist/graeae/.dev.vars`. `vite preview` then reads it over the secrets the Seam 2 config passes in its environment (`test/browser/app.ts`'s `SECRETS`). Setup refuses the Seam 2 setup secret, so every journey fails at "First room", and the capture's journeys fail at setup.

**Workaround meanwhile.** Run the steps of the script by hand and delete `dist/graeae/.dev.vars` between the build and `playwright test`. Tickets 40 and 41 ran their journeys this way.

**Blocked by:** none

**Status:** resolved

## Open questions

- Should the test build never copy `.dev.vars`, or should the preview's environment win over the copied file? Either way, `pnpm run deploy` must still never upload it.

## Comments

### 2026-11-19: built and closed

**Chosen.** The first of the open questions: the test build never copies `.dev.vars`. Letting the preview's environment win would mean changing how wrangler reads secrets. With a `.dev.vars` present, `getVarsForDev` never looks at `process.env` at all. Dropping the file is one hook.

**Built.** `withoutDevVars` (`vite.config.ts`), a build-only plugin added only under `--mode fake-media`, deletes `.dev.vars` from the bundle after the Cloudflare plugin's `generateBundle` emits it. `dist/graeae/` then holds no `.dev.vars`, so `vite preview` takes the Seam 2 `SECRETS` its config starts it with. Nothing else changes:
- `pnpm dev` and `pnpm dev:fake-media` still read the root `.dev.vars`. The capture's samples server is one of these, and it never goes through setup.
- `pnpm preview` and the deploy's `--mode production` build still copy the file, as before, and wrangler never uploads it.

**Checked, on this machine with real secrets in `.dev.vars`.** Before the change, `dist/graeae/.dev.vars` was copied and setup's first journey failed. After it:
- No such file is built, and the journey passes.
- Typecheck and lint pass.
- `pnpm test` passes: 431 tests in the Workers runtime and 60 journeys.
- `pnpm perf` passes.
- `pnpm capture` failed once, in its journeys project and after setup, so not on this bug. It then passed three times: twice in full and once as the journeys project alone. The failure's output wasn't kept.

**Review.**
- **Spec:** nothing missing. It asked for this comment and for the capture to be run again with its output kept; both are done above.
- **Standards:** the plugin's call site now says why it is there, and the docblock's "it" now names the file.
- **Left as is:** `mode === FAKE_MEDIA_MODE` appears twice in the config, which is too few to need its own name.

**Not deployed:** the deploy's build is unchanged, so there is nothing to deploy.
