# Media transport options for graeae

Ticket: what are the realistic ways to carry screens and webcams between 4 to 6 friends in Brazil, and what does each cost at this group's usage?

- Research date: **2026-11-15**. Every price and limit below was read from the owner's source on that date. Where a page shows its own "last updated" stamp, it is given.
- This file reports numbers. It does not choose, and it does not decide any spending.
- Marks: **[raw]** means I read the page's raw text or a first-party API. **[summarised]** means a page-summarising tool read it and I did not re-read the raw page. **[unverified]** means I could not confirm it from a primary source.
- Arithmetic is in [`media-transport-calc.sh`](./media-transport-calc.sh) (bash + awk, no other dependencies). Its output is in section 3, and I checked the two bandwidth totals by hand.

## 1. Summary

Cost per month in USD, for the two cases the ticket defined. The assumptions are in section 2.

| Option | Worked example (4 people) | Heavy case (6 people) | Main quality limit | Brazil presence |
|---|---|---|---|---|
| Browser-to-browser mesh, no media server | $0 server cost, but **not feasible at the target bitrates**: a member sharing a screen and webcam must upload 28.5 Mbps, above the assumed 20 Mbps | Needs 47.5 Mbps of upload per such member | Upload of each member (it multiplies with viewers) | Not applicable (no server) |
| Mesh + Cloudflare TURN (relay only for failed direct paths) | $0 up to 56.1% of media relayed; $39.10 if 100% relayed | $0 up to 18.1% relayed; $19.19 at 25%; $88.38 at 50%; $226.75 at 100% | Same upload problem as the mesh; TURN drops packets above about 50 to 100 Mbps per client | Anycast, nearest Cloudflare site (Cloudflare lists many Brazilian cities) |
| Cloudflare Realtime SFU | $39.10 | $226.75 | No bitrate cap is documented; H.264, H.265, VP8, VP9 and AV1 are listed; simulcast supported | Anycast, runs at the Cloudflare site nearest each client |
| Cloudflare RealtimeKit | $8.80 | $23.20 | Screen share defaults to 5 FPS; 1080p60 screen share is not documented [unverified]; no codec list | Same Cloudflare network |
| LiveKit Cloud, free Build plan | **Unusable**: hard cap of 5,000 minutes and 50 GB; the example needs 14,400 minutes and 1,782 GB | **Unusable** (21,600 minutes, 5,535 GB) | Hard cap, no overage allowed | São Paulo hostnames appear in its firewall doc |
| LiveKit Cloud, Ship plan ($50) | $233.84 | $684.20 | None documented beyond usage | São Paulo hostnames appear in its firewall doc |
| LiveKit server on Oracle Always Free (São Paulo) | $0 (17.4% of the free transfer) | $0 (54.1% of the free transfer) | Your own CPU and the VM's network; the 1 GB micro VMs are capped at 50 Mbps | Oracle has São Paulo (`sa-saopaulo-1`) and Vinhedo (`sa-vinhedo-1`) regions |
| LiveKit or mediasoup on Linode São Paulo | $12.47 (Nanode 1 GB) or $16.80 (2 GB) | $38.75 (Nanode 1 GB) to $44.34 (4 GB) | Shared vCPU on the small plans [unverified at this load] | Linode `br-gru` São Paulo |
| Vultr São Paulo | $10 (1 vCPU / 2 GB, 2,048 GB included) | At least $15, plus overage on 2,463 GB at a rate I did not verify | Same | Vultr `sao` |

Three findings stand out:

1. **Server egress is what costs money.** One watcher of one stream is one copy. The 60 hours produce 1,782 GB in the example and 5,535 GB in the heavy case.
2. **The per-GB hosted options differ a lot.** Cloudflare's SFU charges $0.05 per GB after 1,000 free GB. LiveKit Cloud charges $0.12 per GB after 250 free GB. The Oracle free tier gives 10,240 GB free from a São Paulo region and charges $0.025 per GB after that.
3. **RealtimeKit bills by participant-minute, not by gigabyte.** On paper it is the cheapest hosted option, but I could not confirm that it carries no separate transfer charge or that it supports the target quality.

