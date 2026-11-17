---
name: graeae
description: The grey ones. An interface of greys alone, where the only colour is the eye.
colors:
  ground: "#0b0b0c"
  stage: "#111113"
  raised: "#18181b"
  raised-2: "#232326"
  fg: "#ececee"
  soft: "#b9b9bf"
  muted-text: "#8e8e95"
  dim: "#7c7c83"
  faint: "#6b6b72"
  primary-fill: "#ececee"
  primary-text: "#0b0b0c"
  eye: "#62d2de"
  stop: "#f26d6d"
  warn: "#f0b45a"
  letterbox: "#050506"
  mark-dot: "#2e2e33"
  ground-light: "#f4f4f5"
  stage-light: "#ffffff"
  raised-light: "#e9e9eb"
  raised-2-light: "#dcdcdf"
  fg-light: "#0b0b0c"
  soft-light: "#3a3a3f"
  muted-text-light: "#55555c"
  dim-light: "#6b6b72"
  faint-light: "#8a8a91"
  primary-fill-light: "#0b0b0c"
  primary-text-light: "#f4f4f5"
  eye-light: "#0a7f8b"
  stop-light: "#c9302c"
  warn-light: "#a15c00"
  letterbox-light: "#0b0b0c"
  mark-dot-light: "#d4d4d8"
typography:
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "28px"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "22px"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "19px"
  body-strong:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "19px"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  key-hint:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  hair: "2px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.soft}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.fg}"
  button-ghost:
    textColor: "{colors.muted-text}"
    rounded: "{rounded.md}"
    padding: "0 6px"
    height: "24px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  icon-button:
    textColor: "{colors.muted-text}"
    rounded: "{rounded.md}"
    size: "28px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  input-focus:
    backgroundColor: "{colors.raised-2}"
  person-row:
    textColor: "{colors.soft}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  person-row-followed:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  avatar:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.soft}"
    rounded: "{rounded.full}"
    size: "20px"
  stage:
    backgroundColor: "{colors.stage}"
    rounded: "{rounded.xl}"
    padding: "12px"
  stage-tile-picture:
    backgroundColor: "{colors.letterbox}"
    rounded: "{rounded.lg}"
  tooltip:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
---

# Design System: graeae

## Overview

**Creative North Star: "The Grey Ones"**

graeae is named for the three sisters who share one eye, and the interface is built the same way: everything is grey, and the single colour in it is the eye, which means "watching" and nothing else. It is Linear/Vercel minimalism taken all the way. Nothing is decorated; the order, spacing and cohesion of plain elements carry the identity, and the shares (the pictures people are showing each other) supply every other colour on the screen.

The density is that of a desktop tool left open for hours beside a game or as a watch party: a 13px body, 32px rows, a 288px bar of people and an inset stage that takes everything else. Surfaces separate by tone, never by lines. Motion is short and quiet (150ms colour changes, a 220ms eye that lights, a 240ms tile arrival) and every animation stops under reduced motion.

Dark is first and the default; a light mode is offered on the "You" page (Dark / Light / Match system), stored per device and applied before first paint. A theme is one block of the semantic tokens under its own selector; components never name a colour directly. A second theme ("Midnight Broadcast", `.impeccable/reference/later-theme-midnight-broadcast.html`) is planned for later and is not built; it must arrive as another token block, not as component changes.

Rejected by the owner: squarish shapes, decorative drawings that do no job, cursive or "fake creativity" type, and a brand accent sprayed over every control.

**Key Characteristics:**
- Greys for every surface and every word; three colours, each with exactly one meaning.
- Tone, not borders: ground, inset stage, raised rows and controls.
- Geist for everything; Geist Mono only for keyboard hints.
- Rounded everywhere: 6px controls, 8px shares, 12px stage, circles for avatars and the mark.
- One filled button per surface.
- The mark: three grey dots, the middle one lit with the eye.

## Colors

A neutral grey scale from near-black to near-white, with one cyan eye and two reserved signal colours. Frontmatter keys are the dark values (the default); `-light` keys are the same tokens in the light theme.

### Primary
- **The Eye** (`eye`, clear cyan; `eye-light` a deep teal for contrast on white): "watching", and nothing else. It lights the share icons of shares you watch, the dot on the avatar of the member you follow, and the middle dot of the mark (which is the eye). Never a button fill, link colour, focus ring or selection.

