# 37: Better layouts inside each owner section

**What to build:** Each owner section (People, Invites, Rooms, Usage) shows its data in a form that suits it, rather than one stacked form-and-list column.

Owner's note (2026-11-18): "I like how the settings are divided, but I don't like the layout inside each settings page, there are better ways to visualize that data."

Blocked by: 34, 36 (options can be shown before then; building waits on them)

Status: resolved

## Options first

The owner did not say what is wrong, so the first step is to show options, not to fix anything. The agent working this ticket comes up with the options itself: three designs that differ in kind (structure, placement and emphasis), not three versions of one idea. The owner says what they like in each, the next round combines those, and it goes on until one is chosen. Only then is it built.

- Show the options in the real app on the fakes (the dev server with the bots' data), or as mockups that use the app's own tokens, fonts and data. Dark and light, at 1920x953 and 1366x768.
- After each round, add a comment below with the options shown, what the owner liked and disliked in each, and what the next round changes.
- Each round of options covers the whole surface the ticket names, so the parts stay one family.
- What gets built must keep the click counts and the 1080p promise from ticket 32's rules.

## Comments

### 2026-11-18: round 1, three options

**Where to look.** `.impeccable/review/captures/t37-r1/index.html` (not committed), grouped by section: each section as it is now (`--now`) and under options A, B and C, dark and light, at 1920x953 and 1366x768. They are shot in the real app on the fakes, with more data than the usual captures: three rooms (First room, Late shift, Speedruns), six members in different rooms (Eli away, Duda in Speedruns, Gui in Late shift), three invites waiting (Ivo just made), and 412 GB of a 1,000 GB usage budget used by day 19 of the month (UTC). To try them by hand, the variants are on branch `t37-options`. Run `pnpm dev:fake-media` there and open `/owner/people?option=a` (or `b`, `c`, `now`). The choice is kept until another `?option=`. `scripts/capture/options.config.ts` reshoots the set.

All three keep ticket 36's frame: the centred 1000px column, the headings at one x, the navigation and the meter. They differ in what each section is built around:

- **A, Ledger: tables you read across.** Each section is a table with column headings, and the side column holds only the form or the chosen member.
  - People is an access matrix: one row per member, one column per room, a tick where they have access and "here" under the room they are in. A foot row counts each column. Rooms are ticked in place. Picking a name shows their devices, "Let back in" and Remove beside the table.
  - Invites is a table (invited, rooms, expires), each row with a draining bar for the 7 days. The bars all read full here, since every invite on the fakes is new.
  - Rooms is a table (room and address, the access avatars, how many are here).
  - Usage is a chart of the month: the line so far to Today, dashed on to the month's end at the same rate, against the usage budget's line. It is drawn from the month's average, since no daily figures are kept; a true curve would need them.
- **B, Cards: each thing whole, nothing to pick.** The section uses the whole column, two cards to a row, and the forms become the first card.
  - People shows every member on a card: who they are, where they are or when they were last here, their rooms as chips that toggle access, their devices with Forget, and "Let back in" and Remove. Seeing anything about a member takes no click, but six members already run past one screen.
  - Invites: "New invite" is the first card. Each invite waiting is a card with its rooms, its expiry and its link, with Copy on it. The "link is on your clipboard" panel is gone; the new card says so.
  - Rooms: "New room" is the first card. Each room's card shows who has it, as chips, filled for whoever is in it now.
  - Usage is one wide card that sets the budget used (41%) against the month gone (day 19 of 30), so the pace reads at a glance, with the two settings as cards beneath.
- **C, Inspector: one thing at a time, in full.** A short list on the left, one 40px line each, and in every section a raised panel on the right showing the thing picked. People already worked this way; C does the same in all four.
  - People: name and last visit on the left. The panel holds rooms, devices and the actions, closed off by a rule.
  - Invites: "New invite" heads the list, and picking it shows the form in the panel. Picking an invite shows its link, rooms, Copy and Cancel. A new invite opens in the panel with its link.
  - Rooms: "New room" heads the list. Picking a room shows its link, Rename, and who has access as ticks: access given from the room's side, the other way round from People.
  - Usage reads as a statement, line by line: used, projected, the budget, Cloudflare's included 1,000 GB, the cost so far and projected, and the next reset. The two settings sit in the panel.

**Not settled by any option yet:** taking a room away from the matrix (A), a chip (B) or the room's panel (C) would go through the removal confirm as unticking does now. In round 1 those only give access. Click counts and the 1080p promise are the room's, and none of this touches the room.

**Waiting on the owner:** what you like and dislike in each, per section if it differs. Round 2 combines those.

### 2026-11-18: round 1's verdict, and round 2, C beside C-plus

**What the owner said of round 1.** B is out entirely. They lean to C and see merit in A.

**What A had that C lacked**, and why A is not the base:
- A's grid of members and rooms showed everyone's access at once. C shows it one member or one room at a time.
- A's chart showed the month's pace as a picture, where C's statement is all text.
- But A's grid has one column per room in a 592px column, and three rooms already fill it (the owner's name was cut off). Rooms are unlimited, so it breaks at the fourth.
- A's chart draws the month's average as if it were a history, since no daily figures are kept.

**Round 2: C beside C-plus.** Shots in `.impeccable/review/captures/t37-r2/index.html` (not committed): `--c` and `--c2` for each section, same data and sizes as round 1. On branch `t37-options` the new one is `?option=c2`. Invites and Rooms are the same in both.

