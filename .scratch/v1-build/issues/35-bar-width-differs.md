# 35: The side bar changes width between the room and the owner page

**What to build:** The side bar is one width everywhere it appears.

Owner's note (2026-11-18): "The size of the bar changes when you are in the config and when you are in the primary view."

The room's bar is 288px (`Bar.svelte`, `w-[288px]`), and the owner page's nav is 224px (`Owner.svelte`, `w-56`).

Blocked by: none (follow 34's scale if it lands first)

Status: resolved

## Comments

### 2026-11-18: one width, the bar's

By the time this was picked up, ticket 34's scale had made the two 316px (the bar) and 256px (the owner navigation), not 288 and 224.

**The width.** The owner chose for both to take the bar's 316px. The bar can't go narrower, or its two share buttons stop fitting side by side. It can't go much wider either: past about 321px, a single share on a maximised 1080p window is limited by the bar instead of by height (see 34).

**What changed.**
- The owner navigation takes `w-bar` in `Owner.svelte`.
- The `--nav` token and its `w-nav` class are gone from `app.css`, so there is one width to change.
- `DESIGN.md`'s owner page entry gives the navigation the bar's width.

**Test.** `test/browser/moves.spec.ts`: "the side bar is one width from the room to the owner page" measures the room's People bar, then the owner page's side column, and checks the two widths are equal. It was red at 256 against 316 and is green now. The full suite passes.

**Left for 36 and 37.** The navigation's extra 60px comes out of the owner content panel. At 1366px wide, the content gets about 962px of its 1000px maximum, which it used to fill. The owner page's alignment and layouts should be checked with that in mind.

**Review.** The standards and spec reviews found no defects. The test's names and `moves.spec.ts`'s header comment were tidied after the review.

### 2026-11-18: deployed and closed

**Deployed to `graeae-test`** on 2026-11-18, from `5429d0f` (version `88fa8c81`). The live stylesheet carries `--bar: 316px` and no `w-nav`. Its secrets were left as they were, since no `.secrets` file was uploaded.

The app's page took about five minutes after the deploy to name the new build's files. Until then it named the previous build's stylesheet and script, which the new version no longer has. A page loaded in that gap would have been unstyled. This comes from the deploy, not from this ticket: the instance fetches the page through its own `ASSETS` binding, and it went on serving the old one for a while.
