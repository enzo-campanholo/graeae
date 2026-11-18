# 32: Second critique pass

**What to build:** A short second pass with the impeccable skill's `critique`, `audit` and `polish`, this time on real media as well as the fakes. It uses the craft lens and compares screenshots taken before and after. It carries out the fixes from the owner's grilling on ticket 28's open calls, and runs the real-media checks that ticket 28 left for after ticket 27.

Spec: [The room's screen](../spec.md#the-rooms-screen), [Other pages](../spec.md#other-pages).

**Blocked by:** 28

**Status:** ready-for-human

An agent can do everything here except the real-media checks, which need the owner sharing real windows, a webcam and a game on `graeae-test` alongside it.

## Before the pass

- [ ] Fix the three places where the docs disagree with what shipped, all from the grilling:
  - `DESIGN.md`, Layout → "The stage", and Components → Stage Tile: tiles are 16:9 frames, with the picture at its own aspect inside them on the letterbox colour. It now says "Tiles keep their picture's aspect", but the code has never done that (`StageTile.svelte`'s `aspect` defaults to 16/9 and nothing sets it; `Stage.svelte` packs rows at 16/9).
  - `DESIGN.md`, Components → Buttons → Destructive: add that in a confirm whose one job is to remove (the removal modal), the destructive action rests in the stop tint.
  - `PRODUCT.md`, Principle 5: "Nothing owner-only sits in the room beyond the gear and the owner's usage budget warning."
- [ ] Run `/impeccable doctor` and repair what it reports. `.impeccable/design.json` has been out of date since ticket 28 changed `DESIGN.md`, so it should be rebuilt from the corrected `DESIGN.md`.
- [ ] Take the "before" set: `GRAEAE_CAPTURE=before pnpm capture`. (`before-second-pass`, taken on 2026-11-18, was for the grilling. Take a fresh set after the doc fixes, since the build has not changed.)

## The pass

- [ ] Run `/impeccable critique` over every surface, with its two assessments (A, the design review, and B, the detector and browser) as **two isolated subagents** that do not see each other's output, then synthesise. Ticket 28 had to run them in one context. Save the report under `.impeccable/critique/` as the skill does.
- [ ] Walk every surface in `.impeccable/reference/craft/lens.md` with its captures open, and answer each question yes, n/a, or with a finding.
- [ ] Run `/impeccable audit` and `/impeccable polish` on what the critique and the lens find.
- [ ] Critique reads `.impeccable/critique/ignore.md` and drops what it lists: the owner ruled on those on 2026-11-18. Do not raise them again.
- [ ] Every finding is fixed, or listed in this ticket with a reason.
- [ ] `DESIGN.md` matches what shipped, and `/impeccable doctor` reports nothing afterwards.
- [ ] Take the "after" set beside the "before": `GRAEAE_CAPTURE=after GRAEAE_CAPTURE_AGAINST=before pnpm capture`, and look through `.impeccable/review/captures/after/index.html`.

## On real media

Deploy the branch to `graeae-test` (`pnpm run deploy --name graeae-test`). Look at each of these, in both themes, at 1920x953 and 1366x768, and fix or list it. Real media cannot be captured on the fakes, so take screenshots by hand into `.impeccable/review/real-media/` (not committed). These are ticket 28's "Needs the owner", item 1:

- [ ] Real pictures in tiles: a portrait window and a 4:3 webcam letterboxed in their 16:9 frames look intended, not broken. Tiles do not take their picture's shape: that is decided (`ignore.md`), so this only checks the look.
- [ ] The hover pill (raised at 90%) and "Click for sound" over bright real content, such as a white document: are the pill and its icons still readable?
- [ ] The sharer's own preview with a real webcam (mirrored) and a real screen (`object-cover`, so an ultrawide or portrait capture is cropped in the preview): does the crop still show what is being shared?
- [ ] The "720p" mark, the sharer's notes and the "Reconnecting…" pill over a live picture.
- [ ] The fullscreen picture, and the strip's 96px pictures, with real games.

## Rules (ticket 28's, unchanged)

- [ ] No behaviour changes. A reference may suggest a feature; that is a note for after v1, not a fix here.
- [ ] Click counts still hold: 1 to watch a member, 1 to share a webcam, 3 to share a screen (4 the first time on a device).
- [ ] A maximised browser on a 1080p monitor still shows a single 16:9 share limited by height, not by the bar.
- [ ] Every Seam 1 and Seam 2 test passes untouched. `pnpm test`, `pnpm typecheck` and `pnpm lint` pass.

## After v1, not in this pass

From the grilling, as notes only:

- A sign in the folded rail that a note is waiting for the sharer. Notes live under the previews, which the rail does not have, so a sharer who keeps the rail folded never sees one.
- A time on "reconnecting" ("since 21:40"), as the lens asks under "Status in the room".

## Comments

**2026-11-18: the owner's grilling on ticket 28's open calls.** The owner kept every call: ticket 28's four taste calls ("Watch" before the shortcuts, the centred last row, "Screen live" resting as a secondary, the centred owner column), 16:9 tile frames rather than tiles in the picture's shape, and the choices from tickets 06, 08, 09, 14, 16, 18 and 24. Each one is in `.impeccable/critique/ignore.md` with its reason. Nothing was undone, so the only fixes are the three doc fixes under "Before the pass", where `DESIGN.md` and `PRODUCT.md` disagree with what shipped. They come before `/impeccable doctor`, so `.impeccable/design.json` is rebuilt once, from the final `DESIGN.md`.