## 2. Usage model and formulas

These are assumptions, not measurements. Change them and re-run the script.

Symbols:

- `H` = hours per month, all streams running the whole time.
- `S` = screens shared, at `rS` Mbps each, each watched by `vS` viewers.
- `C` = webcams shared, at `rC` Mbps each, each watched by `vC` viewers.
- `N` = people connected to the session.
- 1 GB = 1,000 MB (decimal). Providers do not all define the gigabyte, so a few percent of error is possible [unverified].

Formulas:

```
server egress (Mbps)   = S*rS*vS + C*rC*vC
egress GB/month        = H * 3600 * egress_Mbps / 8 / 1000
publisher ingress Mbps = S*rS + C*rC
participant minutes    = N * H * 60
P2P mesh upload per member = rS*vS + rC*vC   (screen + webcam)
SFU upload per member      = rS + rC
```

| | Worked example | Heavy case |
|---|---|---|
| Hours | 60 | 60 |
| Screens | 2 at 8 Mbps, 3 viewers each | 4 at 8 Mbps, 5 viewers each |
| Webcams | 4 at 1.5 Mbps, 3 viewers each | 6 at 1.5 Mbps, 5 viewers each |
| People connected (`N`) | 4 (assumed: viewers + 1) | 6 (assumed: viewers + 1) |
| Egress | 66 Mbps, **1,782 GB** | 205 Mbps, **5,535 GB** |
| Publisher ingress | 22 Mbps, 594 GB | 41 Mbps, 1,107 GB |
| Participant minutes | 14,400 | 21,600 |
| Upload per member, mesh (screen + cam) | 28.5 Mbps | 47.5 Mbps |
| Upload per member, with an SFU | 9.5 Mbps | 9.5 Mbps |
| Download per member watching everything | 20.5 Mbps | 39.5 Mbps |

The mesh limit follows directly: with 20 Mbps of upload, a member can send one 8 Mbps screen plus one 1.5 Mbps webcam to at most 2 viewers (19 Mbps). With 3 or more viewers the mesh needs lower bitrates or simulcast layers per receiver.

Cost formulas, in USD, per option (`GB` = egress GB, `min` = participant minutes):

```
Cloudflare SFU or TURN   = 0.05 * max(0, GB - 1000)
Mesh + Cloudflare TURN   = 0.05 * max(0, p*GB - 1000)        p = share of media relayed
RealtimeKit (A/V)        = 0.002 * max(0, min - 10000)
LiveKit Build            = 0 until 5,000 min or 50 GB; then requests fail (no overage)
LiveKit Ship             = 50 + 0.0005*max(0, min - 150000) + 0.12*max(0, GB - 250)
Oracle Always Free (SA)  = 0.025 * max(0, GB - 10240)
Linode São Paulo         = plan price + 0.007 * max(0, GB - pool)      (rate unverified, see 4.5)
```

## 3. Script output

Produced by `bash docs/research/media-transport-calc.sh` on 2026-11-15. The Cloudflare SFU line is billed on egress only, since publishing into Cloudflare is free.

