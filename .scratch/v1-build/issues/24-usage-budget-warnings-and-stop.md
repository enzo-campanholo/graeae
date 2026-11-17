# 24: Usage budget, warnings and stop

**What to build:** The owner sets the usage budget. The owner is warned at 80%, everyone present at 95%, and at the limit all watching stops while shares stay live. Raising the budget takes one confirm that names the maximum added cost, and watching is allowed again at once.

Spec: [Usage and the usage budget](../spec.md#usage-and-the-usage-budget), [Cut-off](../spec.md#cut-off). User stories 91 to 97.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 20, 23

**Status:** resolved

- [x] One usage budget for the instance, in GB per month, default 1,000, with no upper limit
- [x] The setting shows the dollar equivalent beside it: $0.05 per GB past 1,000
- [x] Raising the budget takes one confirm naming the maximum added cost
- [x] At 80% the owner sees a strip above the stage that links to Usage
- [x] At 95% everyone present sees a strip above the stage
- [x] At the limit the cut-off routine closes everyone's watching and closes no share
- [x] New watching is refused until the month resets or the owner raises the budget; sharing is never refused for usage
- [x] The stage says the month's usage budget is used up and that the owner can raise it
- [x] Raising the budget allows watching again at once; setting it below what is already used stops watching immediately
- [x] The monthly reset allows watching again
- [x] The stop applies during a grace period exactly as otherwise
- [x] graeae never lowers quality on its own
- [x] Seam 1 tests for the thresholds, the stop and both directions of change; Seam 2 for the strips, the stopped stage and the confirm
- [x] The Usage section says that the usage budget bounds watched media, not the whole Cloudflare bill

## Comments

**Done** on `ticket/24-usage-budget-warnings-and-stop`, against the fakes, after merging `v1-build` with ticket 16. `pnpm test` (Seam 1, 376 tests; Seam 2, 30 journeys), `pnpm typecheck` and `pnpm lint` pass. No migration: the budget is a row of ticket 23's `setting` table. The owner was away, so the impeccable skill's questions were not asked; the strip, the used-up stage and the budget setting follow `DESIGN.md`, whose Stage Tile and Usage Meter entries now describe them. Screenshots (dark and light) come from `GRAEAE_SCREENSHOTS=<dir>` on the budget journey.

- **The budget** (`src/instance/usage.ts`). `PUT /api/owner/usage/budget { gigabytes }` takes a whole number of GB from 1, with no upper limit, stored as `budget_gigabytes` (default `DEFAULT_BUDGET_GIGABYTES`, 1,000; `USAGE_BUDGET_BYTES` is gone). It answers with the usage figures, as the reset day does. `Usage.level()` gives the month against it: `"80%"`, `"95%"`, `"used up"` or null. **Decision:** the backend takes any budget; the confirm on raising is the page's, as the removal confirm is.
- **The check** (`Instance.checkBudget`), after anything that may move the month: a report, a watch charged on ending, a tab gone, a new budget or reset day, the alarm, and a restart. The level the room was last told is kept in storage (`usage:told`), so a month that resets while the instance sleeps is still told; while it is not null, the alarm is also set for the month's end. Each open room tab whose member's view changed hears `usage { type: "budget", budget }`: the owner from 80%, everyone from 95% (`budgetFor`). A tab opens with the same in `state.usage` (`{}` below the member's warning, so ticket 23's "members see nothing" holds).
- **The stop** is the cut-off with a new `Covered` kind, `{ everyWatch: true }`, as ticket 20 foresaw: no share is taken in, every watch is (`1 = 1` over `watch`), lost tabs in their grace period included, and no media connection is forgotten, so viewers can watch again. Storage needs no change: from the instant the count reaches the budget, `level()` refuses every watch, including a pull that was under way (its `stillOpen` check). The room hears `used up` only once the closes have returned. It runs once per crossing (when the told level is not yet `used up`); a close that fails is left to ticket 21's retries rather than a second stop. Setting the budget below what is used stops watching at once; raising it, or the month resetting, tells the room and allows watching again at once. Shares are never refused for usage.
- **The room.** `BudgetStrip` runs across the stage's top (Stage's new `warning` slot): "Usage is past 80% of this month's usage budget." with a "Usage" link for the owner; at 95% everyone, adding "Watching stops for everyone when it runs out." At the limit the empty stage says "This month's usage budget is used up." and "Watching stops until the month resets or the owner raises it. Shares stay live." (the owner: "…or you raise it." with "Raise it in Usage"). **Decision:** viewers click again once watching is allowed; only a tab following a member watches their shares again by itself, as following does for a new share. **Decision:** the owner's 80% strip is in the room although PRODUCT.md keeps owner chores out of it, because the spec puts it there.
- **The Usage section.** A "Usage budget" form between the month and the reset day: the GB field, Save, and the dollar equivalent of what is typed beside it ("$0.00 a month", "Up to $50.00 a month"; `budgetCost`, $0.05 per GB past 1,000). Raising opens `RaiseConfirm`, which names the most the raise adds a month ("This can add up to $50.00 a month to your Cloudflare bill."), or that it adds $0.00 within the included 1,000 GB; Cancel holds the focus. Lowering saves at once, with an amber line beforehand when the typed budget is no more than is used. The line that the budget bounds what members watch, not the whole Cloudflare bill, was already there from ticket 23.
- **Quality.** Nothing about the budget touches a watch's quality; the 95% test checks the fake's preferred qualities and tracks are unchanged.
- **Tests.** `test/budget.test.ts` (Seam 1, 17): the default, setting, refusing and keeping the budget, the owner's alone; the owner at 80% and not members; everyone at 95%; in the opening state; dropping on a raise and coming back on a lower budget; dropping at the month's reset; nothing changes about what is watched or its quality at 95%; at the limit every watch closes before the tabs hear `used up`, no share ends, and only the shares' tracks stay on the fake; new watching refused and a new share live; a pull under way refused; a tab in its grace period cut too and finding an empty stage; raising allows watching again; setting it below the used stops watching; the month resetting allows watching again. `test/browser/budget.spec.ts` (Seam 2; member Rui): the budget lowered just above what earlier journeys used, the owner's strip with its link, Rui's 95% strip, both stages used up while Rui's webcam stays live and a new watch is refused, the confirm cancelled then accepted at "Up to $50.00", watching again, the lower-budget line and the stop, then back to 1,000 GB for later journeys.
