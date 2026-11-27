# 44: Avatar initials sit slightly high

**What to build:** The letter in every avatar is centred, vertically and horizontally.

Owner's note (2026-11-18): "Every letter inside the icon is slightly moved up, not centralized."

`Avatar.svelte` centres the glyph box with `place-items: center` and `line-height: 1`. Geist's capitals sit above the middle of that box, so the letter looks high. Optical centring is needed: `text-box: trim-both cap alphabetic` where supported, or a measured nudge.

Blocked by: none

Status: wontfix

## Comments

### 2026-11-19: measured, and closed as wontfix

**The letters are centred, to within what a pixel can show.** Measured in the built app (fake media) in Chromium, with the avatar's own CSS. Each figure is how far the letter's ink-weighted centre sits from the circle's middle (below 0 is high), for E, H, O and S:

| Avatar | 1x | 2x |
| --- | --- | --- |
| 26px, a row and the bar's top | 0.11–0.13px high | 0.06–0.08px high |
| 32px, the rail | 0.00–0.02px | 0.01–0.02px low |

**The cause the ticket gives is wrong.** Geist's capitals are not above the middle of the glyph box. Its ascent is 1005, its descent 295 and its cap height 710 (per 1000), so at `line-height: 1` there is exactly 0.145em above and below a capital. The 26px avatar's small lift comes from the browser putting the baseline on a whole pixel. `text-box: trim-both cap alphabetic` centres the same box, so it changes nothing; this was measured.

**No nudge does better.**
- `padding-top: 0.5px` on the small avatar changes nothing: the baseline rounds to the same pixel.
- `padding-top: 1px` moves the letter a whole pixel instead: 0.06px low at 1x, 0.11px low at 2x. That is no better at 1x and worse at 2x.

**A false lead.** A standalone page with Geist and a copy of the avatar's CSS put the 26px letter 0.45px high at 1x. The built app does not. Only the built app's figures are recorded above.

**If it still looks high**, it is most likely the owner's screen: a different OS rasteriser, or display scaling of 125%, which these measurements do not cover. A shot of an avatar from that screen, at its real pixels, would show whether the ink there is off.

The `.dev.vars` problem (ticket 46) came up again: the journeys only run once `dist/graeae/.dev.vars` is moved out of the way after the build.