```
=== WORKED EXAMPLE ===
server egress to viewers : 66.0 Mbps  -> 1782.0 GB/month
publisher ingress        : 22.0 Mbps  -> 594.0 GB/month
participant minutes      : 14400
member upload, P2P mesh  : 28.5 Mbps (screen+cam), 4.5 Mbps (cam only)   [assumed ceiling: 20 Mbps]
member upload, with SFU  : 9.5 Mbps (screen+cam)
member download (watches all other streams): 20.5 Mbps
Cloudflare Realtime SFU           : 39.10   (782.0 GB billable of 1782.0)
P2P + Cloudflare TURN,  10% relayed : 0.00   (178.2 GB relayed)
P2P + Cloudflare TURN,  25% relayed : 0.00   (445.5 GB relayed)
P2P + Cloudflare TURN,  50% relayed : 0.00   (891.0 GB relayed)
P2P + Cloudflare TURN, 100% relayed : 39.10   (1782.0 GB relayed)
  break-even relayed share before any charge: 56.1%
  Metered Open Relay free 20 GB covers a relayed share of: 1.12%
Cloudflare RealtimeKit            : 8.80   (4400 billable minutes)
LiveKit Cloud Build (free)        : NOT USABLE  minutes 14400 / 5000 = 288%, downstream 1782.0 GB / 50 GB = 3564%
LiveKit Cloud Ship ($50 plan)     : 233.84   (minutes 0.00 + data 183.84 over 250 GB, base 50)
Oracle Always Free (Sao Paulo)    : 0.00   (egress 1782.0 GB vs 10240 GB free; 17.4% of allowance)
Linode Sao Paulo Nanode 1GB  $7.00 (1000 GB pool)  : 12.47
Linode Sao Paulo 2GB        $16.80 (2000 GB pool)  : 16.80
Linode Sao Paulo 4GB        $33.60 (4000 GB pool)  : 33.60
Vultr Sao Paulo 1c/1GB  $5  (1024 GB pool): excess 758.0 GB at unverified overage rate
Vultr Sao Paulo 1c/2GB $10  (2048 GB pool): excess 0.0 GB at unverified overage rate
Vultr Sao Paulo 2c/2GB $15  (3072 GB pool): excess 0.0 GB at unverified overage rate

=== HEAVY CASE ===
server egress to viewers : 205.0 Mbps  -> 5535.0 GB/month
publisher ingress        : 41.0 Mbps  -> 1107.0 GB/month
participant minutes      : 21600
member upload, P2P mesh  : 47.5 Mbps (screen+cam), 7.5 Mbps (cam only)   [assumed ceiling: 20 Mbps]
member upload, with SFU  : 9.5 Mbps (screen+cam)
member download (watches all other streams): 39.5 Mbps
Cloudflare Realtime SFU           : 226.75   (4535.0 GB billable of 5535.0)
P2P + Cloudflare TURN,  10% relayed : 0.00   (553.5 GB relayed)
P2P + Cloudflare TURN,  25% relayed : 19.19   (1383.8 GB relayed)
P2P + Cloudflare TURN,  50% relayed : 88.38   (2767.5 GB relayed)
P2P + Cloudflare TURN, 100% relayed : 226.75   (5535.0 GB relayed)
  break-even relayed share before any charge: 18.1%
  Metered Open Relay free 20 GB covers a relayed share of: 0.36%
Cloudflare RealtimeKit            : 23.20   (11600 billable minutes)
LiveKit Cloud Build (free)        : NOT USABLE  minutes 21600 / 5000 = 432%, downstream 5535.0 GB / 50 GB = 11070%
LiveKit Cloud Ship ($50 plan)     : 684.20   (minutes 0.00 + data 634.20 over 250 GB, base 50)
Oracle Always Free (Sao Paulo)    : 0.00   (egress 5535.0 GB vs 10240 GB free; 54.1% of allowance)
Linode Sao Paulo Nanode 1GB  $7.00 (1000 GB pool)  : 38.75
Linode Sao Paulo 2GB        $16.80 (2000 GB pool)  : 41.55
Linode Sao Paulo 4GB        $33.60 (4000 GB pool)  : 44.34
Vultr Sao Paulo 1c/1GB  $5  (1024 GB pool): excess 4511.0 GB at unverified overage rate
Vultr Sao Paulo 1c/2GB $10  (2048 GB pool): excess 3487.0 GB at unverified overage rate
Vultr Sao Paulo 2c/2GB $15  (3072 GB pool): excess 2463.0 GB at unverified overage rate
```

