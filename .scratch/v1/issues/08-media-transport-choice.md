# Media transport choice

Type: grilling
Status: resolved
Blocked by: 02, 03
Map: ../map.md

## Question

How does media travel between members: directly between browsers, or through a media server, and which one?

Inputs are [Capture and encoding quality](02-capture-and-encoding-quality.md) and [Media transport options](03-media-transport-options.md).

Decide:

- Direct connections or a media server. The user's intuition is that fully peer-to-peer is not the best option; test that against the research instead of assuming it.
- Which provider or software, and where it runs.
- Whether 4 simultaneous screens at 1080p60 fits, or whether 3 is the promise and 4 is best effort.
- The cost. If the best option is not free, bring the number to the user for the decision.

Unblocks [App hosting and framework](11-app-hosting-and-framework.md) and [Quality proof](13-quality-proof.md).

## Answer

Decided with the user on 2026-11-16. Facts marked unverified come from [Media transport options](03-media-transport-options.md) and a follow-up check of Cloudflare's and Oracle's docs read the same day.

- **Every share goes through a media server.** There is no direct browser-to-browser mode in v1. A direct design uploads one copy per viewer: a screen at 8 Mbps plus a webcam at 1.5 Mbps reaches 2 viewers inside the 20 Mbps upload floor, and 3 viewers need 28.5 Mbps. It also runs one encoder per viewer on the machine running the game. Through a media server the sharer uploads once, 9.5 Mbps.
- **The media server is Cloudflare Realtime SFU**, in the owner's existing Cloudflare account. It forwards packets without re-encoding, has sites in Brazilian cities, supports H.264, H.265, VP8, VP9 and AV1, and lets each viewer pick a quality layer of a share sent at several qualities. Scalable coding and any bitrate, resolution or frame-rate cap are undocumented.
- **Relay.** Cloudflare's TURN relay is free when used with the media server and draws on the same allowance, so members behind carrier-grade NAT are covered at no extra cost. Whether the group needs it is still unmeasured.
- **Usage the decision rests on.** The user's estimate is 30 hours a month, 1 screen and 1 webcam live, each watched by 3 people: about 385 GB a month, 38% of the free 1,000 GB. Egress in GB is the sum over shares of bitrate (Mbps) times viewers, times hours, times 0.45.
- **Cost.** $0 expected, and $0 up to about 2.6 times the estimate. Past 1,000 GB it is $0.05 per GB; a month like the research example (1,782 GB) would cost about $39. The user accepted this exposure.
- **Cloudflare has no spending cap for this product**, and no documented way to read the media server's monthly egress. So graeae enforces its own monthly usage budget: the backend counts watched media and stops or degrades watching at a limit the owner sets, defaulting to the free allowance. The details are for [Usage budget](14-usage-budget.md).
- **4 simultaneous screens at 1080p60 is the promise**, to be confirmed by [Quality proof](13-quality-proof.md). If a viewer cannot decode three other 1080p60 screens smoothly, the promise drops to 3. A night with 4 screens and 4 webcams, each watched by 3, uses about 51 GB an hour, so about 19 such hours fit in a free month.
- **One seam, one implementation.** The media layer sits behind a single seam so a self-hosted server could replace Cloudflare later. v1 builds only the Cloudflare one.

**Considered and not chosen.**

- A self-hosted media server on Oracle's free machine: $0 with 10,240 GB a month, but Oracle may reclaim an idle machine, sign-up needs a card for most people, and the upkeep falls on every deployer. It is the fallback if usage grows to several times the estimate.
- The owner's home server (a laptop on a home fibre line in São Paulo): no allowance to run out, but every watched share leaves through the home upload, reachability from the internet is unverified, and other deployers have no equivalent.
- LiveKit Cloud and Cloudflare RealtimeKit: the first is capped at 50 GB free and expensive past it; the second defaults screen shares to 5fps, and 1080p60 is unverified.

**Still unknown.** Whether the media server can be enabled with no payment method, and what happens past the allowance on such an account. [Cloudflare account check](15-cloudflare-account-check.md) finds out.

**Glossary.** No term added; the usage budget will be named in [Usage budget](14-usage-budget.md).
