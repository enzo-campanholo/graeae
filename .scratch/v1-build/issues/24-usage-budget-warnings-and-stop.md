# 24: Usage budget, warnings and stop

**What to build:** The owner sets the usage budget. The owner is warned at 80%, everyone present at 95%, and at the limit all watching stops while shares stay live. Raising the budget takes one confirm that names the maximum added cost, and watching is allowed again at once.

Spec: [Usage and the usage budget](../spec.md#usage-and-the-usage-budget), [Cut-off](../spec.md#cut-off). User stories 91 to 97.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 20, 23

**Status:** ready-for-agent

- [ ] One usage budget for the instance, in GB per month, default 1,000, with no upper limit
- [ ] The setting shows the dollar equivalent beside it: $0.05 per GB past 1,000
- [ ] Raising the budget takes one confirm naming the maximum added cost
- [ ] At 80% the owner sees a strip above the stage that links to Usage
- [ ] At 95% everyone present sees a strip above the stage
- [ ] At the limit the cut-off routine closes everyone's watching and closes no share
- [ ] New watching is refused until the month resets or the owner raises the budget; sharing is never refused for usage
- [ ] The stage says the month's usage budget is used up and that the owner can raise it
- [ ] Raising the budget allows watching again at once; setting it below what is already used stops watching immediately
- [ ] The monthly reset allows watching again
- [ ] The stop applies during a grace period exactly as otherwise
- [ ] graeae never lowers quality on its own
- [ ] Seam 1 tests for the thresholds, the stop and both directions of change; Seam 2 for the strips, the stopped stage and the confirm
- [ ] The Usage section says that the usage budget bounds watched media, not the whole Cloudflare bill
