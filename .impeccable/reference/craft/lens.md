# Critique lens

The questions the craft references raise for each of graeae's surfaces, for the second critique, audit and polish pass. It adds to impeccable's own critique (Nielsen's heuristics, cognitive load, the detector) and does not replace it. Each question names its source: an entry in [README.md](README.md) for what an image shows, a section of [write-ups.md](write-ups.md) for what a write-up says.

## How to use it

1. Take a "before" set: `GRAEAE_CAPTURE=before pnpm capture`. Open `.impeccable/review/captures/before/index.html`.
2. Run impeccable's critique as usual, with its two assessments as two subagents.
3. Then walk the surfaces below with their captures open. Answer each question yes, n/a, or with a finding. A finding is fixed, or listed in the ticket with a reason, like any other.
4. After the fixes, `GRAEAE_CAPTURE=after GRAEAE_CAPTURE_AGAINST=before pnpm capture` puts each shot beside its "before" in `.impeccable/review/captures/after/index.html`.

Rules for using the references:

- **Principles, never looks.** Never copy a reference's layout, icons, wording or brand marks. A finding says what principle the surface misses, and fixes it in graeae's own grammar.
- **DESIGN.md wins.** Where a reference does something DESIGN.md forbids (borders between surfaces, colour as status, an accent on controls, a day of the week), the reference loses. The known conflicts are under each entry in README.md and in write-ups.md's "Tensions with graeae's rules".
- **No behaviour changes.** A reference may suggest a feature, such as a command palette, a filter row or a countdown. That is a note for after v1, not a fix in this pass.
- **Aim for changes nobody notices.** Linear's refresh closes: "If most people don't immediately notice what changed, that's probably a good sign" (write-ups.md: Linear, "A calmer interface"). This pass is polish, so its fixes should be felt rather than seen.
- **What the owner has decided stays decided.** Ticket 28's taste calls and earlier tickets' choices, once the owner has ruled on them, are listed in `.impeccable/critique/ignore.md`. Do not raise them again.

## The bar and the rail

Captures: `room--sample-busy`, `room--sample-three`, `room--everything`, `room--member-reconnecting`, `room--sample-rail`, `room--rail`, `room--owner-alone`.

- Is anything in the bar as loud as the stage? Linear made its sidebar "a few notches dimmer, allowing the main content area—where users work—to take precedence", because parts that "support orientation and navigation should recede" (write-ups.md: Linear, "A calmer interface"; PRODUCT.md, Principle 1). The owner page's navigation is held to the same test against its content panel.
- Does the followed row lead, and do the other rows step back? In Linear's refreshed sidebar, inactive items take muted text so the current one stands out (README: Linear). Check rest, hover and followed at 1920 and 1366, in both themes.
- Are icons one size and one stroke across the bar header, the rows and the foot, and is any icon there without a job? Linear "reduces icon usage, scales their sizes down" (write-ups.md: Linear, "A calmer interface"). DESIGN.md sets 15px at a 1.75 stroke.
- Do labels, icons and buttons line up vertically and horizontally across the header, the rows, the shortcuts, the foot and the rail? Linear calls it a change "you'll feel after a few minutes of using the app" (write-ups.md: Linear, "How we redesigned the Linear UI").
- Is the vertical rhythm even? Linear added vertical padding between groups (README: Linear). Look at "Here", the rows, "Watch …", "Not here", and the gap above the foot.
- Is each row one line that says what matters? Flighty's guide is the airport board's "one line per flight" (write-ups.md: Flighty, "Behind the Design"). A 32px row holds a name, a mark and the share icons; check that nothing would push it to a second line.
- Do the dot-joined marks ("· you", "· reconnecting") read as one quiet metadata line, the same grey and spacing everywhere (README: Readwise Reader)?
- Does every action with a key show that key where the action lives? "Share screen" shows S and the bar toggle's tooltip shows `[`. Is any keyed action missing its hint, and does any hint sit where its action is not (README: Raycast, Vercel)?
- In the rail, can a member be told apart by initial alone, and does the brighter initial for a member who shares read at a glance?

## The stage: grid, focus and strip

Captures: `room--sample-busy`, `room--sample-three`, `room--sample-one`, `room--sample-none`, `room--sample-focus`, `room--focus`, `room--everything`.

- Do the pictures lead, with captions that recede? A caption should be read only when looked for (README: Linear, calm).
- Is the empty stage's line the one next step, said plainly, with one action? Vercel's empty cards say what will appear there and offer one thing (README: Vercel, Cursor).
- In focus, does the strip read as "the others, still here" rather than a second grid? Are the strip's captions and gaps the grid's, scaled down?

## The hover controls

Captures: `room--sample-hover`, `room--hover-sound`, `room--muted-caption`, `room--focus-strip-hover`.

- Are the pill's controls in the order of how often they are used, with the most frequent one nearest the pointer's way in? Raycast puts the default action first (README: Raycast).
- Is every control named in a tooltip, with its key when it has one?
- Is the state of sound readable from the caption alone ("screen · muted"), without hovering?
- At rest, is the tile free of controls, as Reader's rows are (README: Readwise Reader)?
- Over real pictures this needs the pass on real media (see "Real media only" below).

## The sharer's previews and notes

Captures: `room--sharer`, `room--sharer-notes`, `room--screen-notice`, `room--handover-offer`.

- Does each note say the thing that matters first, with its cause or remedy in the words after it? Flighty leads with the state ("30m Delay Predicted") and puts the cause under it (README: Flighty). Its notifications state the change and the new value, with the old in brackets: "Delayed 45m", "New Departure: 8:28pm (was 11:30pm)" (write-ups.md: Flighty, product tour). The 48 fps note runs to three lines in the bar: is its first clause enough on its own?
- Does a note explain why and say how to fix it, as Resend's error summaries do (write-ups.md: Resend, "Improved Logs Visibility")? A note with no fix the sharer can make should say only what they need to know.
- Do "Owner watching", the audio switch and Stop read as one line, in the same grey steps as elsewhere?
- Do the screen notice and the hand-over offer ask one question with one default, the way Linear's onboarding stack does (README: Linear, profile)?

## Status in the room: reconnecting and the usage budget

Captures: `room--reconnecting-pill`, `room--member-reconnecting`, `room--budget-80-owner`, `room--budget-95-member`, `room--budget-used-up-owner`, `room--budget-used-up-member`.

- Do these moments hold up best of all? "We really have to shine when things go awry", and Flighty assumes the connection will drop, with a display that keeps working without new data (write-ups.md: Flighty, "Behind the Design"). graeae's stage keeps playing under "Reconnecting…": does the pill reassure rather than alarm, and is it clear nothing is lost?
- Is each state a short plain sentence, read at a glance, as Railway's "Sleeping since 8 hours ago" is (README: Railway, Flighty)? Would a time help where one is known ("since 21:40")? Answer as a note, not a behaviour change.
- Does each state reach only the members it concerns (PRODUCT.md, Principle 4)?
- Is the strip's amber the only colour in it, and only because it is a warning (DESIGN.md, the One Meaning Rule)?

## The owner page: People, the confirms and the removal modal

Captures: `owner--people`, `owner--people-member`, `owner--untick-confirm`, `owner--removal-modal`.

- Do the list's columns line up, with figures right-aligned in tabular numerals, as Resend's tables do (README: Resend)?
- Does each row carry its second line in muted grey ("First room"), as Things places a to-do under its project (README: Things)?
- Does the member panel read as label-over-value facts (README: Resend, log detail)? Is the panel's width and placement settled at 1920, where the list and panel leave space on both sides?
- Does each confirm say what will happen in the order it matters to the owner (who loses what, then what it costs to undo), with the destructive word on its one button?

## The owner page: Invites, Rooms and Usage

Captures: `owner--invites`, `owner--rooms`, `owner--usage`, `owner--usage-past-80`, `owner--raise-confirm`.

- Do the four sections put the same kind of control in the same place: the form, its Save, the list beneath, a row's actions? Linear's refresh began because actions "no longer appeared in predictable places" (write-ups.md: Linear, "A calmer interface").
- Does each setting read as Linear's do: a name, a muted description, and the control at the right, grouped under a heading (README: Linear, preferences)? Settings are a place to design, not an afterthought (write-ups.md: Linear, "Settings are not a design failure"). Linear also runs its settings "like an onboarding experience", which graeae refuses (PRODUCT.md, Principle 3).
- Where a figure is the point (used, budget, projection), is it large, tabular and first, as Flighty's times are (README: Flighty)?
- Does the invite's "on your clipboard" moment say what happened and what to do next, in one line?

## The plain pages

Captures: `rooms--list`, `rooms--sample`, `you--owner`, `you--sample`, `invite--fresh`, `invite--sample`, `setup--secrets-missing`, `nothing-here--stranger`.

- Is each page one small stack whose one job is plain at a glance (README: Linear, profile; Cursor)?
- Does the list of rooms place each room with a quiet second line (who is here, what is live), as Things and Reader do?
- Does "nothing here" stay friendly without explaining what the stranger cannot see?
- Before its data arrives, does each page show the loading slot rather than an empty list that flickers into a full one? Raycast's guidelines ban the "flickering empty state view" (write-ups.md: Raycast, "Prepare an Extension for Store"). The captures show pages after their data; check the moment before by reloading on a slowed network in devtools.

## Across every surface

- **Structure felt, not seen.** Is any line, ring, outline or extra tone step there without a job? Linear found its separators had "quietly proliferated … sometimes appearing without clear reason" (write-ups.md: Linear, "A calmer interface"). graeae has no borders between surfaces; apply the same test to its tones and to the two inset rings DESIGN.md allows.
- **Light mode.** Is light its own set of tone steps rather than dark inverted? Resend: "This wasn't a one-to-one conversion from black to white", with colours' lightness and saturation adjusted for legibility. Linear made "text and neutral icons darker in light mode and lighter in dark mode" (write-ups.md: Resend, "Introducing Light Mode"; Linear, "How we redesigned the Linear UI"). Go through the light tokens one by one, the eye's teal, the stop red and the warning amber included. Check that raised against ground and stage against ground still separate in light at 1366, where the screen is often dimmer. Resend tunes some components in light alone; graeae does not (DESIGN.md, the One Block Rule).
- **Shadows.** Is `--lift` translucent everywhere it is used? Geist: "Opaque shadows leave a gray halo" (write-ups.md: Vercel, "Geist: Colors").
- **1366x768.** Does every surface keep its rhythm, or do the bar's foot and the owner column crowd?
- **One filled button per surface**, everywhere.
- **Copy.** Glossary terms only, no exclamation marks, no day of the week, and labels short and literal.

## Real media only

These need the owner's pass on real media and cannot be captured on the fakes. They are listed in ticket 28's "Needs the owner", item 1: real pictures in tiles and their shape, the hover pill and "Click for sound" over bright content, the sharer's mirrored webcam and cropped screen preview, the "720p" mark and notes over a live picture, and the fullscreen picture and the strip with real games.