### Secondary
- **Stop Red** (`stop`): ending or removing only. Destructive actions rest grey and turn red on hover (Stop, Forget), at 14% tint behind red text, 22% when pressed. The usage meter turns red at 95%.
- **Warning Amber** (`warn`): warnings only. The usage meter turns amber at 80%, and the People list names in amber, with a circled "!", a cut-off the instance could not yet confirm.

### Neutral
- **Ground** (`ground`): the page itself, the bar, the rail and the owner navigation.
- **Stage** (`stage`): the one-step-lighter inset panel: the room's stage, the owner page's content.
- **Raised** (`raised`): a hovered or chosen row, a secondary button, an input, skeleton bars.
- **Raised Two** (`raised-2`): avatars, tooltips, a hovered secondary button, a focused input, the chosen option of a segmented control, the usage track.
- **Foreground** (`fg`): names, headings, values, hovered text.
- **Soft** (`soft`): names at rest in the bar, secondary text, the usage meter's fill below warning.
- **Muted Text** (`muted-text`): labels, captions, ghost buttons, descriptions.
- **Dim** (`dim`): members not here, counts, placeholders, the focus ring.
- **Faint** (`faint`): share icons of shares you are not watching.
- **Primary Fill / Primary Text** (`primary-fill`, `primary-text`): the one filled button: near-white on dark, near-black on light.
- **Letterbox** (`letterbox`): behind a share's picture, near-black in either theme.
- **Mark Dot** (`mark-dot`): the mark's two unlit sisters.
- Selection is `fg` mixed at 22% (dark) / 14% (light) into transparent.

### Named Rules
**The One Eye Rule.** The eye colour means "you are watching this" and appears nowhere else. If an element is not something being watched or the member being followed, it is grey.

**The One Meaning Rule.** Red is only ending or removing; amber is only a warning. A colour never decorates.

**The One Block Rule.** A theme is one block of the semantic tokens under its own selector. Components read tokens (`--ground`, `--raised`, `--eye`...), never hex values, so a new theme changes no component.

## Typography

**Display Font:** none; the system has no display face.
**Body Font:** Geist Variable (with ui-sans-serif, system-ui, sans-serif)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, monospace), only for keyboard hints

**Character:** One neutral grotesque at small, tool-like sizes, weight 400 and 500 only (600 only for avatar initials). Hierarchy comes from weight and grey, not from size jumps.

### Hierarchy
- **Headline** (500, 20px/28px, -0.01em): the page heading of a plain page and the owner page.
- **Title** (500, 15px/22px): the "Nothing here" heading.
- **Body** (400, 13px/19px): the app's body size; descriptions, empty-stage lines.
- **Body Strong** (500, 13px/19px): member names, room names, section titles, button labels, the room name in the bar header.
- **Label** (400, 12px/16px): "Here" / "Not here" headings, counts, captions, share kind under a tile, small buttons, tooltips (500).
- **Key Hint** (Geist Mono 500, 10px): the key in a button or tooltip ("S", "["), at 55% opacity inside a button.

Spacing stays on the 16px rem while the body is 13px. Counts and usage figures use tabular numerals. Headings balance their wrap.

### Named Rules
**The Mono Is For Keys Rule.** Geist Mono appears only on keyboard hints. Numbers use Geist with tabular figures.

**The Plain Words Rule.** No day of the week anywhere; only glossary terms (instance, owner, member, device, invite, room, access, present, share, live, watch, stage, usage, usage budget); no exclamation marks. Never user, account, stream, channel or session.

## Layout

The app is desktop only; no phone layout exists.

**The room.** A full-height row inset 8px from the top, bottom and right. On the left, the bar: 288px wide with 8px side padding; a 44px header (bar toggle and home on the left, the room name centred, the gear on the right), then the people ("Here" with count, 32px rows, the Webcams / Everything / Nothing shortcuts as small ghost buttons, then "Not here" dimmed), and at its foot your own share previews (16:9, with watchers and Stop) above the two share buttons side by side. 288px is chosen so both share buttons fit and a single 16:9 share stays height-limited at 1920x953 (measured 1577x887 in a 1600x913 stage area). The bar folds into a 56px rail of 28px avatars in 36px buttons, with the share buttons stacked as icons at its foot; `[` toggles bar and rail, and the choice is stored per device.

