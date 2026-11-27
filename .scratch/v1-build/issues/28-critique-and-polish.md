# 28: Critique and polish

**What to build:** One pass over every surface with the impeccable skill's `critique`, `audit` and `polish`, so the app reads as one design and not twenty tickets' worth.

Spec: [The room's screen](../spec.md#the-rooms-screen), [Other pages](../spec.md#other-pages).

Blocked by: 14, 16, 24, 27

Status: resolved

- [x] Critique, audit and polish the room: bar, rail, stage in grid and focus, hover controls, the sharer's previews and notes, the strips
- [x] The same for the owner page's four sections and the removal modal
- [x] The same for the list of rooms, the "You" page, the invite page, the setup page and "nothing here"
- [x] Every finding is fixed or listed in this ticket with a reason
- [x] `DESIGN.md` matches what shipped
- [x] Click counts still hold: 1 to watch a member, 1 to share a webcam, 3 to share a screen (4 the first time on a device)
- [x] A maximised browser on a 1080p monitor still shows a single 16:9 share limited by height, not by the bar
- [x] No behaviour changes; every Seam 1 and Seam 2 test passes untouched

## Comments

**2026-11-17: the pass on the fakes, before ticket 27.** On `ticket/28-critique-and-polish`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass, with no test changed. No migration. The owner is away and ticket 27 (the real media pass) has not happened, so this pass ran on the fakes: `pnpm dev:fake-media` with `?sample` (`one`, `none`, `busy`, and the rail) for the room, the list of rooms, "You", the invite page and "nothing here", and real journeys on the fakes for the rest (setup, whose "secrets are missing" state was read from its code since the dev server always has the secrets; four members joining, webcams and screens with and without sound, watching everything, hover controls, focus and the strip, the sharer's three notes from fed statistics, the screen notice, the rail, all four owner sections, the removal modal, an invite made, a second room). Screenshots at 1920x953 and 1366x768, dark and light. The impeccable skill's critique, audit and polish ran in one context, since this brief allows no subagents (the skill's critique wants two). The skill's questions were not asked and its reports were not saved under `.impeccable/critique/`, so this branch changes only the UI and `DESIGN.md`. The decisions are below.

- **The critique.** The app already reads as one design: one grey scale, one eye, one shadow, one radius scale, Geist throughout, and the same heading, row and panel patterns in the room, the plain pages and the owner page. The detector found one thing outside DESIGN.md (the "720p" mark's 11px, which DESIGN.md described in prose; it is now a `mark-tag` type step). Contrast holds in both themes; the closest is dim text on the stage in dark (4.55:1). Nielsen scores ran 32/40 (Good). The weakest were recognition (the unlabelled shortcuts) and consistency (two looks for "live").
- **Fixed:**
  - *The grid's last row.* With 3 shares in 2 columns or 7 in 4, the short last row sat on the left with an empty quadrant beside it. It is now centred under the rows above. The stage lays tiles out in wrapping rows, at most the table's number of columns wide (`Stage.svelte`), so the column table, the tile sizes and the 1080p promise are unchanged.
  - *"Screen live".* It was the primary button at 40%, a washed-out grey block, while "Webcam live" rested crisp on raised. Both live states now rest alike (raised, muted text, not dimmed), in the bar and in the rail. "Starting" keeps the dimmed primary, since it is a moment of waiting.
  - *The shortcuts.* "Webcams Everything Nothing" now has a dim "Watch" in front, which is also the group's accessible name, so "Nothing" reads as "watch nothing". It is in the same place, with the same buttons and the same clicks.
  - *The owner page's column* (880px) is now centred in its panel instead of hugging the navigation. That left up to 800px empty on its right at 1920.
  - *One shadow token.* The tooltip's soft drop was written out six times. It is now `--lift` (`shadow-lift`), used by the tooltip, both confirms, the floating notice, "Reconnecting…" and "Click for sound".
  - *Ticket 08's Invites race.* Typing a new name while an invite was being made was wiped when the answer came back. Now only the name that was sent is cleared, as in the Rooms section. This is the one behaviour change, and it was asked for.
- **Looked at and left, with reasons:**
  - The Usage section's group titles ("Usage budget", "Reset day") and their field labels ("GB a month") share the muted label style. It matches every owner heading ("This month", "Waiting to be used", "Every room", "Member"); raising those two alone would break it.
  - The quiet sharer notes ("Encoded in software…") wrap early under `text-pretty` to avoid a one-word last line. That is intended.
  - Below about 1280px wide the owner page's People section gets tight. The app is desktop only by design.
  - Ticket 14's "Share webcam before the socket opens" finding was fixed by ticket 22.
- **`DESIGN.md`** now has the `mark-tag` step, the "Watch" label, the rail's brighter initial for a member who shares (built in 02, never written down), the centred last row, the centred owner column, the `--lift` token, the resting "Screen live", and the stage's top pills and strip settling down from above (the code always did; DESIGN.md said "rising").
- **Checks:** the click counts are the journeys' own (`screen.spec.ts`, `stage.spec.ts`, `shares.spec.ts`), and so is the 1080p measure (`stage.spec.ts`). They pass untouched.

**Needs the owner:**
1. **A short second pass after ticket 27**, on real media. Look at, and fix or list:
   - Real pictures in tiles. Every tile is 16:9 with the picture letterboxed inside (`object-contain`), since a tile's `aspect` is never set from the video. Decide whether a portrait window or a 4:3 webcam should take its own shape. If so, set `aspect` on `StageTile` from the video, and `Stage.svelte`'s row width (which assumes 16:9) must follow.
   - The hover pill (raised at 90%) and "Click for sound" over bright real content, such as a white document.
   - The sharer's own preview with a real webcam (mirrored) and a real screen (`object-cover`, so an ultrawide or portrait capture is cropped in the preview).
   - The "720p" mark, the notes and the reconnecting pill over a live picture.
   - Whether the fullscreen picture and the strip's 96px pictures read well with real games.
2. **Taste calls made here, to keep or undo:** the "Watch" label before the shortcuts, the centred last row, "Screen live" resting as a secondary, and the owner column centred.
3. **Earlier tickets' design choices, kept as they are, for you to judge:**
   - 06: a reconnecting member gets a dim "· reconnecting" and a breathing avatar, with no colour.
   - 08: the Rooms section shows addresses without the scheme, and a new room grants access to the owner alone.
   - 09: a member unticked from their only room stays a member with no room. The removal modal for an absent member leaves out the "about 2 seconds" line. The confirm's Remove rests in the stop tint.
   - 14: "Webcams" and "Everything" replace the stage rather than add to it. A name that shares nothing is followed and empties the stage. Clicking the followed name again does not unfollow. The column table stays as the spec fixes it.
   - 16: the volume is kept per member on the device, and mute is forgotten with the watch. "Hear only" is an action, not a mode. A muted caption reads "screen · muted", and a webcam's caption stays "webcam".
   - 18: a dismissed note comes back only after it goes away by itself and holds again. Notes are grey, not amber, and there are none in the rail.
   - 24: viewers click again once watching is allowed. The owner's 80% strip sits in the room, although PRODUCT.md keeps owner chores out of it, because the spec puts it there.

**Code review fixes** (final review of `v1-build`, on `review/v1-build-fixes`). `pnpm test` (Seam 1 and Seam 2), `pnpm typecheck` and `pnpm lint` pass. Each fix is its own commit, so a refactor can be reverted alone.

- **Forgotten devices are cut off** (finding 1, test-first). Using the setup secret again, and pressing an invite on a browser that is already remembered, now cut off each device they forget through ticket 20's cut-off routine, as forgetting a device from the "You" or People page does: its tabs leave at once, hear `gone` and close, and their shares and watching end. "Let back in" takes the same path (`Instance.devicesForgotten`); its closes no longer hold up the join's answer. `People.becomeOwner` and `People.join` return every device they forgot with its member. A hand-over cannot carry a cut-off tab's watch, since a cut tab is no longer open. Two tests that kept a forgotten device's tab open to check refusals (`shares.test.ts`, `watching.test.ts`) now expect it cut off.
- **Usage reports** (finding 2, test-first). A report is checked like any request that adds something (device and access). **Decision:** a total counts from zero only once the instance itself has made the tab a new media connection or restarted its old one (`Usage.newTotal`, called on `connect` and on an answered `restart`). A total lower than the last on the same connection is ignored, and `final` alone resets nothing, so a tab cannot have what it already reported charged again. This matches the spec's "differences between running totals" and "a final total before a connection restart, which resets the total". The two tests that sent `final` or a lower total with no new connection now make one; two new tests check that a lower total and a repeated `final` charge nothing. Left as it is: a refused restart's few seconds between its two final totals go uncounted, and a tab can still overstate a first total; members are trusted, and the instance has no figure to hold a total against.
- **`CLAUDE.md`** names the fake media server's controls as a Seam 1 surface, and lets `test/harness.test.ts` reach inside (finding 3).
- **"Viewer"** is "watcher" throughout `shares.ts` (finding 4). The prose elsewhere and the spec still say "viewer" of a person, which the glossary does not forbid.
- **Requests** (finding 5): `src/shared/socket/requests.ts` checks each request by `<area>.<type>` (one validator map, with `isShareKind` in `shares.ts` beside `ShareKind`), and `Instance` handles each through a handler map. Malformed starts are still refused, and anything else malformed still ignored.
- **Duplicates** (finding 6): `withAudio` in `instance.ts`, and `src/app/pages/owner/ConfirmDialog.svelte` under both confirms, with the same classes.
- **Splits** (finding 7): `shares.ts` loses its retry backoff (`retries.ts`), faltering timers (`faltering.ts`) and hand-over marks (`hand-overs.ts`); the room client loses its usage reports (`usage-reports.ts`). **Declined, with reasons:** the sweep, the retries' re-runs and the hand-over's moves stay in `Shares`, since each runs its close routines and reads its in-flight sets; moving them out would mean exposing those internals, a shallower module behind a wider interface. The relay renewal stays in the room client: its decision already lives in `media/renewal.ts`, and the rest drives the room client's own negotiation and rebuild.
- **Tabs** (finding 8): in `Shares`' interface, its listener, `Covered` and `Ended`, a parameter named `tab` is a `Tab` and a tab's id is `tabId`. Record fields and local variables keep `tab`.
- **Declined** (finding 9): `Instance.migrations` and `Instance.relayLives` stay. A Durable Object gets only its state and its bindings, and making either a binding would turn a test-only setting into deploy configuration.

**2026-11-18: the owner ruled on "Needs the owner".** Items 2 and 3, and item 1's question about the tiles' shape, were settled in a grilling: every call stays, each listed with its reason in `.impeccable/critique/ignore.md`. The rest of item 1 (checks on real media) moved to ticket 32, together with the three doc fixes the grilling found, `/impeccable doctor`, and the second pass.
