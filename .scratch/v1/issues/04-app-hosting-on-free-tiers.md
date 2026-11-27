# App hosting on free tiers

Type: research
Status: resolved
Branch: research/app-hosting
Map: ../map.md

## Question

Where can the web app itself, its signaling and its small amount of state live for free?

The app is a Svelte front end plus a small backend that knows who is a member, who is present in a room and which shares are live. It needs long-lived connections (WebSockets or similar) for a handful of people for hours at a time. The domain is managed at Cloudflare and the account is on the free Workers plan.

Establish from primary sources:

- What the Cloudflare free plan allows for static assets, Workers requests and CPU time, Durable Objects (including WebSocket hibernation and whether they are available on the free plan), D1 and KV, and whether hours-long WebSocket sessions for 6 people fit inside it.
- How a plain Svelte single-page app and a SvelteKit app each deploy there, and what SvelteKit adds or costs on that platform.
- Two or three credible free alternatives in case the media server ends up on a machine of its own, where the app could live beside it.
- What each option asks of someone else deploying their own copy from a README.

The answer feeds [App hosting and framework](11-app-hosting-and-framework.md).

## Answer

Full findings: `docs/research/app-hosting.md`, read from vendor docs on 2026-11-15. Nothing was built or deployed.

- **The Cloudflare free plan fits with a lot of room.** Durable Objects are available on the free plan with SQLite storage. One Worker plus one Durable Object using WebSocket hibernation uses about 1% of the 100,000 requests a day on a 12-hour day, and about 22% in a modelled worst case of 100 messages a minute per client.
- **Duration is the limit to watch.** Durable Object duration stays under 42% of the daily quota even if the object never hibernates during a session, but one object awake for 24 hours uses 83% and two exceed it. These rest on assumed message rates and should be measured on a prototype.
- **Hours-long sessions work.** A connected WebSocket has no wall-time limit. Cloudflare's runtime updates give connections up to 20 minutes to drain, so the client needs automatic reconnection.
- **Plain Svelte single-page app:** one Worker with static assets and the Durable Object class, deployed with one `wrangler deploy`. Page loads are free static assets that do not invoke the Worker.
- **SvelteKit:** the Cloudflare adapter does not support Durable Objects because it generates the Worker itself; the fix (sveltejs/kit PR #17708) was still unmerged on 2026-11-14. Until then the Durable Object needs a second Worker, config and deploy. Server-rendered pages count against the request quota and the 10 ms CPU limit, and SvelteKit has no native WebSocket support.
- **Alternatives:** Oracle Always Free has Brazil regions but reclaims idle machines, which a lightly used server would trigger. Google's free `e2-micro` is US-only with 1 GB of free egress. Render's free tier spins down after 15 minutes. Fly.io has no free tier but waives bills under $5.
- **A stranger deploying:** on Cloudflare, an account, `wrangler login`, `wrangler deploy` and `wrangler secret put`, with workers.dev as the fallback when they have no domain there. Oracle and Google need a card at sign-up and manual machine setup.

Unverified: which CPU limit applies to a free-plan Durable Object (the docs say 10 ms in one place and 30 s in another), whether a SvelteKit endpoint can pass a WebSocket upgrade through, whether cross-Worker Durable Object calls bill as one request, whether Cloudflare sign-up asks for a card, and Oracle's Brazil capacity. AWS, Azure and Hetzner were not checked.