**The stage** fills the rest: an inset panel with 12px padding. Its grid is 1 column for one share, 2 for up to four, 3 for up to six, 4 beyond. Tiles keep their picture's aspect, are sized from the whole stage (as wide as the column allows or as tall as the row allows, whichever is less, with 12px gaps and 26px of caption under each picture) and are packed together in the stage's centre. With a share focused, it takes the stage alone (sized the same way, as one column and one row) and the others drop to a centred strip beneath it: pictures 96px high, 12px apart, scrolling sideways when they overflow.

**Plain pages** (Rooms, You): one centred column, 600px max, 24px side padding, 20px from the top, 40px between header and content and 32px between sections; rows are 56px (rooms) or 48px (devices), bleeding 12px past the column so hover fills align with the text.

**The owner page**: a 224px navigation on the ground (44px header, 32px links, the usage meter always in view at its foot) beside the inset content panel (content 880px max, 40px side padding).

**Centred pages** (invite, "nothing here"): one small stack in the middle of the viewport, the large mark above.

**Addresses:** `/`, `/r/<room>`, `/you`, `/invite/<code>`, `/owner` (to `/owner/people`), `/owner/people|invites|rooms|usage`; anything else is the one "nothing here" page.

Spacing rhythm: 2px between stacked rows, 6px inside controls and between paired buttons, 8px frame inset and row padding, 12px stage padding and tile gaps, 24px and 40px for page-level spacing.

## Elevation & Depth

Flat, layered by tone. Depth is three steps of grey: ground, the lighter inset stage, raised rows and controls. There are no borders between surfaces. The only shadow in the system is the tooltip's soft drop (`0 4px 16px -4px rgb(0 0 0 / 0.4)`), which lifts a floating label off whatever it covers.

### Named Rules
**The Tone Not Lines Rule.** Surfaces separate by tone, never by borders. The two 1px inset rings in the build sit on controls, not surfaces: the outline of an absent member's avatar (absence drawn as an empty circle) and the eye dot's 2px cut-out ring in the colour behind it.

## Shapes

Everything is rounded; nothing is square. Controls, rows, inputs and tooltips take 6px; share pictures and own-share previews 8px; the stage and the owner content panel 12px; skeleton bars and the segmented control's inner options 4px; avatars, the eye dot, the mark's dots and the usage track are full circles or pills. Icons are Lucide line icons at 15px with a 1.75 stroke.

## Components

### Buttons
Quiet and literal; one filled button per surface.
- **Shape:** gently rounded (6px); heights 24 / 28 / 32 / 36px.
- **Primary:** near-white fill with near-black text in dark (inverted in light), 32px high, 12px side padding, at 88% on hover. In the room it is Share screen, with its key hint; on the invite page it is Join.
- **Secondary:** raised grey with soft text; raised-2 and foreground text on hover.
- **Ghost:** muted text with no fill; raised fill and foreground text on hover. Used for the shortcuts and icon buttons.
- **Destructive:** the `destructive` variant rests as a ghost button (Stop adds the raised fill to rest as a secondary) and turns stop-red on hover: 14% stop tint behind stop text, 22% when pressed. Stop and Forget.
- **Focus / Disabled:** a 2px ring in the dim grey, offset 2px; disabled at 40% opacity.
- **Icon buttons:** 28px ghost buttons with 6px corners holding a 15px icon, always named by a tooltip that shows the key when one exists.

### Inputs / Fields
- **Style:** raised fill, no stroke, 6px radius, 32px high, 10px side padding, dim placeholder.
- **Focus:** fill steps to raised-2 and the dim ring appears.
- **Error / Disabled:** a stop-red ring when invalid; 40% opacity when disabled.

### Navigation
Rows, not tabs: 32px, 6px radius, icon and label in body-strong. Rest in muted text; hovered or current takes the raised fill and foreground text. The segmented control on "You" (Dark / Light / Match system) is a raised track with 4px-radius options, the chosen one on raised-2.

### Person Row (signature)
A 32px row: a 20px grey avatar with the initial, the name, and a ghost icon for each live share. Clicking the name follows the member: the row takes the raised fill and an eye dot lights on the avatar (scales in over 220ms). Each share icon watches one share: faint at rest, the eye colour while watched. Your own row leads to "You" with a dim "· you". Members not here are dimmed, their avatar an empty outlined circle, with nothing to click.

