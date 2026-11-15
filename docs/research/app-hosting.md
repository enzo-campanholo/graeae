# App hosting on free tiers

Research ticket for graeae. Read on **2026-11-15**. Every limit and price below was read from the owning vendor's current documentation on that date; the "Last updated" date shown on the vendor page is given with each source. Nothing here is a recommendation: costs are the owner's decision. Anything I could not verify from a primary source is marked **UNVERIFIED**.

## Question

Where can the graeae web app (Svelte front end), its signaling and its small amount of state (members, who is present in a room, which shares are live) live for free? The app needs WebSocket-style long-lived connections for about 6 people, a few hours at a time, around 60 hours a month. Media is out of scope (separate ticket).

## Short answer

- **The Cloudflare free plan fits, with large headroom.** The design that fits is one Worker plus one SQLite-backed Durable Object using the Hibernation WebSocket API. Under reasonable assumptions the app uses about 1% of the daily request limits and well under half of the daily Durable Object duration allowance, even with a 12-hour room open all day (section 2).
- **Plain Vite Svelte SPA vs SvelteKit on Cloudflare is not a hosting-cost difference; it is a Durable Object difference.** A plain SPA plus a Worker entry deploys as one Worker, and the Durable Object class lives in that Worker. The official SvelteKit Cloudflare adapter generates the Worker itself and its docs say Durable Objects are not supported; a custom-entrypoint pull request is open and unmerged (section 3.2). With SvelteKit today, the Durable Object has to go in a second Worker.
- **Free alternatives** exist if the media server gets its own machine: Oracle Cloud Always Free (Brazil regions, but with an idle-reclaim rule that matters for a lightly used app), Google Cloud `e2-micro` (US regions only). Render's free web service is a weak third option (section 5). Fly.io has no free tier for new accounts, but waives personal bills under $5/month.

---

## 1. What the Cloudflare free plan allows

All numbers are the Workers **Free** plan unless noted.

### 1.1 Workers and static assets

| Item | Free plan | Source |
| --- | --- | --- |
| Worker requests | 100,000 per day, resets 00:00 UTC. Past it: Error 1027 (fail-closed) or the Worker is bypassed (fail-open) | Workers limits, updated Nov 13 2026 |
| CPU time per HTTP request | 10 ms (Paid: default 30 s, up to 5 min). The page says the average Worker uses about 2.2 ms and that Workers that "handle authentication, server-side rendering, or parse large payloads typically use 10-20 ms" | Workers limits |
| Duration (wall time) for HTTP requests | "No limit" while the client stays connected. Duration is not charged on Free | Workers limits; Workers pricing |
| Subrequests per request | 50 | Workers limits |
| Memory per isolate | 128 MB | Workers limits |
| Static asset files per Worker version | 20,000; each file at most 25 MiB | Workers limits |
| Number of Workers | 100 | Workers limits |
| Static asset requests | "free and unlimited". Only requests that invoke the Worker script count | Static assets billing, updated Nov 12 2026 |
| WebSockets through a Worker | The upgrade is "charged as a request"; messages routed through a Worker "do not count as requests" | Workers pricing |

Sources:
- <https://developers.cloudflare.com/workers/platform/limits/>
- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>

Two details from these pages matter later:
- With `assets.run_worker_first`, matching requests always invoke the Worker. On the free tier, once the daily limit is exceeded those requests get a 429 instead of falling back to assets (static assets billing page).
- **Runtime updates:** "processes running the previous version of the Workers runtime give existing Workers requests and connections up to 20 minutes to finish. This includes streaming HTTP responses and WebSocket connections." The page tells you to "design long-running applications to handle disconnections". So a multi-hour session will be disconnected at some point; the client needs automatic reconnect and the room needs to survive it (Workers limits, "Runtime updates").

### 1.2 Durable Objects

Source: <https://developers.cloudflare.com/durable-objects/platform/pricing/> (updated Nov 13 2026), <https://developers.cloudflare.com/durable-objects/platform/limits/> (Nov 13 2026), <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/>, <https://developers.cloudflare.com/durable-objects/best-practices/websockets/> (Oct 30 2026).

