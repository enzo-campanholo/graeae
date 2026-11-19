# 43: The room's title in the bar header

**What to build:** The room's name in the bar's header reads as a title. (Owner's screenshot: the rail toggle, home icon, "Movie night" centred, gear.)

Owner's note (2026-11-18): "I don't like how the title is displayed."

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