### Stage Tile (signature)
The picture at its own aspect on the letterbox colour with 8px corners, a caption beneath (name in soft body-strong, kind in a dim label; a screen share with no sound reads "screen · video only"). Tiles arrive by fading in from 98.5% scale over 240ms. On hover (or keyboard focus) a raised pill at 90% sits in the picture's top-right corner with 28px ghost icon buttons: Focus (layout-panel-top; "Back to the grid", layout-grid, on the focused share), Fullscreen (maximize / minimize) and Stop watching (eye-off). Audio controls join it in ticket 16. A share that goes out at two qualities (a Chromium screen share) leads the pill with the quality choice: "Auto", "1080p" and "720p" as a segmented control of 28px text options in 12px labels with tabular figures, the chosen one on raised-2 with foreground text, the others muted, one stop in the tab order with the arrow keys moving the choice; it starts at Auto. While such a share arrives at 720p its caption ends with a small mark, "720p" in an 11px label on a raised 4px-radius tag, fading in over 180ms. A share with one quality (a Firefox screen share, a webcam) has neither. In the strip the whole picture is a button that focuses it, with a 6% foreground wash on hover, and the pill shrinks to 24px buttons without Focus or the quality choice (the mark stays). A double-click on any picture toggles fullscreen, where the picture fills the screen on the letterbox with square corners. The empty stage offers "Watch everything" as a secondary button, and, while you follow a member who shares nothing, says so instead.

### Own Share
A 16:9 preview at the foot of the bar with "Bia and Caio watching" beneath (names in soft) and a small Stop. A screen share with sound has a 24px audio switch beside Stop (volume-2 while on; volume-off in faint grey while off). A screen share that ended up with no sound has one muted label line under the caption: "Video only. No one hears this share."

### Screen Notice
The first-time notice before the browser's picker, shown once per device. Not a modal: a raised panel with 8px corners and 12px padding above the share buttons in the bar's foot, or floating beside the folded rail (272px, lifted with the tooltip's soft drop). "Before you pick" in body-strong, one line of soft body text, then a ghost Cancel and a secondary "Choose what to share" on raised-2, which takes the keyboard's focus. Escape closes it. It arrives in 180ms, rising 4px. While a screen share of yours is live from any tab or device, "Share screen" reads "Screen live" and is disabled, as "Share webcam" does.

### Tooltip
Raised-2 fill, foreground label text, 6px radius, 4px 8px padding, the soft drop shadow, a 400ms delay; holds the label and its key hint.

### Usage Meter
A 4px pill track in raised-2 with "Usage" and "x of y" above in labels; the fill is soft, amber from 80% and red from 95%.

### The Mark and the Loading Slot
Three circles, the outer two in mark-dot grey and the middle in the eye (6px dots with 4px gaps; 4px/3px small; 12px/10px large). As the loader it passes the lit dot along, each dot holding the eye for a third of a 1.2s loop. `Loading.svelte` is the one loading slot in the app; the owner's friend's eye-passing animation replaces the mark there and the app draws no version of its own. The favicon and the README icon are the same bare three dots with no tile behind them; there the outer dots are muted-text grey (`#8e8e95`), since mark-dot grey would vanish on a dark browser tab.

## Do's and Don'ts

### Do:
- **Do** keep every surface and every word grey; let the shares carry the colour.
- **Do** use the eye only for what is being watched and the member being followed.
- **Do** separate surfaces by tone: ground, inset stage (12px radius), raised rows and controls.
- **Do** keep one filled button per surface.
- **Do** read colours from the semantic tokens so a new theme is one block under its own selector.
- **Do** name every icon-only button with a tooltip, including its key when it has one.
- **Do** stop every animation under reduced motion.
- **Do** use glossary terms only, plain labels ("Forget", "Let back in", "Nothing here"), and no exclamation marks.

### Don't:
- **Don't** use the eye colour for buttons, links, focus, selection or decoration.
- **Don't** use red for anything but ending or removing, or amber for anything but a warning.
- **Don't** draw borders between surfaces.
- **Don't** use square corners or squarish shapes.
- **Don't** add decorative drawings that do no job.
- **Don't** use cursive or novelty type, or any face besides Geist and Geist Mono.
- **Don't** show a day of the week anywhere.
- **Don't** draw a loading animation of your own; use `Loading.svelte`.
