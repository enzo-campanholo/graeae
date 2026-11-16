# App hosting and framework

Type: grilling
Status: resolved
Blocked by: 04, 08
Map: ../map.md

## Question

Where do the app, its signaling and its state run, and is the front end plain Svelte or SvelteKit?

Inputs are [App hosting on free tiers](04-app-hosting-on-free-tiers.md) and [Media transport choice](08-media-transport-choice.md), since a media server on its own machine changes where the rest should live.

Decide:

- The host for the front end, the backend and the state. Cloudflare is the default because the domain is there, but it is not locked in.
- Plain Svelte single-page app or SvelteKit. Svelte with shadcn-svelte and Bits UI is fixed either way.
- The subdomain layout.
- Whether the result is still deployable by a stranger from the README without paid services.

## Answer

Decided with the user on 2026-11-16. Facts come from [App hosting on free tiers](04-app-hosting-on-free-tiers.md) and [Media transport choice](08-media-transport-choice.md).

- **Everything runs on Cloudflare's free plan.** The front end, the backend and the state live in the same Cloudflare account as the media server, so a deployer needs one account and one vendor. The research put usage at about 1% of the daily request quota on a 12-hour day and 22% in the modelled worst case.
- **Plain Svelte single-page app built with Vite, not SvelteKit.** One Worker serves the static files and holds the Durable Object, deployed with one `wrangler deploy`. Page loads are free static assets. The app brings its own small client-side router. shadcn-svelte and Bits UI are unchanged.
- **One hostname, one origin.** Pages, API and WebSocket share a single origin, so the remembered-device cookie stays first-party with no cross-origin setup. The hostname is a deploy setting, not something in the code. The media server uses Cloudflare's own hostnames.
- **One Durable Object per instance holds all state.** Durable state (members, devices, rooms, access, invites) is in its built-in SQLite; live state (who is present, which shares are live) is in its WebSocket connections, using hibernation. No D1 and no KV. Membership and sockets sit together, so removal can close a member's connections at once. One awake object stays under 42% of the daily duration quota during sessions; that figure rests on assumed message rates.
- **A deployer needs no domain.** graeae runs on the free `workers.dev` hostname, with a custom hostname as an optional setting. The path is a Cloudflare account, `wrangler login`, `wrangler deploy` and setting the secrets.
- **Deployable free by a stranger:** true for the app and state. For the media server it waits on [Cloudflare account check](15-cloudflare-account-check.md), which finds out whether sign-up asks for a card and whether the media server can be enabled without a payment method.
- **One repository, one package, TypeScript on both sides.** A single build produces the static front end and the Worker, and `wrangler dev` runs the whole thing locally. Socket message types are shared by plain imports.

**Considered and not chosen.**

- SvelteKit: its Cloudflare adapter cannot host a Durable Object until sveltejs/kit PR #17708 merges, so it needs a second Worker, config and deploy today. It has no native WebSocket support, and server rendering buys nothing when every page sits behind the device cookie and the room is live state over a socket.
- Oracle, Google, Render and Fly.io: each adds a second account, and most need a card or spin down when idle.
- An `api.` subdomain: cross-origin setup for no gain at this size.
- One Durable Object per room with D1: two objects awake all day exceed the free duration quota, and removal would fan out across objects.

**Still unknown.** Which CPU limit applies to a free-plan Durable Object (the docs say 10 ms in one place and 30 s in another), and the real message rates behind the quota estimates. Both are checked when something is built.

**Glossary.** No term added.

Unblocks [Signaling and room state](18-signaling-and-room-state.md) and [Deploy story](19-deploy-story.md).

**ADRs.** `docs/adr/0001-plain-svelte-not-sveltekit.md` and `docs/adr/0002-one-durable-object-per-instance.md`.