Hand check: 66 Mbps × 216,000 s ÷ 8 ÷ 1,000 = 1,782 GB; 205 Mbps gives 5,535 GB.

Two sensitivity notes. First, opt-in watching is what the egress figure rewards: egress scales with the number of viewers, not with the number of streams published. Second, nobody watches every stream for all 60 hours in practice, so the figures are upper bounds for the stated viewer counts.

## 4. Options in detail

### 4.1 Direct browser-to-browser (mesh), with TURN for the failures

**How it works.** Each publisher sends a separate copy of each stream to each viewer, so there is no media server. A signalling channel is still needed to exchange connection offers. On the owner's stack that is a Worker, which the free Workers plan allows: 100,000 requests per day and 10 ms of CPU per request [summarised, developers.cloudflare.com/workers/platform/limits/]. Durable Objects limits on the free plan were not covered by that page [unverified].

**Cost at this scale.**
- No server cost for paths that connect directly.
- Upload is the real limit. At the stated bitrates a member sharing a screen and webcam to 3 viewers uploads 28.5 Mbps; to 5 viewers, 47.5 Mbps (section 2). Both exceed the assumed 20 Mbps upload. The mesh only works if bitrates or viewer counts drop.
- Relay (TURN) cost applies only to the share of paths that fail to connect directly. A relayed mesh stream costs the same bytes as an SFU copy, so the formula is the one above with `p` as the relayed share.

**Carrier-grade NAT.** The owner's premise is that CGNAT is common on Brazilian ISPs. I did not find a primary source measuring this [unverified]. Two related, verified figures:
- APNIC Labs measured **60.68% of Brazilian samples as IPv6-capable on 2026-11-14** (58.64% preferring IPv6) [raw, stats.labs.apnic.net/ipv6/BR]. Two members who both have working IPv6 do not need a relay. The group can check this itself.
- What fraction of the group's pairs would need TURN is unknown [unverified]. It depends on each ISP's NAT behaviour.

**TURN options and their prices.**

| TURN service | Free allowance | Price after | Metering |
|---|---|---|---|
| Cloudflare Realtime TURN | 1,000 GB per month, shared with the SFU | $0.05 per GB | Data sent from Cloudflare to the TURN client; ingress is free [raw, developers.cloudflare.com/realtime/turn/faq/ and /realtime/sfu/platform/pricing/] |
| Cloudflare STUN (`stun.cloudflare.com`) | Unlimited | Free | Not metered [raw] |
| Metered Open Relay | 20 GB per month | Not on the page; the paid service price is on another page I did not read [unverified] | GB of TURN usage [summarised, metered.ca/tools/openrelay/]; terms for production use not read [unverified] |
| Self-hosted coturn on Oracle Always Free | 10,240 GB per month of egress | $0.025 per GB after | Oracle egress (see 4.4); coturn is a separate project whose licence GitHub reports as `NOASSERTION` [raw, api.github.com]; I did not read its licence text |

**Cloudflare TURN details** [raw, FAQ read 2026-11-15, page updated Jul 14, 2026]:
- Allocations are homed in the nearest Cloudflare site via anycast. Credentials last up to 48 hours.
- Throughput above about 50 to 100 Mbps from one client, or above 5 to 10 kpps, may be dropped. That is above the 28.5 Mbps case here but is close to a 47.5 Mbps case.
- Relay addresses are IPv4 only. RFC 6062 (TCP relaying) is not implemented. TURN over TLS is supported.
- TURN-to-SFU traffic is not billed twice.

**Operational burden.** Low for the transport itself, but the app must implement the mesh and signalling, handle per-peer bitrate adaptation, and detect when a direct path fails. The mesh is the least scalable choice at the heavy case.

### 4.2 Cloudflare Realtime SFU, TURN and RealtimeKit