- **Available on Free:** "Durable Objects are available both on Workers Free and Workers Paid plans." On Free, "Only Durable Objects with SQLite storage backend are available."
- **Free quotas (all reset 00:00 UTC; past any one of them "further operations of that type will fail with an error"):**

  | Item | Free |
  | --- | --- |
  | Requests | 100,000 / day (includes HTTP requests, RPC calls, WebSocket messages, alarm invocations) |
  | Duration | 13,000 GB-s / day |
  | SQLite rows read | 5 million / day |
  | SQLite rows written | 100,000 / day (deletes count as writes; each `setAlarm()` is one write) |
  | SQLite stored data | 5 GB total |

- **Limits:** DO classes per account 100 on Free. Per-object storage: the limits page's table says 10 GB while its FAQ says "10 GB on Workers Paid, or 1 GB on the Free plan" and a footnote says Free accounts are limited to 5 GB total. The page is internally inconsistent; the account total of 5 GB applies either way, and graeae's data is a few KB. Received WebSocket messages up to 32 MiB. An object has a soft limit of 1,000 requests per second. The page says a single instance can serve "thousands of clients" over WebSockets (websockets page), so 6 is trivial.
- **CPU per invocation:** the DO limits page says 30 s by default per HTTP request, WebSocket message or alarm, not split by plan, but it also says Durable Objects "have the same per invocation CPU limits as any Workers", and the Workers page lists 10 ms for Free. **UNVERIFIED which applies to a Free-plan DO.** Treat 10 ms as the planning figure. A handler that parses a small JSON message and broadcasts to at most 6 sockets should be far below that, but it is untested.
- **Billing for WebSockets:** opening a connection is one request. Outgoing messages and incoming protocol pings are free. Incoming messages use a 20:1 ratio for billing: "100 WebSocket incoming messages would be charged as 5 requests". Application-level auto-responses set with `setWebSocketAutoResponse()` "will not incur additional wall-clock time, and so they will not be charged".
- **Duration billing:** wall-clock time while the object is running **or idle but unable to hibernate**, always priced at 128 MB regardless of real use. "Calling `accept()` on a WebSocket ... will incur duration charges for the entire time the WebSocket is connected"; the Hibernation API (`ctx.acceptWebSocket()`) avoids that once handlers finish.
- **Hibernation rules (lifecycle page):** an object hibernates after 10 seconds with no incoming request or event, provided that no `setTimeout`/`setInterval` is pending, nothing is mid-request, and there is no outbound WebSocket or pending I/O. While hibernated, WebSocket clients stay connected, the constructor re-runs on the next event, and in-memory state is lost. Per-socket state of up to 16,384 bytes can be kept with `serializeAttachment`. Ping/pong frames are answered by the runtime without waking the object. Hibernatable connections stay connected across a Durable Object code update that happens after hibernation, but a forced update disconnects them.
- **Paid reference prices** (not a recommendation): Workers Paid is "a minimum charge of $5 USD per month" (Workers pricing page). Durable Objects on Paid: 1 million requests/month included then $0.15/million; 400,000 GB-s/month included then $12.50/million GB-s; 25 billion rows read and 50 million rows written included, then $0.001 and $1.00 per million; stored data 5 GB-month included then $0.20/GB-month. Cloudflare's own worked example for a hibernating WebSocket app (100 objects, 100 clients each, 1 message/minute) is $20.65/month, but that example has 10,000 connected clients against graeae's 6, so it says little about graeae's own bill.

### 1.3 D1 and KV (probably not needed)

