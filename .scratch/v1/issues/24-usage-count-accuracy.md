# Usage count accuracy

Type: grilling
Status: resolved
Blocked by: 13
Map: ../map.md

## Question

How does graeae count watched bytes so its usage figure never reads more than 5% below Cloudflare's?

[Usage budget](14-usage-budget.md) set that limit. In [Quality proof](13-quality-proof.md) the prototype's count read 6% (transport-level bytes) to 8% (RTP bytes) below Cloudflare's egress over 2.41 GB, while ingress matched within 1%. The prototype skipped the first 2 seconds of every watch, roughly 3% here.

Decide which browser statistic is counted (payload, RTP with headers, or the transport's bytes received), how the start of a watch and gaps are charged, whether a fixed safety margin is added on top, and whether the build must repeat the comparison against the Analytics tab before the figure is trusted.

## Comments

**From [Relay and credential life](23-relay-and-credential-life.md), 2026-11-16.** Relayed watching stays counted twice and the relay gets no other allowance. Cloudflare's FAQ says only relay-to-browser traffic is billed, not traffic between the relay and the media server, so the doubling may be dropped here once it is checked against the real bill.

## Answer

Decided with the user on 2026-11-16.

- **What is counted.** Each tab reports the transport's bytes received (`bytesReceived` on the `transport` statistic) for its one media connection. That covers everything the media server sent the tab: video, audio, retransmissions, probing and control packets. Usage is therefore counted per connection, not per watch; a per-share breakdown would need a second figure. A tab that only shares adds its few kilobytes of control traffic.
- **Start of a watch.** The tab reports the running total since the connection opened, and the backend charges the difference between reports. Nothing is skipped at the start, and a lost report is made up by the next one.
- **Gaps.** The maximum-bitrate charge from [Usage budget](14-usage-budget.md) applies only where no later total arrives (a closed or crashed tab): from the last report until the backend records the watch as ended. A connection restart resets the total, so the tab sends a final total before restarting.
- **Safety margin.** The backend adds a fixed 5% to every reported byte. It is a constant in the code, not an owner setting. Without it the count is expected to read about 3% low (an estimate); with it, about 2% above Cloudflare's. Watching therefore stops at roughly 950 GB of real usage on a 1,000 GB budget if the count turns out exact, and nearer 980 GB if the estimate holds.
- **The comparison is repeated in the build.** Before the usage figure is called trusted, the owner runs one real session of at least 2 GB on the built app and reads Cloudflare's egress for the same period on the Analytics tab. Reading 0 to 10% above Cloudflare's passes. Outside that, the margin is changed and the comparison run again. Until it passes, the README says the count is unverified.
- **Relayed watching** stays counted twice in v1. The same comparison reads the relay's analytics; if relayed watching is billed once, as Cloudflare's FAQ suggests, the doubling is dropped then.

**Not established.** Why the transport figure still reads about 3% low once the start is counted. A guess: Cloudflare counts IP and UDP headers (28 bytes a packet, about 2.5% here), which no browser statistic includes. The prototype's log has no packet counts, so this was not tested. The 5% margin does not depend on it.

**Glossary.** No change: Usage and Usage budget stand as defined.

**No ADR.** The statistic and the margin are both easy to change.

**Follow-ons.** Notes added to [Usage budget](14-usage-budget.md) and [Signaling and room state](18-signaling-and-room-state.md). The build comparison joins Spec assembly on the map.
