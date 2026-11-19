# 43: The room's title in the bar header

**What to build:** The room's name in the bar's header reads as a title. (Owner's screenshot: the rail toggle, home icon, "Movie night" centred, gear.)

Owner's note (2026-11-18): "I don't like how the title is displayed."

**Blocked by:** 34 (options can be shown before then; building waits on it)

**Status:** resolved

## Options first

The owner did not say what is wrong, so the first step is to show options, not to fix anything. The agent working this ticket comes up with the options itself: three designs that differ in kind (structure, placement and emphasis), not three versions of one idea. The owner says what they like in each, the next round combines those, and it goes on until one is chosen. Only then is it built.

- Show the options in the real app on the fakes (the dev server with the bots' data), or as mockups that use the app's own tokens, fonts and data. Dark and light, at 1920x953 and 1366x768.
- After each round, add a comment below with the options shown, what the owner liked and disliked in each, and what the next round changes.
- Each round of options covers the whole surface the ticket names, so the parts stay one family.
- What gets built must keep the click counts and the 1080p promise from ticket 32's rules.

## Comments

### 2026-11-19: round 1, three options

**What may be wrong now.** The owner did not say, so this is the agent's reading:
- **The same type as the names under it.** The name is body-strong (15px, 500), like "Bia" and "Marta" a row below, so it reads as one more name.
- **The only centred thing in the bar.** Everything else lines up on the left ("Here", the avatars, the names). The name sits in a 164px middle column between two fixed sides two icons wide. With one icon on a side (a member with one room, no gear) it floats over a gap.
- **Little room.** Past about 20 characters it is cut ("Saturday films with t…").

The owner page's navigation has the same header ("Owner" centred beside the house), so each option covers it too, to keep the column on the left one family.

**Where to look.** `.impeccable/review/captures/t43-r1/compare.html` (not committed). It sets "Now" and the three options side by side, two by two, with switches for:
- **State:**
  - **The owner, three rooms** (the sample: home and gear both there).
  - **A member with one room** (a new `?sample=member`: no home, no gear).
  - **A long name** (a new `?sample=long`: "Saturday films with the cousins").
  - **The way to the rooms, opened:** the home icon or "Rooms" under the pointer, or C's menu open.
  - **The owner page.**
- **Theme:** dark and light.
- **Size:** 1920x953 and 1366x768.
- **Zoom:** a close-up of the bar's top left (the default), or the whole page.

A click on a shot opens it at full size. To try them by hand, check out branch `t43-options` (`f2c999d`), run `pnpm dev:fake-media` and open `/r/den?sample&option=a` (or `b`, `c`, `now`; and `/owner/people?sample`). The choice is kept until another `?option=`. `scripts/capture/options.config.ts` reshoots the set.

In all three:
- The name moves to the left, on the line the bar's other things start from.
- The fold toggle stays at the far left, where the rail keeps it, and the gear and your avatar stay at the right.
- The bar's width does not change.

- **A, a heading under the tools.**
  - **The header becomes two rows:** the tools on a 52px row of their own (fold and home on the left, gear and avatar on the right, nothing between), then the name under them at the headline step (24px, foreground). That is the size a plain page's heading ("Rooms", "You") and an owner section's ("People") already take.
  - **A long name** wraps to two lines, balanced, rather than being cut.
  - **The owner page:** the house on its own row, then "Owner" at the headline step.
  - **Gains:** the room's name is the page's heading, as on every other page, and nothing is ever cut.
  - **Cost:** the people start 32px lower (64px with a two-line name). At 1366x768 with both of your shares live, that is about one row of people fewer before they scroll. The home and gear rows look sparse.
- **B, a path in one row.**
  - **One 52px row:** the fold toggle, then "Rooms / The den". "Rooms" is a muted link (foreground under the pointer) that takes the home icon's place, then a faint slash. The name follows at the title step (17px, foreground) and takes the rest of the row up to the gear.
  - **A member with one room** has no list of rooms to go back to, so the name stands alone after the toggle.
  - **The owner page:** "Rooms / Owner".
  - **Gains:** the header says where you are and how to go back in words, with no height added. The title step sets the name apart from the names under it.
  - **Cost:** "Rooms /" takes about 70px, so with home the name is cut sooner than now ("Saturday fil…"). A link in words is a new kind of thing in a bar that is otherwise icons.
- **C, the room as a switcher.**
  - **One 52px row:** the fold toggle, then a button holding a 26px square tile (the room's initial, as an avatar is a person's, with 6px corners so a room never reads as a person), the name in body-strong foreground, and a chevron.
  - **The menu:** "Your rooms", one line each (a small tile, the name, a tick on this one or a dim "1 here"), then under a rule "All rooms". It takes the home icon's place: another room is two clicks away, as it is now through the list. The list itself is two clicks away rather than one.
  - **A member with one room** sees the tile and the name, with no chevron and no button.
  - **The owner page:** a gear in the tile and "Owner", opening the same menu.
  - **Gains:** the tile gives the name weight without a larger size, and moving between rooms needs no detour through the list.
  - **Cost:** a new component, and the room would need your rooms with their counts in its answer (only the sample has them now). The tile is one more grey square in a bar of grey circles.

**Not in any option:**
- **The rail** shows no name today and none in any option.
- **The tab's title** stays "The den · graeae".

**Rules kept.** Ticket 32's click counts (1 to watch a member, 1 to share a webcam, 3 to share a screen) and the 1080p promise hold in all three: none of them touches the stage or the bar's width. Only C changes a count outside those rules: the list of rooms goes from one click to two.

**Waiting on the owner:** what you like and dislike in each. Round 2 combines those.

### 2026-11-19: chosen and built, A

**The owner's verdict on round 1.** A, a heading under the tools.
- **A:** it fixes what the owner noticed, that the room's name did not stand apart from the names under it.
- **B is out:** most members have one room and need not know rooms exist, so a path through "Rooms" says too much.
- **C is out:** nobody needs to switch between rooms that fast.
- **The gap between the tools** (nothing between the two ends of their row) looked odd to the owner, but likely only for being new. It stays as shown. If it still reads as odd once used, the next thing to try is a shorter tools row, on the room and the owner page alike, not a new round. `ignore.md` says so.

**Built.**
- **`BarHeader.svelte`:**
  - A 52px row of tools: the fold toggle and home on the left, the gear and your avatar on the right.
  - Under it, the room's name as the page's `h1` at the headline step (24px/32px, 500, -0.01em), the size of "Rooms", "You" and an owner section's heading. Its words start on the "Here" heading's line.
  - A long name wraps, balanced, rather than being cut. Names are at most 40 characters, so that is two lines for most, and a word too long for the line breaks inside it.
  - While the name loads, a placeholder bar holds the heading's line, so the people do not move when it arrives.
- **The owner page (`Owner.svelte`):** the house on its own 52px row, then "Owner" at the headline step. "Owner" is a `p`, not a heading, since each section's own name is the page's heading.
- **The headline's tracking is a token now:** `--headline-tracking` in the scale block, as `--text-xl--letter-spacing`. The four headings at that step (plain pages, owner sections, the room's name, "Owner") drop their `tracking-[-0.01em]` literal.
- **The docs:**
  - **DESIGN.md:** Headline names the room's name and "Owner", Body Strong no longer names the bar header, and the Layout paragraphs for the room and the owner page describe the two rows.
  - **The sidecar:** the same in `design.json`'s typography.
  - **`ignore.md`:** a line for this call and its cost.

**Tests.** Test first, at Seam 2, in `moves.spec.ts`, beside the side column's other family rules (one width, one place):
- **"The room's name heads the bar under its tools, as large as a page's heading, and the owner page's name heads its navigation the same way."**
  - The name is under the tools' row and above "Here", its words on "Here"'s line.
  - It is set as the People section's heading is (size, weight, tracking).
  - On the owner page, "Owner" is under the house, on the same line, set the same.
- **Red, then green.** It was red on the old header (the name beside the tools) and green once built.
- **A hole the review found.** The review asked for `toBeCloseTo` in place of `toBe` for the words' start. That showed the first version's page helpers were passed as strings and returned `undefined`, so its checks on the words' line and on the type compared `undefined` with `undefined`. They now run as functions.
- **Shown to bite.** For a check, the name was set back to the old 15px (on the right line, then 4px off it). The test went red on each: type `15px`/`normal` against `24px`/`-0.24px`, and the line 20 against 16.

`pnpm typecheck` and `pnpm lint` are clean. The Workers tests (431) passed, and the browser journeys (53) passed in full twice. In an earlier full run, the audio journey once counted 3 shares on the stage where it waits for 4. It then passed alone three times and in the next two full runs, so it is a flake, not this ticket's. As in tickets 40 to 42, `dist/graeae/.dev.vars` was deleted between the build and `playwright test` (ticket 46).

The shots after the build are in `.impeccable/review/captures/t43-after/` (not committed), set against `t42-after`. They were taken one project at a time (`--project=samples`, then `--project=journeys`). A first capture, run alongside a typecheck and lint, was killed for memory, as in ticket 32.

**Review.**
- **Standards:**
  - DESIGN.md said a long name is never cut, but the heading was clamped at two lines: the clamp is gone and a long word breaks.
  - The headline's `-0.01em` was written four times: now a token.
  - Vague names in the test (`typeOf`, `room` for a box, `people` for a heading, `line`) became `typeSetting`, `nameBox`, `sectionHeading` and `peopleLine`.
  - Exact comparison of fractional pixels became `toBeCloseTo`.
  - All fixed.
- **Spec:** this comment was missing, and the costs at 1366x768 were unshown. Both are covered here.
- **Left as is:** the empty spacer in the tools row, rather than `ml-auto` on whichever of the gear or the avatar comes first.

**What it costs, as round 1 said.** The people start 32px lower (64px under a two-line name). At 1366x768 with both of your shares live and a note showing (`room--sharer-notes`), one row fewer is in view before the list scrolls: your own row, which was half-cut before.

**Rules kept.** Ticket 32's click counts (1 to watch a member, 1 to share a webcam, 3 to share a screen) and the 1080p promise hold. The bar's width and the stage are unchanged, and the journeys that measure them pass. Home and the gear are still one click.

**Branch `t43-options`** (`f2c999d`) was to be deleted once this was deployed; see below.

### 2026-11-19: deployed and closed

**Deployed to `graeae-test`** on 2026-11-19, from `8df1d4f` (version `dd1c2e4c`), with `pnpm run deploy --name graeae-test`.
- The live page loads the new build at once:
  - the script `index-DsAlDRVi.js`, which carries the heading's `wrap-break-word` and none of the fakes;
  - the stylesheet `index-4X43AbOZ.css`, which carries `--headline-tracking: -.01em` and `.wrap-break-word{overflow-wrap:break-word}`.
- The secrets were left as they were, since no `.secrets` file was uploaded.

**Cleaned up.**
- Branch `t43-options` is deleted, so `?option=`, `?sample=member` and `?sample=long` no longer exist anywhere, nor do `RoomPath` and `RoomSwitcher`.
- The round 1 shots (`t43-r1`) are deleted, so the round 1 comment above describes what was shown, not files to open.
- `t43-after` stays.

**Still open, not this ticket's:**
- The fake-media build copying `.dev.vars` into `dist/graeae/` (ticket 46).
- The audio journey's one flake (3 shares counted where it waits for 4), seen once in four full runs.