- **D1 Free** (<https://developers.cloudflare.com/d1/platform/pricing/>, <https://developers.cloudflare.com/d1/platform/limits/>, Oct 30 2026): 5 million rows read/day, 100,000 rows written/day, 5 GB total storage, 10 databases, 500 MB per database, 7-day Time Travel.
- **KV Free** (<https://developers.cloudflare.com/kv/platform/pricing/>, Oct 30 2026): 100,000 reads/day, **1,000 writes/day**, 1,000 deletes/day, 1,000 list requests/day, 1 GB stored.
- For a roster of tens of people and live room state, the Durable Object's own SQLite storage covers membership and room state in one place, with the same row quotas as D1. D1 or KV would only be useful for data that must be read outside the room's object. KV's 1,000 writes/day is the tightest limit of the three products and it is eventually consistent, so it is a poor fit for presence. (Eventual consistency is KV's documented design; I did not re-read that page's consistency section.)

---

## 2. Does it fit? Usage against each limit

### Assumptions (mine, stated so they can be challenged)

- 6 people, 60 room-hours per month, e.g. 20 sessions of 3 hours.
- **Worst realistic day:** one room open for 12 hours.
- One Worker (entry) and one Durable Object holding the whole group (one "room" object, or one directory object plus one room object; the second case is shown where it matters).
- Each client reconnects every 10 minutes on average (pessimistic, to cover flaky mobile networks and the 20-minute runtime-update drain): 6 clients × 6 per hour = 36 connects/hour.
- **Expected message load:** 3 messages per minute per client (app-level heartbeat every 30 s = 2/min, plus 1/min of presence and signaling on average). **Stress load:** 100 messages per minute per client, constant.
- Membership read on each connect: 50 rows. Persistent writes: about 200 per day (share toggles, member changes). Presence itself kept in memory or in socket attachments.

### Daily (the quotas that actually bite on Free)

| Limit (per day) | Quota | Expected use, 12-h day | Share | Stress use, 12-h day | Share |
| --- | --- | --- | --- | --- | --- |
| Worker requests | 100,000 | about 432 WebSocket upgrades + about 200 API calls = about 650 | 0.7% | same | 0.7% |
| DO requests | 100,000 | 432 connects + 12,960 messages ÷ 20 (= 648) = 1,080 | 1.1% | 432 + 432,000 ÷ 20 (= 21,600) = 22,032 | 22% |
| DO duration | 13,000 GB-s | 12 h × 3,600 s × 0.125 GB = 5,400 GB-s if never hibernating | 41.5% | same | 41.5% |
| DO duration, 24 h never hibernating | 13,000 GB-s | 10,800 GB-s | 83% | same | 83% |
| SQLite rows read | 5,000,000 | 432 connects × 50 rows = 21,600 | 0.4% | same | 0.4% |
| SQLite rows written | 100,000 | about 200 | 0.2% | same | 0.2% |
| SQLite storage | 5 GB total | KB | about 0% | same | about 0% |

Arithmetic notes: messages = 6 clients × 3 msg/min × 60 min × 12 h = 12,960 (expected) and 6 × 100 × 60 × 12 = 432,000 (stress). Free duration quota ÷ 0.125 GB = 104,000 s = 28.9 hours of continuous activity per object per day.

### Monthly view (60 room-hours)

- DO duration if never hibernating: 60 × 3,600 × 0.125 = 27,000 GB-s for the month, against a daily quota of 13,000 (about 390,000 over 30 days), so 7%. It only breaks if essentially all 60 hours fall on one day (27,000 > 13,000); spread over three or more days it fits.
- Messages for the month at the expected load: 6 × 3 × 60 × 60 = 64,800, which is 3,240 billable DO requests, plus 2,160 connects.

### Headroom and the things that would erode it

- **Two objects awake all day exceed the duration quota** (2 × 24 h × 3,600 × 0.125 = 21,600 GB-s > 13,000). At 12 hours each it is 10,800 and fits. Keeping one object per group, and letting it hibernate, avoids the question.
- **Hibernation only helps if the object is actually idle.** With six clients each heartbeating every 30 s, an event arrives about every 5 seconds, so the 10-second idle rule never fires during a session and duration accrues as if there were no hibernation. Using `setWebSocketAutoResponse()` for the heartbeat (answered by the runtime without waking the object) lets the object sleep between real events. This is Cloudflare's documented behavior; whether it changes duration for graeae in practice is a measurement to take, not something I verified. Either way the table above shows the worst case still fits.
- Any `setTimeout`/`setInterval` in the object blocks hibernation (lifecycle page). Presence expiry should use a stored timestamp checked on events, or one alarm, rather than a timer per client. Alarms themselves also prevent hibernation while pending, per the websockets page.
- **CPU:** the 10 ms Worker CPU limit is not a problem for a pass-through WebSocket upgrade (the page says the average is about 2.2 ms), but it is relevant to server-side rendering (section 3.2).
- **Daily limits are per account, shared by every Worker on it.** Other projects on the same free account add to the 100,000/day.
- **Exceeding any free limit makes operations fail, not slow down** (DO pricing page), so the app should handle errors and show them.

**Conclusion for Cloudflare Free:** the load is one to two orders of magnitude under the quotas that matter. Hours-long WebSocket sessions are supported: the Workers limits page says there is no wall-time limit on an HTTP request while the client stays connected, and the DO limits page says Durable Objects "remain active while a request, RPC call, response stream, WebSocket, or pending I/O is in flight". Reconnect logic is still needed because of runtime updates (section 1.1).

---

## 3. Deploying the two front-end options on Cloudflare

### 3.1 Plain Svelte SPA (Vite) on Workers static assets

- **Mechanism:** build to `dist/`, then configure Wrangler with `assets.directory` and `assets.not_found_handling = "single-page-application"`. Unmatched navigation requests get `/index.html` with 200. Source: <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/> (Oct 12 2026).
- **Worker billing:** with a Worker script (`main`) plus a compatibility date of 2025-04-01 or later, navigation requests (`Sec-Fetch-Mode: navigate`) do **not** invoke the Worker, so page loads cost no Worker requests. A `fetch()` from your own JavaScript to `/api/...` does invoke it. Same page.
- **Backend alongside it:** the Cloudflare Vite plugin lists "Static sites, such as single-page applications, with or without an integrated backend API" as a use case, so one Vite project can build the SPA and the Worker entry together, and `vite dev` runs the Worker in local `workerd`. Source: <https://developers.cloudflare.com/workers/vite-plugin/> (Nov 6 2026). npm dist-tags on 2026-11-15: `@cloudflare/vite-plugin` latest 1.69.1 (a v2 beta exists), `wrangler` latest 4.162.0.
- **Durable Object:** exported from the same Worker entry file and declared in `wrangler` config (`durable_objects.bindings` plus an `exports` entry `{"type": "durable-object", "storage": "sqlite"}`; the older `migrations` array with `new_sqlite_classes` still works, but a Worker can use only one of the two). Sources: <https://developers.cloudflare.com/durable-objects/get-started/>, <https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/> (Sep 28 2026).
- **Result:** one Worker, one config file, one `wrangler deploy`.
- **Not verified here (UNVERIFIED):** I did not run this stack; svelte-specific Vite plugin set-up (a Svelte template for the Cloudflare Vite plugin) is not among the framework guides I read, which list React, Vue, React Router and TanStack Start. Combining `@sveltejs/vite-plugin-svelte` with `@cloudflare/vite-plugin` should follow the generic "SPA with a backend API" path, but that is an inference.

### 3.2 SvelteKit on Cloudflare

- **Adapter:** `@sveltejs/adapter-cloudflare` "supports all SvelteKit features; builds for Cloudflare Workers Static Assets and Cloudflare Pages". `adapter-cloudflare-workers` is deprecated. Source: <https://svelte.dev/docs/kit/adapter-cloudflare> (read from the sveltejs/kit repo, `documentation/docs/25-build-and-deploy/60-adapter-cloudflare.md`, main branch, 2026-11-15). Published versions (npm, 2026-11-15): `@sveltejs/kit` latest 3.2.0 (a `version-2` line at 2.70.4), `@sveltejs/adapter-cloudflare` latest 8.0.2 (`version-2` at 7.2.10).
- **Deploy:** `npx wrangler deploy` (Wrangler auto-detects SvelteKit and writes `wrangler.jsonc` with `main: .svelte-kit/cloudflare/_worker.js` and `assets.directory: .svelte-kit/cloudflare`), or the Cloudflare Git integration. Source: <https://developers.cloudflare.com/workers/framework-guides/web-apps/sveltekit/> (Nov 5 2026). The guide notes that the first deploy of an existing project can fail with `Types file not found` until `npx wrangler types` is run once.
- **Pages:** the adapter still targets Pages, but Cloudflare's Pages page says "Workers supports most Pages use cases and offers a broader feature set ... Start new projects with Workers." The Pages-to-Workers compatibility matrix marks Durable Objects as supported on Workers and only partially on Pages (a separate Worker must hold the object), and Cron Triggers as not available on Pages. Sources: <https://developers.cloudflare.com/pages/>, <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>.
- **What SvelteKit adds on this platform:**
  - A generated server Worker. Everything that is not a static asset (server-rendered pages, `+server.js` endpoints, form actions, hooks) invokes it. That counts against the 100,000/day request quota and the 10 ms CPU limit. Cloudflare says server-side rendering typically uses 10-20 ms CPU (Workers limits page). **Whether graeae's pages would exceed 10 ms on Free is UNVERIFIED**; it depends on page complexity. Prerendering, or running with `ssr = false` and a fallback page, takes SSR out of the Worker.
  - Worker bundle size limit 64 MiB uncompressed on Free (adapter docs mention it as a possible troubleshooting item).
  - No `fs`, and `wrangler types` for binding types (adapter docs).
  - Static-only is possible: `adapter-static` with `fallback` produces an SPA, "compatible with Cloudflare Workers Static Assets and Cloudflare Pages" (adapter docs; SPA mode docs warn of a performance and SEO cost, which does not matter for a private app).
- **SvelteKit and Durable Objects (key finding):**
  - The adapter docs state: "Durable Objects and Workflows, which require custom classes to be exported from your worker, are not currently supported." Bindings can be *used* from endpoints through `import { env } from 'cloudflare:workers'` (the docs show a Durable Object namespace being used from a `+server.js`).
  - The umbrella issue sveltejs/kit#17749 ("Cloudflare adapter gaps", created 2026-11-12, open) says: "The adapter currently supplies its own default worker, so an app can't export Durable Objects, Workflows or other handlers ... from it." The fix is PR #17708 "support a custom worker entrypoint" (opened 2026-11-10, **open, not merged** as of 2026-11-14). It would let you add a `src/worker.ts` that exports a Durable Object class and re-exports SvelteKit's `fetch`. The older PR #17666 was closed and replaced by it. Issue #1712 (opened 2021) is still open.
  - Until that merges, the supported route is the one the PR text itself describes: the Durable Object "ha[s] to go in a separate Worker, with its own config and deploy, bound to SvelteKit's Worker where it needs them." Cloudflare's binding config has an optional `script_name` field for exactly this (DO get-started page), and the pages Cloudflare publishes for Pages say the same ("you must create a separate Worker with a Durable Object and then declare a binding to it").
  - Cost on Free: two Workers (of 100), two Wrangler configs, and two deploys, ordered (Durable Object Worker first). Request counts rise slightly since the SvelteKit Worker forwards to the Durable Object Worker; Cloudflare bills a service-binding call from Worker A to B as one request in total but sums CPU (Workers pricing, "Standard model" note). Whether that rule applies to calling a Durable Object through a cross-Worker binding is **UNVERIFIED**.
- **SvelteKit and WebSockets:**
  - SvelteKit has no native WebSocket support: issue #1491 "Native support for web sockets" is open, and the `crossws`-based PR #12973 was closed unmerged on 2026-07-06 with the maintainer saying they would "revisit WebSockets after" SvelteKit 3 work.
  - The pattern on Cloudflare is that a Worker returns the Durable Object stub's response (status 101 with a `webSocket`) to the client. **Whether SvelteKit's response handling preserves a 101 response from inside a `+server.js` is UNVERIFIED**; I found no documentation either way. Options if SvelteKit is chosen: have the client connect to the Durable Object Worker's own hostname or route (e.g. `ws.example.com` or `/ws/*` routed to that Worker), which sidesteps SvelteKit entirely, or wait for PR #17708. A short prototype would settle it.
- **Other options:** SvelteKit running under the Cloudflare Vite plugin's `workerd` environment is being worked on (issue #17749 sections 2-3, mostly unchecked boxes), so local dev currently emulates Cloudflare bindings through `getPlatformProxy` rather than running the app in `workerd`. Durable Objects in `vite dev` are therefore also not available through the adapter (adapter docs).

### 3.3 Summary of the difference

| | Plain Vite SPA + Worker | SvelteKit + `adapter-cloudflare` |
| --- | --- | --- |
| Worker count | 1 | 2 today (DO in its own Worker), 1 if PR #17708 lands |
| Durable Object class | In the same Worker entry | Not exportable from the generated Worker (adapter docs) |
| Page loads | Static assets, free, no Worker invocation | Static assets free; SSR/endpoints invoke the Worker (daily quota, 10 ms CPU) |
| WebSocket route | Your Worker handles `/ws` and forwards to the DO | No native WebSocket API; forwarding through SvelteKit is UNVERIFIED |
| Routing/data loading | You choose a router (e.g. a small client router) | File-based routing, `load`, form actions, hooks |
| Deploy | `vite build` + `wrangler deploy` | `wrangler deploy` (auto-config) + a second deploy for the DO Worker |
| Local dev with DO | Vite plugin runs `workerd` | Bindings emulated; DO classes not supported by adapter |
| Moves off Cloudflare | Static `dist/` is portable; the Worker is Cloudflare-specific | `adapter-node` / `adapter-static` exist (adapter list in kit docs) but the DO is Cloudflare-specific either way |

---

## 4. What a stranger needs to deploy their own copy (Cloudflare)

- **Accounts:** a Cloudflare account (free). No payment method is mentioned as required by the Workers or Durable Objects free plan pages; I did not test sign-up (**UNVERIFIED** whether a card is requested). A GitHub or GitLab account if using the deploy button or Git integration.
- **Commands:** `npm install`, `npx wrangler login` (or an API token in `CLOUDFLARE_API_TOKEN` for CI), then `npx wrangler deploy`. Wrangler provisions the Durable Object namespace from the config on first deploy (DO exports page: "Cloudflare uses this declaration to provision a namespace for the class the first time you deploy").
- **One-click option:** a "Deploy to Cloudflare" button in the README clones the repo to the user's own GitHub/GitLab, lets them name the Worker and resources, builds with Workers Builds, and deploys. Required resources are provisioned automatically; the supported list includes KV, D1, R2 and Durable Objects, and Cloudflare reads the repo's Wrangler configuration file to decide what to provision. The button takes a repo URL and an optional subdirectory, which suggests one Worker per button (**inference**: matters for the two-Worker SvelteKit layout). Source: <https://developers.cloudflare.com/workers/platform/deploy-buttons/> (Oct 12 2026).
- **Build quota for Git-based deploys:** Workers Builds Free: 3,000 build minutes/month, 1 concurrent build, 20-minute timeout (<https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/>, Oct 28 2026).
- **Secrets and config:** `npx wrangler secret put NAME` for production, `.dev.vars` (or `.env`, not both) for local development, both kept out of git; a `secrets.required` config key declares which names the Worker needs. Non-secret settings go in `vars` in the Wrangler config. Source: <https://developers.cloudflare.com/workers/configuration/secrets/>. To keep nothing hardcoded, the README should name every setting (for example an invite secret or allowed-origin list) and the Worker should fail at startup with a clear message if a required one is missing.
- **Domain:** by default each Worker gets `<worker-name>.<account-subdomain>.workers.dev`. Cloudflare recommends a Workers route or custom domain for production, and treats workers.dev as "intended for personal or hobby projects that aren't business-critical". The workers.dev hostname always goes through Browser Integrity Check, which cannot be turned off there (<https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>, Nov 6 2026). A **custom domain** requires "An active Cloudflare zone" for the domain, then Dashboard > Settings > Domains & Routes, or `routes: [{pattern, custom_domain: true}]` in Wrangler config. It cannot be created "on a hostname with an existing CNAME DNS record or on a zone you do not own". Cloudflare then creates DNS records and certificates. Source: <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/> (Nov 12 2026). A stranger whose domain is not on Cloudflare can still use workers.dev, which fits "nothing hardcoded"; the hostname must come from configuration, not code.
- **Spending guard:** the Workers and Durable Objects limits pages both document a configurable spending limit. I did not check whether it applies to Free accounts; on Free, the documented behavior of excess usage is that operations fail.

---

## 5. Free alternatives if the media server gets a machine

All read on 2026-11-15. None of these are Cloudflare, so the Worker/Durable Object code would not run on them; the app's signaling and state would need a small long-running server (Node, Deno, Go or similar) instead. That is extra code compared with the Durable Object route.

### 5.1 Oracle Cloud Always Free

Sources: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm> (no last-updated date on the page; footer 2026), <https://www.oracle.com/cloud/free/>, <https://www.oracle.com/cloud/free/faq/>, <https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm>.

- **Compute:** Arm Ampere A1: "the first 1,500 OCPU hours and 9,000 GB hours per month ... For Always Free tenancies, this is equivalent to 2 OCPUs and 12 GB of memory", usable as one instance or two of 1 OCPU. Up to two AMD micro VMs (`VM.Standard.E2.1.Micro`: 1/8 OCPU with burst, 1 GB, up to 50 Mbps internet bandwidth). Confirm the figures in the console at sign-up, since this is the kind of number that changes.
- **Storage:** 200 GB total of block storage across boot and block volumes; minimum boot volume 47 GB (the page also says 50 GB elsewhere).
- **Network:** "10 TB per month of outbound data"; one Flexible Load Balancer at 10 Mbps for tenancies created after 2020-12-15; no requirement to assign a public IPv4 to every instance.
- **Brazil:** regions `sa-saopaulo-1` (Brazil East, Sao Paulo) and `sa-vinhedo-1` (Brazil Southeast, Vinhedo) exist. Always Free instances "must" be created in the tenancy's **home region**, chosen at sign-up (the page does not say the free A1 capacity is available in each region; **UNVERIFIED** for the Brazil regions).
- **Catches:**
  - **Idle reclamation:** "Idle Always Free compute instances may be reclaimed by Oracle" if over 7 days the 95th-percentile CPU is below 20%, network utilization is below 20%, and (A1 only) memory utilization is below 20%. A signaling server used 60 hours a month would sit below those thresholds by default. The page does not say how often reclamation happens or whether Pay As You Go accounts are exempt (**UNVERIFIED**); the page does say upgrading to Pay As You Go keeps the free resources free ("Oracle doesn't charge for Always Free resources after you upgrade").
  - "Out of host capacity" errors when creating instances are acknowledged on the page as temporary.
  - A credit or debit card is required at sign-up for identity verification, with a temporary authorization hold; prepaid, virtual single-use and PIN debit cards are not accepted (FAQ). One Free Tier account per person. "Accounts left idle for 30 days or more may be deemed abandoned and become eligible for suspension or termination" (Free Tier page).
- **For a stranger:** sign-up with card, region choice (home region cannot be assumed changeable; not verified), create the VM, open ports in the VCN security list and in the VM firewall, install a runtime, TLS certificate and domain setup of their own. All manual compared with `wrangler deploy`; an install script or container image in the README would shorten it.

### 5.2 Google Cloud Compute Engine free tier

Source: <https://docs.cloud.google.com/free/docs/free-cloud-features> (no last-updated date on the page).

- **Always Free:** "1 non-preemptible `e2-micro` VM instance per month" (limit "by time, not by instance"), only in `us-west1` (Oregon), `us-central1` (Iowa) or `us-east1` (South Carolina); "30 GB-months standard persistent disk"; "1 GB of outbound data transfer from North America to all region destinations (excluding China and Australia) per month". The 1 GB egress figure is far below what media relaying needs, though signaling alone would be tiny. A billing account is required.
- **Trial:** $300 credit for 90 days, credit card or other payment method required, "You will not be billed for any Google Cloud usage during your Free Trial."
- **Fit:** the machine is small (the page names only the type; I did not read its specs) and in the US, so latency from Brazil is higher than from a Sao Paulo region (not measured). It suits a signaling/state server better than a media server because of the 1 GB egress.
- **For a stranger:** Google Cloud project and billing account with a card, `gcloud` or console VM creation, firewall rules, runtime install, TLS and DNS.

### 5.3 Other options checked

- **Render free web service** (<https://render.com/docs/free>): 750 free instance hours per workspace per month, spins down after 15 minutes without inbound traffic (HTTP requests and WebSocket messages from existing connections reset the timer), about one minute to wake on the next request, no persistent disk, may be restarted at any time, "Do not use them for production applications". No stated limit on WebSocket connection duration. Free to use but unreliable for hours-long sessions, and state would be lost on restart. Weakest fit.
- **Fly.io** (<https://docs.fly.io/about/pricing>): "New organizations don't have a free tier or a monthly free usage allowance." $1 trial credit for 7 days; credit card required afterward; a personal organization's bill under $5/month is waived. Smallest Machine (`shared-cpu-1x`, 256 MB) is $2.19/month at 30 days running; dedicated IPv4 is $2/month (shared IPv4 is free). There is a Sao Paulo region (`gru`) in the region list (<https://fly.io/docs/reference/regions/>). Not free, but potentially $0 on the bill; the owner's call.
- **Not checked:** AWS, Azure, Hetzner and others; AWS and Azure free offers have changed in recent years and I did not read their current pages.

### 5.4 Where the app lives beside a media server

There are two layouts. Either the Svelte build (static files) plus a small signaling/state process run on the same VM behind a reverse proxy, in which case the app does not need Cloudflare at all, or the app stays on Cloudflare and only the media server runs on the VM. In the second layout the Cloudflare free-plan analysis in sections 1 and 2 applies unchanged.

---

## 6. Unverified or not tested

- CPU limit that applies to a Free-plan Durable Object invocation (10 ms per the Workers page vs 30 s default per the DO page).
- Whether SvelteKit's response pipeline preserves a 101 WebSocket upgrade response returned from a `+server.js` endpoint.
- Whether cross-Worker Durable Object calls via `script_name` are billed as one request.
- Whether the Cloudflare free sign-up asks for a payment method.
- Combined Svelte (non-Kit) + `@cloudflare/vite-plugin` project template; I did not build or run anything.
- Whether Oracle Always Free A1 capacity is available in the Brazil regions today, how strictly idle reclamation is enforced, and Google `e2-micro` machine specs.
- Real-world message rates for graeae. The usage table uses my assumptions; measuring a prototype is the way to confirm.
- Status of SvelteKit PR #17708 after 2026-11-14. It may merge soon, which would remove the two-Worker requirement.

## Sources (all read 2026-11-15)

Cloudflare:
- <https://developers.cloudflare.com/workers/platform/limits/>
- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>
- <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>
- <https://developers.cloudflare.com/workers/vite-plugin/>
- <https://developers.cloudflare.com/workers/framework-guides/web-apps/sveltekit/>
- <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>
- <https://developers.cloudflare.com/pages/>
- <https://developers.cloudflare.com/durable-objects/platform/pricing/>
- <https://developers.cloudflare.com/durable-objects/platform/limits/>
- <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/>
- <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>
- <https://developers.cloudflare.com/durable-objects/get-started/>
- <https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/>
- <https://developers.cloudflare.com/d1/platform/pricing/> and <https://developers.cloudflare.com/d1/platform/limits/>
- <https://developers.cloudflare.com/kv/platform/pricing/> and <https://developers.cloudflare.com/kv/platform/limits/>
- <https://developers.cloudflare.com/workers/platform/deploy-buttons/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/>
- <https://developers.cloudflare.com/workers/configuration/secrets/>
- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- <https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>

SvelteKit (sveltejs/kit repository):
- `documentation/docs/25-build-and-deploy/60-adapter-cloudflare.md`, `50-adapter-static.md`, `55-single-page-apps.md` (main branch)
- Issues and PRs: #17749, #17708, #17666, #1712, #1491, #12973 (GitHub API)
- npm registry dist-tags for `@sveltejs/kit`, `@sveltejs/adapter-cloudflare`, `@sveltejs/adapter-static`, `svelte`, `wrangler`, `@cloudflare/vite-plugin`

Alternatives:
- <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>, <https://www.oracle.com/cloud/free/>, <https://www.oracle.com/cloud/free/faq/>, <https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm>
- <https://docs.cloud.google.com/free/docs/free-cloud-features>
- <https://render.com/docs/free>
- <https://docs.fly.io/about/pricing>, <https://fly.io/docs/reference/regions/>
