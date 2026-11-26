# 32: Second critique pass

**What to build:** A short second pass with the impeccable skill's `critique`, `audit` and `polish`, this time on real media as well as the fakes. It uses the craft lens and compares screenshots taken before and after. It carries out the fixes from the owner's grilling on ticket 28's open calls, and runs the real-media checks that ticket 28 left for after ticket 27.

Spec: [The room's screen](../spec.md#the-rooms-screen), [Other pages](../spec.md#other-pages).

**Blocked by:** 28

**Status:** ready-for-human

An agent can do everything here except the real-media checks, which need the owner sharing real windows, a webcam and a game on `graeae-test` alongside it.

## Before the pass

- [x] Fix the three places where the docs disagree with what shipped, all from the grilling:
  - `DESIGN.md`, Layout → "The stage", and Components → Stage Tile: tiles are 16:9 frames, with the picture at its own aspect inside them on the letterbox colour. It now says "Tiles keep their picture's aspect", but the code has never done that (`StageTile.svelte`'s `aspect` defaults to 16/9 and nothing sets it; `Stage.svelte` packs rows at 16/9).
  - `DESIGN.md`, Components → Buttons → Destructive: add that in a confirm whose one job is to remove (the removal modal), the destructive action rests in the stop tint.
  - `PRODUCT.md`, Principle 5: "Nothing owner-only sits in the room beyond the gear and the owner's usage budget warning."
- [x] Run `/impeccable doctor` and repair what it reports. `.impeccable/design.json` has been out of date since ticket 28 changed `DESIGN.md`, so it should be rebuilt from the corrected `DESIGN.md`.
- [x] Take the "before" set: `GRAEAE_CAPTURE=before pnpm capture`. (`before-second-pass`, taken on 2026-11-18, was for the grilling. Take a fresh set after the doc fixes, since the build has not changed.)

## The pass

- [x] Run `/impeccable critique` over every surface, with its two assessments (A, the design review, and B, the detector and browser) as **two isolated subagents** that do not see each other's output, then synthesise. Ticket 28 had to run them in one context. Save the report under `.impeccable/critique/` as the skill does.
- [x] Walk every surface in `.impeccable/reference/craft/lens.md` with its captures open, and answer each question yes, n/a, or with a finding.
- [x] Run `/impeccable audit` and `/impeccable polish` on what the critique and the lens find.
- [x] Critique reads `.impeccable/critique/ignore.md` and drops what it lists: the owner ruled on those on 2026-11-18. Do not raise them again.
- [x] Every finding is fixed, or listed in this ticket with a reason.
- [x] `DESIGN.md` matches what shipped, and `/impeccable doctor` reports nothing afterwards.
- [x] Take the "after" set beside the "before": `GRAEAE_CAPTURE=after GRAEAE_CAPTURE_AGAINST=before pnpm capture`, and look through `.impeccable/review/captures/after/index.html`.

## On real media

Deploy the branch to `graeae-test` (`pnpm run deploy --name graeae-test`). Look at each of these, in both themes, at 1920x953 and 1366x768, and fix or list it. Real media cannot be captured on the fakes, so take screenshots by hand into `.impeccable/review/real-media/` (not committed). These are ticket 28's "Needs the owner", item 1:

- [x] Real pictures in tiles: a portrait window and a 4:3 webcam letterboxed in their 16:9 frames look intended, not broken. Tiles do not take their picture's shape: that is decided (`ignore.md`), so this only checks the look.
- [x] The hover pill (raised at 90%) and "Click for sound" over bright real content, such as a white document: are the pill and its icons still readable?
- [x] The sharer's own preview with a real webcam (mirrored) and a real screen (`object-cover`, so an ultrawide or portrait capture is cropped in the preview): does the crop still show what is being shared?
- [x] The "720p" mark, the sharer's notes and the "Reconnecting…" pill over a live picture.
- [x] The fullscreen picture, and the strip's 96px pictures, with real games.

## Rules (ticket 28's, unchanged)

- [x] No behaviour changes. A reference may suggest a feature; that is a note for after v1, not a fix here.
- [x] Click counts still hold: 1 to watch a member, 1 to share a webcam, 3 to share a screen (4 the first time on a device).
- [x] A maximised browser on a 1080p monitor still shows a single 16:9 share limited by height, not by the bar.
- [x] Every Seam 1 and Seam 2 test passes untouched. `pnpm test`, `pnpm typecheck` and `pnpm lint` pass.

## After v1, not in this pass

From the grilling, as notes only:

- A sign in the folded rail that a note is waiting for the sharer. Notes live under the previews, which the rail does not have, so a sharer who keeps the rail folded never sees one.
- A time on "reconnecting" ("since 21:40"), as the lens asks under "Status in the room".

## Comments

**2026-11-18: the owner's grilling on ticket 28's open calls.** The owner kept every call: ticket 28's four taste calls ("Watch" before the shortcuts, the centred last row, "Screen live" resting as a secondary, the centred owner column), 16:9 tile frames rather than tiles in the picture's shape, and the choices from tickets 06, 08, 09, 14, 16, 18 and 24. Each one is in `.impeccable/critique/ignore.md` with its reason. Nothing was undone, so the only fixes are the three doc fixes under "Before the pass", where `DESIGN.md` and `PRODUCT.md` disagree with what shipped. They come before `/impeccable doctor`, so `.impeccable/design.json` is rebuilt once, from the final `DESIGN.md`.

**2026-11-18: the pass on the fakes.** On `v1-build`. Everything here except "On real media", which still needs the owner. No migration.

- **Docs.** The three fixes from the grilling are in `DESIGN.md` (16:9 frames with the picture letterboxed inside; the removal modal's Remove resting in the stop tint) and `PRODUCT.md` (Principle 5 names the owner's usage budget warning). `/impeccable doctor` then reported the stale sidecar and an unset `buildPath`. The sidecar `.impeccable/design.json` was rebuilt from the corrected `DESIGN.md`, and again after this pass's changes. `.impeccable/config.json` records `"buildPath": "code"`, which the surface brief already said ("code-led"). Doctor now reports nothing.
- **Method.** "Before" set taken after the doc fixes. Critique with A (design review) and B (detector and browser) as two isolated subagents, synthesised in the main context. The lens was walked separately over the captures. `ignore.md` was applied, and nothing it lists was raised. The critique scored 29/40 (Good) and the audit 16/20 (Good). Both reports are saved under `.impeccable/critique/` and `.impeccable/audit/` as the skill does; the skill's own `.gitignore` keeps them local, so their findings are below. The critique snapshot could not be closed: `critique-storage latest` does not read back a directory target (exit 2).
- **Fixed:**
  - *The sharer's foot at 1366x768* (P1). With screen and webcam both live plus notes, the people list shrank to four rows with a sliver of a fifth, and the Watch row went out of view. Now, on a window under 800px tall with both your shares live, each preview steps down to a 16:9 thumbnail 112px high (`OwnShare.svelte`, `paired` from `Room.svelte`). The people list scrolls under a 16px fade at the foot, so a cut row reads as more below (`Bar.svelte`). Nothing changes at 1080p.
  - *Light-theme stop tint* (P2). Remove in the removal modal was 3.59:1 at rest and 3.19:1 on hover. `--stop` light is now `#a02421`: 4.98:1 at rest and 4.35:1 on hover on raised, and AA on ground.
  - *Sound and rail icons under 3:1* (P2). A muted share's speaker and volume on the pill were 2.29:1 over the letterbox in light. They now go `dim` instead of `faint`: 3.53:1 in light and 4.35:1 in dark. Your own audio switch while off does the same. The folded rail's live share buttons now rest with a muted icon, as the bar's "Webcam live" does (`faint` on raised was 2.83:1).
  - *The key hint in the primary button* was 4.18:1 in dark at 55%. It is now 60% (4.93:1).
  - *`--dim`* moves to `#808087` (dark) and `#65656c` (light), so "· you" and "· reconnecting" on a hovered or followed row pass on raised (4.52:1 and 4.77:1).
  - *Usage settings hierarchy* (P2). "Usage budget" and "Reset day" were the same muted label as their field labels. They are now titled in body-strong foreground, as the "You" page's settings are. "This month" stays a muted data heading, like the owner page's list headings. This settles ticket 28's left item more narrowly: the list headings keep their style, and only the two settings change.
  - *The removal confirm* read "Their screen share in First room and webcam share in First room end…". Shares are now grouped by room: "Their screen and webcam shares in First room end…".
  - *The focus strip* hard-clipped its last tile at 1366. It now scrolls under a 16px fade at each end, as the bar's people do.
  - *Tokens.* `rounded-[4px]` became `rounded-sm` (3 places); `text-[15px] leading-[22px]` became `text-base` (2); `text-[13px] leading-[19px]` became `text-sm` (1). The 24px Usage figures get a `figure` type step in `DESIGN.md`. The Avatar's local `--ring`, which shadowed the focus-ring token, is now `--cutout`.
  - *The evidence.* The samples contradicted the product: absent members' shares on the stage, Caio's webcam on the stage with no webcam in his row, and a follow beside other watched shares. Each variant is now a state the room can be in: "one" follows Caio, and "busy" has Edu here with Fê away. The tile counts are unchanged. The "usage past 80%" shot was taken before the Usage page asked again (0 GB); the capture now reloads first.
- **Lens answers.** Yes unless listed here or under "Looked at and left".
  - The bar recedes behind the stage. The followed row leads in both themes and both sizes. Icons are one size and stroke, rows are one line, and the dot-joined marks are one grey.
  - Keyed actions show their keys.
  - Captions recede. The empty stage is one line with one action. The strip reads as "the others".
  - The pill is clear of the tile at rest, every control is named with its key, and sound reads from the caption.
  - The 48 fps note leads with its state.
  - The screen notice and the hand-over each ask one question with one default.
  - The reconnecting pill reassures, and each status reaches only the members it concerns. Amber is the strip's only colour.
  - People columns align with tabular figures, second lines are muted, and the panel reads label over value.
  - The four owner sections put form, Save and list in the same places, and the Usage figures lead.
  - Plain pages are one small stack each and show skeleton rows before their data.
  - Light is its own set of steps, `--lift` is translucent, there is one filled button per surface, and the copy is in glossary terms.
  - Findings: 1366 crowding, Usage hierarchy and the strip's clip (fixed above).
- **Looked at and left, with reasons:**
  - The bar's name buttons are announced "Bia, toggle button, pressed" with no verb, while the rail's say "Follow Bia". Seam 2 journeys find these buttons by those names (`presence.spec.ts`, `reconnecting.spec.ts`), and this pass leaves tests untouched. A note for after v1, with the tests.
  - The placeholder on a *focused* input (raised-2) is about 4.0:1 in dark and 4.2:1 in light. It passes at rest. Reaching 4.5:1 there would make dim nearly muted-text, collapsing a grey step.
  - Stop text on its 22% hover tint over raised, in dark, is 4.34:1: a hover-only near-miss.
  - Ghost buttons ("Forget") sit inset by their padding from status text such as "present". This is the system's pattern, so the hover fill lines up with the row, as on "You".
  - The member panel says "present" in its header and on the room row. The row's mark is needed once there are several rooms.
  - "relay" in the Usage help is not a glossary term. It is owner-facing, factual copy from ticket 27; changing a claim is the owner's call.
  - The invite page has no wordmark. It is the locked centred sketch (the mark above one action).
  - "No one is sharing yet." for the owner alone is flatter than "Nothing here". Pointing it at invites would be the onboarding PRODUCT.md refuses.
  - On the "You" page, the light captures show "Dark" chosen. The capture toggles the class, not the stored choice, so this is not an app defect.
  - The detector's 27 findings are false positives, all in the dev-only `SampleScene.svelte`, which draws share content.
- **After v1, notes only:**
  - Esc from focus back to the grid.
  - Keys for Share webcam and Watch everything/nothing.
  - The bar telling the same story as the stage once the budget is used up: its shortcuts and icons stay live.
  - A date on the used-up stage.
  - A confirm before the owner forgets another member's only device.
  - Names with a verb on the bar's rows.
- **Checks.** `pnpm typecheck` and `pnpm lint` pass. The tests passed untouched, run as `pnpm test`'s two halves one after the other, with one browser worker: `vite build --mode fake-media && vitest run` (Seam 1, 427 passed), then `playwright test --workers=1` (Seam 2, 39 passed). The click counts and the 1080p measure are the journeys' own, and they pass. The "after" set is complete beside "before" (164 shots each). It was taken one project at a time (`--project=samples`, then `--project=journeys`), because a first full run alongside a spare dev server was killed by systemd-oomd on this 7.6 GB machine. One at a time, available memory never fell below 3.5 GB, and the samples went from three to one with no stall.
- **Not verified here:** everything under "On real media" (tiles, the pill and "Click for sound" over bright content, the mirrored and cropped previews, which now include the 112px thumbnails at 1366, the "720p" mark, notes and pill over a live picture, fullscreen and the strip with real games). Also the stage-to-ground separation on a dim laptop panel, the new light stop red on a real screen, the full `pnpm capture` in one run, and the full `pnpm test` as one command.

**2026-11-20: the real-media checks, by an agent on Linux.** On `v1-build`, deployed to `graeae-test` (versions f32ea347, then c6cea19e with the fixes below). Two members, "Linux A" sharing and "Linux B" watching, each a headed Chromium 157.0.8103.78 on its own virtual X display (Xvfb with openbox, PulseAudio on a null output) on NixOS, in the room "First room", driven by the new `pnpm real-media` (`scripts/real-media/`, a manual script like `pnpm capture`, never in `pnpm test`). Every picture went through Cloudflare's media server. Each check was shot in both themes at 1920x953 and 1366x768 (fullscreen at 1920x1080 and 1366x768) into `.impeccable/review/real-media/`, and each shot was looked at with the lens. No migration.

- **Content.** This machine's built-in webcam cannot be opened by the agent's user, so the webcam is Chromium's fake camera playing a generated 640x480 (4:3) picture of a head and shoulders with "4:3 CAM" in a corner, which shows the mirroring. The window, screen and tab are pages from `scripts/real-media/content.html`: a 600x1000 portrait window, a full-colour canvas animation at 60 fps standing in for a game (whole 1920x1080 screen, and a 3440x1440 ultrawide screen), and a white text document in a tab playing a 440 Hz tone. Encoding was OpenH264 in software throughout (no GPU on a virtual display), so every preview also carried the software note.
- **Real pictures in tiles.** The portrait window and the 4:3 webcam sit between letterbox bars in their 16:9 frames and read as intended in both themes, as does the 21:9 ultrawide screen (bars above and below). In light the near-black bars stand out on the white stage, as the letterbox colour is meant to. Yes.
- **The hover pill and "Click for sound" over a white document.** The pill (volume, Focus, Fullscreen, Stop watching) stays readable over white in both themes; in light its edge against white is faint, but its icons and the volume track are clear, so it is left. "Click for sound" with its soft drop reads in both themes, full and icon-alone in the strip. This Chromium never refused the sound (a new tab already counted as clicked, `navigator.userActivation.hasBeenActive`), so the refusal was stood in for: `play()` with sound was refused in the page until restored. The pill, the picture and the first click letting the sound in are real.
- **The sharer's previews.** The mirrored webcam reads as a mirror (the corner text reversed, the shelf on the other side). A screen preview filled with `object-cover` showed only a middle band of the portrait window, a third of its height, so it did not show what was being shared; an ultrawide lost its sides. Fixed: see below.
- **"720p" mark:** n/a. It shows only on a share sent at two qualities, which are switched off for this release (ticket 29).
- **The sharer's notes**, caused for real: "Video only. No one hears this share." for a window and a whole screen, "Encoded in software…" under every preview, and "Capturing at 48 fps…" from a tab whose page drew at 48 fps (the capture read 48 for over 8 seconds). They sit under the previews, not over a picture, and read in both themes. The upload note cannot appear: the step-down is switched off (ticket 18).
- **"Reconnecting…"**, caused for real by taking Linux B's network offline through DevTools (the page's socket dropped; the media connection is not affected by it, so the pictures kept playing at 60 fps underneath). The pill appeared after about 3 seconds over the grid and over a focused white document, readable in both themes, and went once back online.
- **Fullscreen and the strip with a game.** The fullscreen picture fills the screen on the letterbox with the pill in its corner while hovered. The game reads as a picture at 96px in the strip. Finding: the strip's caption cut the name to "Linux …" because the name and "screen · video only" shrank alike. Fixed: see below.
- **Fixed** (no behaviour changes; click counts and the 1080p measure are untouched):
  - *The sharer's screen preview* now shows the whole capture at its own aspect on the letterbox (`object-contain`), as the stage's tiles do; the webcam still fills its preview, mirrored (`SharePreview.svelte`). A 16:9 screen looks as before. Re-shot as `after-sharer-portrait-preview` and `after-sharer-ultrawide-preview`.
  - *A tile's caption* gives way at the kind first: the name keeps its width, up to the whole caption (`StageTile.svelte`), so the strip reads "Linux A screen · video on…". Re-shot as `after-strip-caption`.
  - `DESIGN.md`, Own Share and Stage Tile, say both. `.impeccable/design.json` was already older than `DESIGN.md` before this pass (the design hook said so); it was not rebuilt here.
- **Looked at and left:** with both shares live and a software note under each, the bar's people list shows about four rows at 1920x953 and one "Not here" row at 1366x768, the rest scrolling under the fade. On Windows with hardware encoding there is no software note, so the list is taller; the 112px thumbnails stay below 800px tall only.
- **Checks.** `pnpm typecheck` and `pnpm lint` pass. The tests pass untouched, run as before one after the other: `vite build --mode fake-media && vitest run` (450 passed), then `playwright test --workers=1` (60 passed).
- **Still for the owner's eyes:** all of it on Windows Chrome with a real webcam, a real game and hardware encoding (the encode, frame rate and look of a real game at 1080p60 differ from a canvas animation encoded in software); whether a real Chrome ever shows "Click for sound" at all, since it needs a page nobody has clicked; the light theme's faint pill edge over white on a real panel; and the earlier items (the stage-to-ground separation on a dim laptop panel, the light stop red on a real screen).

**2026-11-24: Windows screenshots for the owner's look.** Build ticket 65's check 7 shot the stage, the hover pill, the focused picture, fullscreen and the 96px strip, each with Win Chrome's hardware-encoded game window in it, in both themes at 1920x953 and 1366x768. They are under `docs/evidence/windows-2026-11-24/07-*.png` on `evidence/windows-2026-11-24`. A reopened tab counted as clicked under automation, so "Click for sound" did not show; whether a real Chrome shows it is still the owner's to see. The real webcam, the light pill's edge over white on a real panel, the light stop red, and stage against ground on a dim panel are still for the owner too.
