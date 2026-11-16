# Usage budget

Type: grilling
Status: resolved
Blocked by: 15
Map: ../map.md

## Question

How does graeae keep the owner's media bill bounded, given that Cloudflare offers no spending cap for its media server?

[Media transport choice](08-media-transport-choice.md) decided that graeae counts watched media itself and enforces a monthly budget set by the owner, defaulting to the free 1,000 GB. Input is [Cloudflare account check](15-cloudflare-account-check.md).

Decide:

- What is counted, and how: time watched at the maximum allowed bitrate, bytes reported by viewers' browsers, or both, and how far the count may drift from Cloudflare's billed figure.
- What happens as the limit approaches and when it is reached: a warning, lower quality, no new watching, or shares stopped.
- How the owner and members see usage, and whether the owner can raise the budget mid-month.
- Whether the usage level where an instance stops being free is shown to someone deploying their own copy.
- The name for this concept in `GLOSSARY.md`.

## Answer

Decided with the user on 2026-11-16.

- **What is counted.** Usage is watched media, in GB. Each watching browser reports the bytes it received every few seconds over the existing WebSocket. For any watch time that goes unreported, the backend charges the share's maximum bitrate. Relayed watching is counted twice, because it may be billed on both the media server and the relay; that is unverified. A sharer's upload is not billed and is not counted.
- **Enforcement runs on graeae's own count alone.** Cloudflare's figure is not read in v1. It can be: the GraphQL Analytics API has documented relay egress (`callsTurnUsageAdaptiveGroups`) and an undocumented media server dataset (`callsUsageAdaptiveGroups`, `egressBytes`), which may be sampled and needs an account API token. The spec notes it as a later addition behind the same seam. Sources: <https://developers.cloudflare.com/realtime/turn/analytics/>, <https://pages.johnspurlock.com/graphql-schema-docs/cloudflare.html>. Not run against the owner's account.
- **Drift.** The count may read above Cloudflare's figure and should never read more than 5% below it. [Quality proof](13-quality-proof.md) compares the two after the friend session. If graeae under-counts, a fixed overhead percentage is added to every reported byte.
- **The budget.** One number for the whole instance, in GB per month, default 1,000, set by the owner in the app with the dollar equivalent beside it ($0.05 per GB past 1,000). No per-room or per-member quotas.
- **The month.** It resets on a day of the month the owner sets (UTC, default 1). Cloudflare does not document whether the allowance follows the calendar month or the account's billing date, so the README tells a deployer to match it to the billing date on their Cloudflare account.
- **Approaching the limit.** Warnings only: the owner at 80%, everyone present at 95%. graeae never lowers quality on its own.
- **At the limit.** All watching stops and is refused until the month resets or the owner raises the budget. Shares stay live. The stage says the month's usage budget is used up and that the owner can raise it. With the owner absent it stays stopped.
- **Changing the budget.** The owner may set any value at any time. Raising it takes one confirm that names the maximum added cost, and watching resumes at once. Setting it below what is already used stops watching immediately. There is no upper limit.
- **Who sees usage.** The owner always sees a meter in their admin surface: GB used, the budget, and the projected month-end figure. Members see nothing until the 95% warning. No per-member breakdown in v1.
- **Deployers.** A fresh instance defaults to 1,000 GB, so a deployer is not billed for media unless they raise the budget themselves. The README says so, and that Cloudflare requires a card on file.
- **What the budget does not bound.** Relay traffic graeae never sees, such as from a leaked relay credential. That is held down by short-lived relay credentials (issuing them stays with the map's Securing the media layer) and the owner's Cloudflare billing alert. The spec and README state that the budget bounds watched media, not the whole bill.

**Glossary.** Added Usage and Usage budget.

**No ADR.** Nothing here is hard to reverse.

**Follow-ons.** A comparison step is added to [Quality proof](13-quality-proof.md). The owner's meter is added to [Owner's admin surface](17-owners-admin-surface.md). The viewer byte reports and the stop at the limit are added to [Signaling and room state](18-signaling-and-room-state.md). [Deploy story](19-deploy-story.md) is now unblocked.

## Comments after resolution

**2026-11-16, from [Usage count accuracy](24-usage-count-accuracy.md).** The reported figure is the running total of the connection's transport bytes received. The "fixed overhead percentage" is set at 5% on every reported byte. The maximum-bitrate charge applies only after a tab's last report. The comparison with Cloudflare is repeated once on the built app.