Primary sources: developers.cloudflare.com/realtime/ pages listed in section 6.

**SFU price and metering** [raw; pricing page updated Sep 22, 2026]:
- "The SFU and TURN services cost $0.05 per GB of egress." "The first 1,000 GB each month is free," shared between SFU and TURN.
- Billing counts data sent from Cloudflare to clients. "Traffic published into Cloudflare is free, including when no client subscribes to that publication."
- Usage appears as one line on the Cloudflare bill. Whether a Free-plan account can exceed the free allowance without adding a payment method or a paid plan is not stated on these pages [unverified].

**Limits that affect quality** [raw; limits page updated Nov 13, 2026]:
- Codecs: video H.264, H.265, VP8, VP9 and AV1; audio Opus and G.711.
- Request rate 50 per second per session; up to 64 tracks per API request; no fixed upper bound on tracks per session.
- Simulcast is supported. The publisher advertises layers; each subscriber picks one with `preferredRid`. The defaults for `priorityOrdering` and `ridNotAvailable` are `none`, so there is no automatic fallback unless the app opts in [summarised, /realtime/sfu/simulcast/].
- **No bitrate cap, no per-session participant cap and no hard quality limit is documented.** The pages do not say whether 8 Mbps video is accepted without limits [unverified]. Capture-side limits belong to another ticket.

**Brazil presence.** The SFU runs on every Cloudflare site and clients attach to the nearest one over anycast; the application does not choose a region [raw, blog.cloudflare.com/cloudflare-calls-anycast-webrtc/, published 2024-04-04, modified 2026-07-15]. Cloudflare's network page lists many Brazilian cities, including São Paulo [raw, cloudflare.com/network, 2026-11-15]. I have no measurement of the round-trip time from a Brazilian ISP to the serving site [unverified]. A Brazilian-to-Brazilian stream still crosses only the Cloudflare network; whether it stays in Brazil is not stated.

**RealtimeKit** [raw; pricing page read 2026-11-15]:
- Metered in participant minutes. Audio/video participant: 10,000 minutes free per month, then $0.002 per minute. Audio-only: 10,000 free, then $0.0005 per minute. The included usage applies to Free and Enterprise accounts alike.
- The FAQ says the participant "is still billed when they do not produce or consume audio or video," and each browser tab is billed separately.
- It is a higher-level product with prebuilt UI and room, preset and role concepts. The pricing page states that "Realtime SFU, MoQ Relay, and TURN usage is measured in GB of egress," and lists only minutes for RealtimeKit participants. I read that as no separate GB charge for RealtimeKit participants, but no page says so outright [unverified].
- Screen share frame rate defaults to **5 FPS**; the FAQ advises "<= 30" for group calls and says it can be configured. Whether 1080p at 60 fps works is not documented on the pages I read [unverified]. The best-practices page speaks of 1080p at 24 FPS and gives 3.5 to 14 Mbps.
- Whether RealtimeKit lets a viewer decline a stream (the opt-in rule) was not checked [unverified].

**Operational burden.** Lowest of the hosted options: no servers. The owner needs a Cloudflare account, a Worker that holds the SFU App Secret and creates sessions, and signalling. A stranger deploying from the README needs their own Cloudflare account and the same steps; whether payment details are required past the free allowance is unverified.

### 4.3 LiveKit Cloud

Primary sources: livekit.com/pricing and docs.livekit.io pages in section 6.

**Free (Build) plan** [raw; quotas page rendered 2026-11-15]:
- 5,000 WebRTC participant minutes and 50 GB downstream data transfer per month.
- "For projects on the free Build plan, the included allowance acts as a hard cap. After you exceed it, new requests fail rather than incurring overage charges." Free projects share allowances across all of a user's free projects, so extra projects do not add allowance.
- 100 connected participants; 100 video and 100 audio track subscriptions per participant.
- **It cannot carry this group.** The worked example would use 288% of the minutes and 3,564% of the downstream data.

