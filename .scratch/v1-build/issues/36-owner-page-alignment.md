# 36: Owner page sections sit at different horizontal positions

**What to build:** The four owner sections line up with each other, in a layout that uses the space on purpose.

Owner's note (2026-11-18): "The alignments in the settings page are weird, some pages go more to the right, some go less. Again, lots of blank space that feels somewhat arbitrary."

This reverses a locked call. `.impeccable/critique/ignore.md` keeps "the owner page's 880px column centred in its panel". Remove that line when this is decided.

**Blocked by:** 34

**Status:** resolved

## Open questions

- Why do sections land at different x positions? Each is centred at `max-w-[880px]`, so a section whose content is narrower than 880px probably shifts. Check that first.
- Left-aligned to the nav, or one fixed column?

## Comments

### 2026-11-18: one split, centred column kept

**Why the sections looked misaligned.** The guess above was wrong: the column never moved. All four headings start at the same x (654px at 1920x953), because the 1000px column is a block that fills to its maximum whatever its content. What moved was each section's split inside it:

| Section | Before | Second column starts at (1920) |
|---|---|---|
| People | members (1fr) · chosen member (360) | ≈1214 |
| Invites, Rooms | form (360) · list (1fr) | ≈1062 |
| Usage | one 680px column | none; it stopped 240px short |

So moving between sections, the second column jumped about 150px, and Usage ended early.

**Options shown.** These were shot on the fakes at 1920x953 and 1366x768, with all four sections in each: Now; A, centred with one split; B, by the navigation with one split; C, filling the panel with one split; and D, by the navigation with each section's own split. The owner turned down C ("too much eye movement") and anything by the navigation (B, D), and liked A more than Now. What still bothers them is how each section shows its data, which is ticket 37.

**Built: A.**
- One split for every section, the `owner-columns` utility in `app.css`: what there is on the left, taking the rest, and a side column of `--owner-side` (360px) on the right, 48px apart. The side column starts at one x in all four sections.
- People is unchanged (members, then the chosen member). Invites and Rooms now put the list first and the form in the side column. Usage puts this month's figures on the left, and the usage budget over the reset day on the right.
- The 360px is now a token in the scale block, so DESIGN.md's One Scale Rule no longer lists it as set by hand. DESIGN.md's owner page and Usage entries describe the split.
- The column stays centred. So `.impeccable/critique/ignore.md` keeps its line, noted as reconfirmed here, rather than dropping it.

**Test.** `test/browser/moves.spec.ts`: "every owner section puts its side column at the same place" opens each section at 1920x953 and checks that its side column (the member panel, the new invite form, the new room form, the usage budget form) has People's x and width. It was red at x=654 against 1214 for Invites, and is green now. The full suite passes: 428 Workers tests and 44 browser tests.

**Review.** The standards and spec reviews found no defects. After the review, the test lost its second list of section names, and DESIGN.md's owner page entry stopped using "side column" for both the navigation and the sections' column.

**For 37.** The frame is set: a centred 1000px column, split 1fr | 360px in every section. The layouts inside each section are still 37's to redesign.

### 2026-11-18: deployed and closed

**Deployed to `graeae-test`** on 2026-11-18, from `b93e59c` (version `002953ed`). The live stylesheet carries `--owner-side: 360px` and the `owner-columns` split. Its secrets were left as they were, since no `.secrets` file was uploaded. This time the page named the new build's files straight away, without ticket 35's five-minute lag.
