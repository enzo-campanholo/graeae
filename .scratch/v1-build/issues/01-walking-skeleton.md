# 01: Walking skeleton

**What to build:** One package that builds the Worker, the instance's Durable Object and the Svelte single-page app, runs the whole thing locally with one command, and deploys with one script. At this point every address answers with a bare "nothing here" page. The instance applies numbered, forward-only migrations by itself on first start. The Seam 1 test harness exists and has its first test.

Spec: [Shape](../spec.md#shape), [Deploying](../spec.md#deploying), [Seam 1](../spec.md#seam-1-the-instances-protocol-most-tests-live-here). ADRs 0001 and 0002.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] One package, TypeScript on both sides, built with Vite; plain Svelte with a small client-side router, not SvelteKit
- [ ] shadcn-svelte is installed and one component renders (theming comes in ticket 02)
- [ ] One Worker serves the static front end and routes to a single Durable Object for the instance, with SQLite storage; no D1, no KV
- [ ] One command runs the whole app locally
- [ ] The config ships with the `workers.dev` hostname only, no routes, and the Worker named `graeae`
- [ ] A deployer can override the Worker's name at deploy time, for a second instance
- [ ] Later deploys keep the secrets already on the Worker when no secrets file is present
- [ ] The five secrets (`SETUP_SECRET`, `SFU_APP_ID`, `SFU_APP_SECRET`, `TURN_KEY_ID`, `TURN_KEY_TOKEN`) are declared required in the config, which is what makes a deploy with one missing fail and name it (the owner checks the real deploy in ticket 13)
- [ ] An example secrets file is tracked, the real one is git-ignored, and the deploy script uploads it with the code
- [ ] A migration runner applies numbered migrations in order, once each, on first start; a test shows an instance on an older schema starting on newer code
- [ ] Every address, pages and API alike, gives the same "nothing here" answer
- [ ] Seam 1 harness: tests run the real Worker and Durable Object in the Workers runtime, speak only HTTP and the socket, and control time through a clock the test advances, alarms included; the "nothing here" behaviour is its first test
- [ ] Type-check, lint and test commands exist and pass; the 0BSD license file is present
- [ ] A test fails when two migrations share a number or are out of order
- [ ] The repo's agent instructions record two rules for later tickets: a ticket that adds a migration renumbers it after merging the integration branch and before reporting done, and tests it on an instance that already holds earlier data