**Paid plans** [raw; livekit.com/pricing read 2026-11-15; Ship price [summarised]]:

| Plan | Price | WebRTC minutes | Downstream data |
|---|---|---|---|
| Build | $0 | 5,000 included | 50 GB included |
| Ship | from $50 per month | 150,000 included, then $0.0005 per minute | 250 GB included, then $0.12 per GB |
| Scale | from $500 per month | 1.5M included, then $0.0004 per minute | 3 TB included, then $0.10 per GB |

- Metering [raw, docs.livekit.io/home/cloud/billing.md]: WebRTC minutes are "time an end user spends connected to our network via WebRTC", billed per second with a 10-second minimum per session; data transfer is metered in GB with a 0.01 GB increment, rounded up.
- Codecs: H.264, VP8, VP9 (with SVC) and AV1 (with SVC); simulcast is supported, and VP9 and AV1 use SVC `L3T3_KEY` by default [raw, docs.livekit.io/transport/media/advanced.md]. A bitrate cap is set per track by the app, not by the platform.
- Brazil presence: the realtime region list (updated 2026-10-25) has no Brazil or South America group, and region pinning needs the Scale plan [raw]. But the firewall page lists `*.osaopaulo1a.production.livekit.cloud` and `*.osaopaulo1b.production.livekit.cloud` among the media hostnames, and the SIP list names São Paulo [raw, docs.livekit.io/deploy/admin/firewall.md and /regions/endpoints.md]. I read this as a São Paulo presence, but no page states it as a media region outright, so treat it as an inference [unverified].
- Operational burden: none for servers; an API key and token-minting endpoint (a Worker) are needed.

### 4.4 Self-hosted open-source SFU on Oracle Cloud Always Free

Primary sources: docs.oracle.com Always Free page [summarised], Oracle price list and price API [raw], and the LiveKit self-hosting docs [raw].

**Oracle regions.** Brazil East (São Paulo) `sa-saopaulo-1` (key GRU) and Brazil Southeast (Vinhedo) `sa-vinhedo-1` (key VCP) are both in the commercial realm, each with one availability domain [summarised, docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm].

**Always Free compute** [summarised, docs.oracle.com Always Free page]:
- Arm `VM.Standard.A1.Flex`: 1,500 OCPU hours and 9,000 GB hours per month, equal to **2 OCPUs and 12 GB** memory, as one VM or up to two. Two AMD micro VMs (`VM.Standard.E2.1.Micro`, 1/8 OCPU, 1 GB) with **up to 50 Mbps** over the internet.
- Always Free instances must be created in the **home region** chosen at sign-up. I did not find how a home region is changed [unverified].
- "Idle Always Free compute instances may be reclaimed by Oracle" if over 7 days CPU p95 is below 20% and network below 20% (and memory below 20% on A1). A mostly idle friends' server fits that pattern. Oracle says upgrading to Pay As You Go removes the reclaim rule for free resources and charges only past the free limits [summarised]; I did not verify that sentence against the raw page.
- "Out of host capacity" errors on the free shapes are possible. I could not check current A1 availability in São Paulo [unverified].

**Egress** [raw, Oracle price list and public price API `lastUpdated` 2026-11-02, part B93455]:
- "Outbound Data Transfer - Originating in APAC, Japan and South America": **first 10 TB (10,240 GB) per month free**, then **$0.025 per GB**. North America, Europe and the UK have the same first 10 TB free. Middle East and Africa pay $0.05 over 10 TB.
- The Always Free page states "10 TB per month of outbound data" [summarised].
- The example uses 17.4% of that allowance and the heavy case 54.1%.
- **The 1 GB micro VMs cannot carry the load**: their internet bandwidth is capped at 50 Mbps, below the 66 Mbps of the example. The A1 shape lists 1 Gbps of VCN bandwidth per OCPU [raw, compute shapes page]; the cap on internet traffic for A1 is not stated [unverified].

