# 41: Key hints inside buttons push the label off centre

**What to build:** Buttons with a keyboard shortcut keep their label aligned. (Owner's screenshot: "Share screen S" next to "Share webcam".)

Owner's note (2026-11-18): "I hate these buttons. The text is misaligned because we put the hotkey there, it looks terrible."

**Blocked by:** none

**Status:** needs-triage

## Open questions

- Move the key to the tooltip only? Or keep it in the button but give it a fixed slot, so that side-by-side buttons line up?
- "Keyed actions show their keys" is a lens rule from ticket 32. A tooltip still shows the key.

## Comments

### 2026-11-19: round 1, three options

Asked which way to take the open question, the owner chose to see options first, as in ticket 40.

**What is wrong now, measured.** "Share screen S" is the only button with its key inside it. The icon, the label, the S and their two 6px gaps are wider than the 147px button, so they spill over its 12px padding. The icon sits 4px from the left edge and the S 4px from the right. The label's centre sits 11px left of where "Share webcam"'s sits.

**Where to look.** `.impeccable/review/captures/t41-r1/compare.html` (not committed). It shows the bar's foot cropped at twice the pixels, with switches for:
- **State:** nothing of yours live (a new `?sample=resting`, on the options branch only), or your webcam live (the usual sample, beside "Webcam live").
- **Theme:** dark and light.
- **Size:** 1366x768 and 1920x953.

Each option is shown at rest and under the pointer. The whole room in each option is beside it as `room--<state>-<option>`, and `measure.json` holds where each label sits. To try them by hand, check out branch `t41-options`, run `pnpm dev:fake-media` and open `/r/den?sample=resting&option=a` (or `b`, `c`, `now`). The choice is kept until another `?option=`. `scripts/capture/options.config.ts` reshoots the set.

- **A, the S in the tooltip only.** The button holds only the icon and "Share screen". A tooltip reads "Share screen S", as on the rail's icon buttons. The button carries `aria-keyshortcuts="S"`.
  - **Gains:** both labels sit at the same centre, and the room's keys then all live in tooltips.
  - **Cost:** the S shows only under the pointer or on keyboard focus. The tooltip repeats the label.
- **B, both buttons as rows, the S in a slot at the right.** Icon and label start 12px in on both buttons, and the S is pinned to the right edge.
  - **Gains:** the S stays in view, and the two labels share a left edge.
  - **Cost:** the buttons are no longer centred. The first try, centred with the S pinned, overlapped "screen" by 8.5px. Even as rows, only 6px is left between "screen" and the S, at 8px from the edge, and the S's 16px slot had to shrink to its glyph.
- **C, the s of "screen" underlined.** No separate key. The s is underlined at 60%, in the style of a menu shortcut letter, with `aria-keyshortcuts="S"`.
  - **Gains:** centred as in A, and the key stays in view without taking any width.
  - **Cost:** an underline is a convention from desktop menus, not the app's key-hint style. It may read as a typo or a link, and a tooltip does not name the key.

**Not in any option:** the rail's Share screen is an icon button, and already shows its S in its tooltip. "Starting" and "Screen live" show no key in any option.

**Rules kept.** Ticket 32's "keyed actions show their keys" holds in all three: in the tooltip (A), in the button (B), or in the label (C). No option changes the bar's width, the click counts or the stage.

**Waiting on the owner:** what you like and dislike in each.
