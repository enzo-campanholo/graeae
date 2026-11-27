# 03: Serve the build stamp

Status: needs-triage
Blocked by: none

**What was seen:** after a deploy, a check can tell the new release only by the entry script's hash (`/assets/index-<hash>.js` in the page). `pnpm run deploy --name graeae-test --wait` waits on that hash for the same reason.

**What to build:** the instance serves the `git describe` build it runs, in a header or a small JSON route, so `scripts/deploy.mjs`'s `--wait`, real-media runs and tickets can name the exact release they tested.
