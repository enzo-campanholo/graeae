# Media transport options

Type: research
Status: resolved
Branch: research/media-transport
Map: ../map.md

## Question

What are the realistic ways to carry the media between 4 to 6 friends in Brazil, and what does each cost at this group's usage?

Compare at least:

- Direct browser-to-browser connections with no media server, including what relay (TURN) it needs for members behind carrier-grade NAT and what that relay costs.
- Cloudflare's hosted media server (Realtime SFU, formerly Calls) and its TURN service.
- LiveKit Cloud's free tier.
- A self-hosted open-source media server (LiveKit, mediasoup or similar) on an always-free machine such as Oracle Cloud's, or on another low-cost host.
- Any other option that is plausibly free at this scale.

For each, report from primary sources: the free allowance and the price past it, limits that affect quality (bitrate caps, codec support, simulcast, participant limits), whether it has presence in or near Brazil (São Paulo), and the operational burden on a single owner.

Work out the monthly usage for a worked example and give the formula so the numbers can be changed. The example is an assumption, not a measurement: 60 hours a month, 2 screens at 8 Mbps each watched by 3 people, and 4 webcams at 1.5 Mbps each watched by 3 people. Also give the heavy case: 4 screens each watched by 5 people.

The answer feeds [Media transport choice](08-media-transport-choice.md).

## Answer

Full findings: `docs/research/media-transport.md`, with a calculator at `docs/research/media-transport-calc.sh`. Pricing pages were read on 2026-11-15.

Usage, where egress in GB is the sum over shares of bitrate (Mbps) times viewers, times hours, times 0.45:

- Worked example (60 hours, 2 screens at 8 Mbps and 4 webcams at 1.5 Mbps, 3 viewers each): 66 Mbps, 1,782 GB a month.
- Heavy case (60 hours, 4 screens and 6 webcams, 5 viewers each): 205 Mbps, 5,535 GB a month.

Cost in US dollars a month, worked example then heavy case:

| Option | Example | Heavy | Main limit |
|---|---|---|---|
| Direct browser-to-browser | 0 | 0 | Not feasible: a member sharing a screen and webcam uploads 28.5 Mbps in the example and 47.5 Mbps in the heavy case, against the assumed 20 Mbps |
| Direct plus Cloudflare TURN relay | 0 to 39.10 | 0 to 226.75 | Same upload problem; free only while under about 56% of media is relayed in the example |
| Cloudflare Realtime SFU | 39.10 | 226.75 | 1,000 GB free, then $0.05 per GB. Free up to roughly 34 hours a month at the example's load. H.264, H.265, VP8, VP9, AV1 and simulcast; no documented bitrate cap; present in Brazilian cities |
| Cloudflare RealtimeKit | 8.80 | 23.20 | Metered by participant-minute. Screen share defaults to 5fps, and 1080p60 is unverified |
| LiveKit Cloud free plan | unusable | unusable | Hard cap of 50 GB |
| LiveKit Cloud paid plan | 233.84 | 684.20 | $50 plan, then $0.12 per GB |
| Self-hosted media server on Oracle Always Free | 0 | 0 | 10,240 GB free from São Paulo. Only the Arm machine is viable. Highest operational burden; capacity in São Paulo, throughput and idle reclaim are unverified |
| Self-hosted on Linode or Vultr in São Paulo | 10 to 17 | 15 to 44 | Overage rates unverified |

Carrier-grade NAT among the group's ISPs is unverified. Daily, 100ms and Agora were not examined.

The cost is driven almost entirely by hours, bitrate and viewers per share, so the group's real hours and a more efficient codec (which lowers the bitrate) both move the result. Whether a free-plan Cloudflare account can go past the free allowance is unverified.