- **C** as round 1 showed it.
- **C-plus** is C with two of A's strengths, kept within C's own form:
  - **People.** Each member's line carries their rooms after the name, in muted label text ("Bia  First room and Late shift"; "Every room" for the owner). So access across everyone reads at a glance, without a grid that runs out of room. It sits on the line rather than as a second line, to keep C's 40px rhythm, as C's invites already carry their rooms.
  - **Usage.** A tick on the meter marks today, with a line under it: "41% of the usage budget used, on day 19 of 30." The pace reads at a glance without a chart that implies a daily history. The statement beneath is unchanged.

**Waiting on the owner:** C or C-plus, or either with changes.

### 2026-11-18: chosen and built, C with C-plus's Usage

**The owner's verdict on round 2.** C, with Usage from C-plus. People stays plain C: rooms on each member's line add nothing, since the same rooms are just to the right in the inspector. Usage keeps C-plus's tick for today and its line.

**Built.** Every section is a short list on the left, one 40px line each, and in the side column the **inspector** (`Inspector.svelte`): a raised panel holding what is picked, in full. Ticket 36's frame is unchanged, so the inspector starts at one x in all four sections.
- **People:** each line holds the avatar, the name and the last visit. The inspector holds the member picked: rooms as ticks, then devices, then under a rule "Let back in" (with its link) and "Remove from graeae". With nobody picked, it says how many members there are and how many are here.
- **Invites:** "New invite" heads the list and is picked as the section opens, so the inspector holds the form. A new invite then takes the form's place, with its link on the clipboard. An invite picked shows its link, rooms, Copy and Cancel invite. Copying or cancelling an invite now takes a pick first (the list's line had them before); making one costs what it did.
- **Rooms:** "New room" heads the list and is picked as the section opens; a new room then takes its place. A room picked shows its address, Copy link and Rename, and who has access, as ticks with "here" by whoever is in it.
  - Access can now be changed from the room's side. A tick grants at the press; an untick asks in the removal confirm, in People's words. Those words moved into `removal.ts`, which both sections use.
  - Rooms asks for everyone every 15 seconds while in view, as People does, so its "here" counts stay live.
- **Usage:**
  - **Meter:** the meter has a tick at today, with "N% of the usage budget used, on day D of M." under it.
  - **Statement:** the month as a statement of lines: used so far, projected, the usage budget, the 1,000 GB Cloudflare includes, the cost so far, the projected cost (capped at the budget, where watching stops) and the next reset. The two settings are in the inspector.
  - **Amber:** only the projection turns amber when it passes the budget. The mock also coloured the projected cost, which read wrong at $0.00.
- **Design system:**
  - **Figure step:** the 30px figure step is gone. It served only Usage's three big figures, which the statement replaces. It was removed from `app.css`, DESIGN.md and the sidecar.
  - **DESIGN.md entries:** the owner page entry describes the inspector, and the Usage Meter entry describes the statement and the tick.
  - **DESIGN.md rules:** the Tone Not Lines Rule now allows a rule inside one surface where reading goes in order (the statement's lines, the inspector's actions). The One Scale Rule lists the tick among the sizes set by hand.
  - **app.css:** its scale comments say where `--row`, `--item-row` and `--title` are now used.
- **Differences from the mocks:**
  - The inspector is solid `raised` rather than raised at 60%, so it is a step of the scale and not a blend.
  - An empty room's line reads "No one here", as on the list of rooms.

**Tests.** Seam 2 journeys, test first, one slice at a time:
- **`invites.spec.ts`:** the new invite takes the form's place with its link; "New invite" brings the form back; picking the invite shows it again; Cancel returns the form.
- **`rooms.spec.ts`:** the section opens on the form; a room's address and Rename are in its inspector. New at the end: Gil's access from First room's side, where the untick asks first and the tick gives it back.
- **`people.spec.ts`:** no longer reads rooms off the member's line.
- **`usage.spec.ts`:** the pace line, "Included by Cloudflare" and "Cost so far".
- **`moves.spec.ts`:** every section's inspector at People's x and width.

Each was red before its slice and green after. `pnpm test` passes in full: 428 Workers tests and 44 browser tests, before the review's fixes. After them, the owner journeys pass again (invites, moves, rooms, people), and `pnpm typecheck` and `pnpm lint` are clean. The capture's owner shots, against ticket 36's, are in `.impeccable/review/captures/t37-after/` (not committed).

**Review.**
- **Spec:** nothing blocking. It noted that this verdict was not yet written here, which this comment does.
- **Standards:** doc drift in DESIGN.md's rules and `app.css`'s comments, fixed as above. Of its smells, these are fixed: "focus" for what is picked (now `picked`, as in People), a forwarding `roomName`, and invites' "7 days left" built by trimming `timeLeft` (now `timeRemaining` in `$lib/words`).
- **Left as is:** Rooms and People each keep their own small `send` and `refresh`, since what they refresh differs. Each control in the inspector names `bg-raised-2` itself, as the "Let back in" panel already did. The pace line shows the true share once usage passes the budget (say 104%), while the bar stops full.

**Not done here.** Deploy to `graeae-test`. The round 1 and 2 option code stays on branch `t37-options`, which can be deleted.

### 2026-11-18: deployed and closed

**Deployed to `graeae-test`** on 2026-11-18, from `2615bbf` (version `8527ac41`).
- The live page names the new build straight away (`index-DCzo2pU2.css`, `index-V-HYaJs8.js`).
- Its stylesheet has no `--figure`, and its script carries the inspector's "Usage settings" and the meter's pace line.
- The secrets were left as they were, since no `.secrets` file was uploaded.

**Cleaned up.**
- Branch `t37-options` is deleted, so `?option=` no longer exists anywhere.
- The round 1 and 2 shots (`t37-r1`, `t37-r2`) are deleted, so the comments above that point to them describe what was shown, not files to open.
- `t37-after` stays, beside `t36-after`.
