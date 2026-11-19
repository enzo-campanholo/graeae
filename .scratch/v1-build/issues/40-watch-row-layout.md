# 40: The "Watch · Webcams · Everything · Nothing" row looks off

**What to build:** A layout for the watch shortcuts that reads well. (Owner's screenshot: the dim "Watch" label, then three text buttons, in one row under the people.)

Owner's note (2026-11-18): "It is weird how this is laid out."

This touches a locked call. `ignore.md` keeps "the dim 'Watch' label before Webcams / Everything / Nothing". Update that line when this is decided.

**Blocked by:** 34 (options can be shown before then; building waits on it)

**Status:** ready-for-agent

## Options first

The owner did not say what is wrong, so the first step is to show options, not to fix anything. The agent working this ticket comes up with the options itself: three designs that differ in kind (structure, placement and emphasis), not three versions of one idea. The owner says what they like in each, the next round combines those, and it goes on until one is chosen. Only then is it built.

- Show the options in the real app on the fakes (the dev server with the bots' data), or as mockups that use the app's own tokens, fonts and data. Dark and light, at 1920x953 and 1366x768.
- After each round, add a comment below with the options shown, what the owner liked and disliked in each, and what the next round changes.
- Each round of options covers the whole surface the ticket names, so the parts stay one family.
- What gets built must keep the click counts and the 1080p promise from ticket 32's rules.

## Comments

### 2026-11-19: round 1, three options

The ticket asks for options before anything is built.

**Where to look.** `.impeccable/review/captures/t40-r1/index.html` (not committed). It is shot in the real app on the samples (`?sample`), in dark and light, at 1920x953 and 1366x768, in four states:
- **`bar-some`:** the usual sample, with three of the four live shares watched, so no pick matches the stage.
- **`bar-nothing`:** nothing watched.
- **`bar-webcams`:** every webcam watched and no screen (a new `?sample=webcams`, on the options branch only).
- **`bar-busy`:** the busy room, with all seven shares watched.

Each shot is labelled `--now`, `--a`, `--b` or `--c`, and `bar-some--b-tooltip` shows B's tooltip. To try them by hand, check out branch `t40-options`, run `pnpm dev:fake-media` and open `/r/den?sample&option=a` (or `b`, `c`, `now`). The choice is kept until another `?option=`. `scripts/capture/options.config.ts` reshoots the set.

In all three the picks do what they do now: one click each, following nobody.

- **A, "Watch" as its own section, with a control that shows what you watch.**
  - "Watch" becomes a heading like "Here" and "Not here", between the two. Under it is a full-width segmented control (Webcams / Everything / Nothing), drawn like the tiles' quality choice.
  - The pick the stage matches is lit (raised-2, foreground): "Nothing" when nothing is watched, "Webcams" when exactly the webcams are, "Everything" when every share is. When only webcams are live, both match and "Everything" is lit. When the stage matches no pick, nothing is lit, which is the usual case after clicking names and icons.
  - The light reflects the stage and is not a mode. A share that starts later does not join, so the light goes out, as the spec's one-off picks require.
  - **Cost:** the tallest option, 52px taller than today's row, all of it taken from the list.
- **B, three icons in the "Here" heading.**
  - The row goes. At the heading's right sit three faint 28px icon buttons over the rows' share-icon column: video, eye and eye-off. Their tooltips say "Watch every webcam", "Watch everything" and "Watch nothing".
  - "Here"'s count moves next to its label so the icons get the right side. The group is still named "Watch" for screen readers.
  - **Cost:** the words become icons, so the row no longer reads as a sentence and the names live only in the tooltips. Eye-off is also the tile's "Stop watching", though here it stops every watch, not one. The list gains the row's 34px.
- **C, a raised row at the foot, just above the share buttons.**
  - The row moves out of the list and becomes the foot's second-last line. It keeps the dim "Watch", followed by three raised 32px buttons that fill the bar's width.
  - The bar then splits into what is (the people) and what you do (watch, share).
  - **Cost:** the foot is 38px taller, which comes out of the list. The picks move away from the names they act on. Three more raised buttons sit next to the room's one filled button. At 1366x768 with both of your shares live, the row sits under the 112px thumbnails.

**Not in any option:**
- **The rail** has no shortcuts today, and no option adds any.
- **The empty stage's "Watch everything"** belongs to ticket 42.

**Rules kept.** Ticket 32's click counts (1 to watch a member, 1 to share a webcam, 3 to share a screen) and the 1080p promise hold in all three, since none changes the bar's width or the stage.

**For `ignore.md`.** A keeps the dim "Watch" label as a heading, C keeps it as it is now, and B drops it from view (only screen readers hear it). The locked line changes once one is chosen.

**Waiting on the owner:** what you like and dislike in each. Round 2 combines those.

### 2026-11-19: round 1's verdict, and round 2, hybrids of A and B

**What the owner said of round 1.**
- **C is the worst** of the three.
- **B is liked** because it adds the least to the screen, but its icons are not clear enough.
- **Between A and B, still undecided.**

**What the agent added.** The agent leaned to A:
- A's words carry the meaning.
- A's light says something new: whether you watch everything, every webcam or nothing.
- B's eye-off is also the tile's "Stop watching".

A's one real cost is its 52px.

**Round 2: three hybrids, beside today's row, A and B.** The comparison is one page of the bar's top, cropped at 1366x768 and set side by side. Buttons switch the state (some watched, nothing, webcams) and the theme. The page is at `.impeccable/review/captures/t40-r2/compare.html` (not committed, self-contained). `scripts/capture/compare.config.ts` reshoots it. On branch `t40-options`, the hybrids are `?option=d`, `e` and `f`.

- **D, A's control in B's place.** A small segmented control (Webcams / Everything / Nothing, 24px options on a raised track) sits at the right of the "Here" heading. It is lit at the stage's pick, and the count moves beside "Here".
  - **Gains:** no row at all, with the words kept.
  - **Cost:** the heading is full, and the visible "Watch" is gone, so the group is named only for screen readers.
- **E, A slimmed to today's row.** It sits where today's row is, under your own row, as one 32px raised track: a dim "Watch", then the three picks filling the width, lit at the stage's pick.
  - **Gains:** the sentence and the light.
  - **Cost:** 4px more than today, and 48px less than A.
- **F, B lit.** B's three faint icons in the heading, with two changes:
  - The pick the stage matches rests on raised-2 in foreground.
  - "Nothing" is a closed eye (eye-closed) instead of the tile's eye-off.
  - **Gains:** no row, as in B.
  - **Cost:** the names stay in the tooltips.

**Rules kept.** All of them are one click each, and none changes the bar's width or the stage, so ticket 32's click counts and the 1080p promise hold.

**Waiting on the owner:** which of D, E and F, or what to take from each.