**Server software.**

| | LiveKit server | mediasoup | coturn |
|---|---|---|---|
| Licence (GitHub API) | Apache-2.0 | ISC | `NOASSERTION` (unverified) |
| Latest release seen | v1.13.11 (2026-10-25) | rust-0.33.2 (2026-11-04) | not checked |
| Is a complete server | Yes: signalling, rooms, TURN | A library: you write signalling and room logic | TURN only |
| Codecs and simulcast | H.264, VP8, VP9/AV1 with SVC; simulcast | Site says "simulcast, SVC, transport BWE"; codec list not read [unverified] | n/a |

- LiveKit's own docs: scalability is "bound by CPU and bandwidth" and the recommended production machine is on 10 Gbps Ethernet. Its benchmark ran on a 16-core x86 Google Cloud `c2-standard-16` and forwarded 531 MBps (about 4.2 Gbps) in a 3,000-viewer test at 92% CPU [raw, docs.livekit.io/transport/self-hosting/benchmark.md]. The heavy case here needs about 205 Mbps. No benchmark on a 2-OCPU Arm machine was found [unverified]; the comparison above is a ratio, not a measurement.
- LiveKit's VM guide uses Docker Compose, Caddy and Let's Encrypt, a domain you own and subdomains for the server and TURN. Ports: 443 (HTTPS and TURN/TLS), 7881 TCP, 3478 UDP, and 50000 to 60000 UDP (or a smaller range) [raw, docs.livekit.io/transport/self-hosting/vm.md and /deployment.md]. It was tested on Ubuntu and Amazon Linux. Whether the images run on Arm64 was not checked [unverified].
- Cloudflare DNS can point a subdomain to the VM's address; Cloudflare's proxy cannot carry the UDP media, so that record needs to be DNS-only [unverified; not read in a primary source].

**Operational burden.** Highest of the options: OS updates, certificates, a firewall, monitoring, and recovery if Oracle reclaims or loses the instance. Single machine, single region. A stranger deploying from the README also needs an Oracle account (Oracle typically verifies a card; not confirmed here [unverified]), a choice of home region at sign-up, and possible capacity retries.

### 4.5 Other low-cost hosts in São Paulo

