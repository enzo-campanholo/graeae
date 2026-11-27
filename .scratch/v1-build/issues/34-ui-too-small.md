# 34: The UI is too small for the space it has

**What to build:** A larger, more legible scale across the app (type, controls, rows, icons), so that the space on a 1080p screen goes to making things readable and clear rather than to empty margins.

Owner's note (2026-11-18): "Every single text, component, etc. is too small and gets kinda hard to see." On the room list: "The problem is not blank space, the problem is that this blank space could be used to make the UI better, more visible, more intelligible, and it is not. The same kinda applies to everywhere else."

Today the body text is 13px (`app.css`: `--text-sm` 13/19, `--text-base` 15/22, `--text-xs` 12/16), bar rows are one line with 20px avatars, and the plain pages are one narrow centred column.

Blocked by: none. 36, 37 and 42 wait on the scale this one picks.

Status: resolved

## Open questions

- A new type and size scale in `DESIGN.md`, through an impeccable pass, rather than a fix page by page.
- It must keep the 1080p promise: a maximised browser on a 1080p monitor shows a single 16:9 share limited by height, not by the bar. A wider or taller bar eats into the stage.
- Does the room's bar grow too, or only the pages around it?

## Comments

### 2026-11-18: the scale, chosen and built

**The 1080p limit.** On a maximised 1080p window, a single share used 1577 of the stage's 1600px, so the bar had about 23px to grow before the share became limited by the bar instead of by height. The bar may be at most `1888 - (913 - caption) * 16/9` wide. The owner chose to let the bar grow within that limit.

**Options shown.** The sizes became one block of tokens in `app.css`. The owner was shown four scales on the fakes (13 today, 14, 15 and 16), as side-by-side crops at 1:1 and on the dev server with `?scale=`.

| | 13 (was) | 14 | **15 (chosen)** | 16 |
|---|---|---|---|---|
| body / label / heading | 13 / 12 / 20 | 14 / 13 / 22 | 15 / 13 / 24 | 16 / 14 / 26 |
| row / button / avatar | 32 / 32 / 20 | 36 / 34 / 24 | 40 / 36 / 26 | 44 / 40 / 28 |
| bar / plain column / owner column | 288 / 600 / 880 | 304 / 680 / 960 | 316 / 720 / 1000 | 320 / 760 / 1040 |

At 16, a 1366x768 laptop with both shares live loses the Watch row under the fade once six people are here. The owner chose 15.

**What changed.** The trial switch is gone, and the 15 values are the one scale block (`:root` in `app.css`).
- **Type:** body 15/22, label 13/18, title 17/24, headline 24/32, figure 30/38, tag 12/16, key 11.
- **Sizes:** rows 40, list rows 64 and 56, controls 28/32/36/44, icons 18/16/14, avatars 26 and 32, header 52, bar 316, rail 64, owner navigation 256, caption 32, plain column 720, owner content 1000.
- **Components** read these through classes: `h-row`, `h-control*`, `size-icon*`, `w-bar`, `max-w-plain` and the rest. Tailwind's `text-xs/sm/base/xl/2xl` now point at the roles.
- **Owner's note while building:** "if we are changing the size of the text, more stuff needs to be changed. For example, the icons now look small." So every size drawn beside text follows the scale too:
  - icons go up a step: 18, and 16 in the 28px icon buttons (a row's share icons, the audio switch, a note's close);
  - the mark's dots: 7/5, 5/3 and 14/11;
  - the eye dot: 9 and 11;
  - the checkbox: 18;
  - the volume control: 72px, with a 14px knob;
  - the placeholder bars, and the icons on an empty picture (28, on the stage and in your own preview);
  - the confirm dialog: 440;
  - setup and "nothing here" text widths;
  - the owner sections' form or member column: 360;
  - Usage's column, which now follows the owner column.
- **Caption 32, not 30.** At 30 the 316px bar left the share 2px of room, inside the 1080p test's 4px allowance for rounding. At 32 it has about 6px (1572px of stage for a 1566px picture), so the test passes with about 2px to spare.
- **`DESIGN.md`:** the frontmatter, Typography, Layout and Components carry the new sizes, with a new "One Scale Rule".

**Tests.** `test/browser/stage.spec.ts`'s 1080p check now reads the caption from the page (`--caption`) instead of a hard-coded 26px. It went red with the caption at 30 (picture 1569.8px, limit 1568) and is green at 32. Capture sets: `.impeccable/review/captures/scale-13`, `scale-14`, `scale-15b` (final, but taken with the 30px caption, before the owner columns widened to 360) and `scale-16`.

**Left to other tickets:**
- the Watch row's small label buttons (40);
- the key hint in buttons (41);
- the bar and owner navigation widths differing, now 316 and 256 (35);
- the owner page's alignment and layouts (36, 37).

**Not done here:** no deploy; see the closing note below.

From the spec and standards review:
- your own preview's empty-picture icon now matches the stage's;
- `DESIGN.md` names which buttons hold the 16px icons;
- the One Scale Rule lists the sizes still set by hand;
- `ignore.md`'s locked owner column names `--owner` (1000px) instead of 880px. Removing that line is still 36's job;
- the bar header's and the stage note's calcs say what they add up.

### 2026-11-18: closed

The owner closed it at the 15px scale as built in `a83b3ba`. Follow-ups stay with their own tickets: 35 (the bar and the owner navigation widths), 36 and 37 (the owner page's alignment and layouts), 40 (the Watch row), 41 (the key hint in buttons) and 42 (the empty stage).

**Deployed to `graeae-test`** on 2026-11-18, from `485c223` (version `2a1bc4e0`), for the owner to try. The live stylesheet carries the scale (`--body: 15px`, `--bar: 316px`, `--caption: 32px`). Its secrets were left as they were, since no `.secrets` file was uploaded.
