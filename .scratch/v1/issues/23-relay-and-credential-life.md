# Relay and credential life

Type: grilling
Status: resolved
Blocked by: 13
Map: ../map.md

## Question

How does graeae use Cloudflare's relay, and how long does a relay credential live, now that revoking one is known not to work as a cut-off?

From [Quality proof](13-quality-proof.md): one member's browser only connects through the relay over TCP, and the relay carries 1080p60 at 12 Mbps; a forced track close stops a picture in under half a second, direct or relayed; revoking a credential left a relay in use running for 68 seconds to over 2 minutes, and the revoked credential still opened new relays 4 minutes later.

[Media layer records and relay credentials](20-media-layer-records-and-relay-credentials.md) gave each device a 24-hour credential, revoked on removal. Decide:

- Whether that 24-hour life stands or shortens, and how a credential is renewed for a tab that stays open.
- What a removed device can still do with a live credential (the relay only reaches Cloudflare's media server, or anywhere?), and whether that needs any defence beyond expiry.
- Whether revocation is still called at all.
- Whether the relay is always offered or only on failure, and whether relay traffic, which shares the 1,000 GB pool but is invisible to graeae's count, needs an allowance in the usage budget.

## Answer

Settled by grilling on 2026-11-16. This replaces the "Relay credentials" section and the revocation column and step of [Media layer records and relay credentials](20-media-layer-records-and-relay-credentials.md); the rest of that answer stands.

**How the relay is used**

- Every media connection is offered the relay from the start, over UDP, TCP and TLS. The browser picks a direct path when one works. The relay is never held back until a direct attempt fails, because the member who needs it would wait out that failure on every entry.

**Credentials**

- The backend mints a fresh credential each time a tab makes its media connection and hands it to that tab. It keeps no record of it. There is no per-device credential and nothing is shared between tabs.
- A credential lasts 12 hours from when it is minted. A tab that reconnects after a drop makes a new media connection and so gets a new credential with a new 12 hours.
- Renewal, at 11 hours: a tab on a direct path is silently handed a fresh credential. A tab on the relay gets a connection restart with the fresh credential; if the restart fails, it goes through the existing reconnect path from [Signaling and room state](18-signaling-and-room-state.md) (the "reconnecting" mark, shares and watching restored).

**Revocation**

- Never called. It took 68 seconds to over 2 minutes to stop a relay in use and never stopped a revoked credential opening new relays. The forced close is the only cut-off; expiry is the only end of a credential.
- The cut-off routine loses its "revoke relay credentials" step and the cut-off table its last column.

**What a removed device can still do**

- Until its credential expires, at most 12 hours, it can relay unrelated UDP traffic to public IPv4 addresses through the owner's account, drawing on the shared 1,000 GB pool and then $0.05 per GB. It cannot share, watch or reach the media server. A current member can do the same for as long as they are a member; that was already accepted.
- Defence: expiry and the owner's $10 Cloudflare billing alert, nothing more. The README names one emergency stop, replacing the relay key in the dashboard and redeploying, and says it is unverified that this ends credentials already issued.

**Usage budget**

- No separate allowance for the relay. Relayed watching stays counted twice, as [Usage budget](14-usage-budget.md) set. Cloudflare's FAQ says only relay-to-browser traffic is billed and traffic between the relay and the media server is not, so the doubling is probably too cautious; [Usage count accuracy](24-usage-count-accuracy.md) settles it against the real bill. With one relayed member in four it adds roughly 140 GB to the 547 GB estimate.
- A relayed sharer's upload is not billed and not counted. Traffic from a copied-out credential stays outside the budget.

**Unmeasured.** Whether an expired credential cuts a relay in use (documented as "after a short delay"), and whether a connection restart with a fresh credential passes through the media server without a visible blip. Both are added to [Remaining browser checks](21-remaining-browser-checks.md). Neither reopens the 12 hours: if the restart does not work, a relayed tab reconnects at 11 hours and the spec says so.

**Glossary.** No change.

**No ADR.** Nothing here is hard to reverse.