| Host | Plan | Price | Included transfer | Overage |
|---|---|---|---|---|
| Akamai/Linode `br-gru` | Nanode 1 GB | $7.00 | 1,000 GB | $0.007 per GB [unverified: from a search summary of Akamai's docs; the docs page text I fetched did not state the rate] |
| Akamai/Linode `br-gru` | 2 GB | $16.80 | 2,000 GB | same |
| Akamai/Linode `br-gru` | 4 GB, 2 vCPU | $33.60 | 4,000 GB | same |
| Vultr `sao` | 1 vCPU, 1 GB | $5 | 1,024 GB | not verified |
| Vultr `sao` | 1 vCPU, 2 GB | $10 | 2,048 GB | not verified |
| Vultr `sao` | 2 vCPU, 2 GB | $15 | 3,072 GB | not verified |

Prices and pools come from the providers' public APIs, read 2026-11-15 [raw, api.linode.com/v4 and api.vultr.com/v2]. Akamai's docs note that São Paulo may track transfer in its own regional pool, separate from the global pool [raw, techdocs.akamai.com network-transfer-usage-and-costs]; whether the listed `transfer` figure is the São Paulo pool was not confirmed [unverified]. The Vultr bandwidth number is the plan-level figure and may differ in São Paulo [unverified]. AWS Lightsail, Magalu Cloud and other Brazilian hosts were not priced. Hetzner and DigitalOcean were not checked for a São Paulo site.

The same software choices apply as in 4.4. The monthly fee is the main cost difference.

### 4.6 Other plausible free options

- **Cloudflare STUN** is free and unlimited, and Google-run public STUN servers exist; both only help direct paths.
- **Metered Open Relay** TURN: 20 GB free per month, which covers only 1.12% (example) or 0.36% (heavy) of a fully relayed mesh. Production terms were not read.
- Other hosted video platforms with free minutes (Daily, 100ms, Agora and similar) were not examined; this ticket's scope was the five listed options. Adding them would need their own price and cap reading.
- A **hybrid** (mesh for pairs that connect directly, an SFU only for the rest) would lower egress but adds engineering; I did not price it.

## 5. What is unverified

- Whether CGNAT is common among the owner's friends' ISPs, and what share of pairs would need TURN.
- Cloudflare SFU: any bitrate or quality cap; whether a Free-plan account can exceed 1,000 GB without a paid plan or payment method; real round-trip time from Brazilian ISPs to the serving site.
- RealtimeKit: whether it has no separate transfer charge; whether it supports 1080p60 screen share; whether viewers can opt out of streams.
- LiveKit Cloud: that São Paulo is a media region (inferred from hostnames); the Ship $50 figure was read through a summariser only.
- Oracle: A1 capacity in São Paulo now; whether the internet bandwidth of A1 shapes is capped; whether 2 OCPU Arm can forward 205 Mbps with LiveKit (no benchmark found); idle-reclaim rules after upgrading, and home-region changes (the Always Free page was read through a summariser).
- Linode São Paulo overage rate and pool; Vultr overage rate and São Paulo pool.
- Metered Open Relay's paid price and production-use terms; coturn's licence text.
- That Cloudflare's proxy cannot be used for the UDP media on a self-hosted server.

## 6. Sources, all read 2026-11-15

Cloudflare (developers.cloudflare.com):
- `/realtime/sfu/platform/pricing/` (updated Sep 22, 2026) [raw]
- `/realtime/sfu/platform/limits/` (updated Nov 13, 2026) [raw]
- `/realtime/turn/faq/` (updated Jul 14, 2026) [raw]
- `/realtime/realtimekit/pricing/` and `/realtime/realtimekit/faq/` [raw]; `/realtime/realtimekit/best-practices/video-and-simulcast/` (updated Jun 12, 2026) [raw]
- `/realtime/sfu/simulcast/`, `/realtime/sfu/introduction/`, `/workers/platform/limits/` [summarised]
- `blog.cloudflare.com/cloudflare-calls-anycast-webrtc/` [summarised]; `cloudflare.com/network/` [raw]

LiveKit:
- `livekit.com/pricing` [raw for minutes and data rows, summarised for plan prices]
- `docs.livekit.io/home/cloud/quotas-and-limits.md`, `/home/cloud/billing.md`, `/deploy/admin/regions/endpoints.md`, `/deploy/admin/firewall.md`, `/transport/media/advanced.md`, `/transport/self-hosting/benchmark.md`, `/transport/self-hosting/vm.md` [raw]; `/transport/self-hosting/deployment.md` [summarised]

Oracle:
- `docs.oracle.com/.../freetier_topic-Always_Free_Resources.htm` and `.../regions.htm` [summarised]
- `oracle.com/cloud/networking/pricing/` and `apexapps.oracle.com/pls/apex/cetools/api/v1/products/?partNumber=B93455` (`lastUpdated` 2026-11-02) [raw]; compute shapes page [raw]

Other:
- `api.linode.com/v4/regions`, `/v4/linode/types`; `api.vultr.com/v2/regions`, `/v2/plans` [raw]
- `techdocs.akamai.com/cloud-computing/docs/network-transfer-usage-and-costs` [raw]
- `stats.labs.apnic.net/ipv6/BR` [raw]
- `metered.ca/tools/openrelay/` [summarised]
- `api.github.com/repos/livekit/livekit`, `versatica/mediasoup`, `coturn/coturn` [raw]; `mediasoup.org` [raw]
