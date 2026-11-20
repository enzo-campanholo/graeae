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
  dim: "#808087"
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
  dim-light: "#65656c"
  faint-light: "#8a8a91"
  primary-fill-light: "#0b0b0c"
  primary-text-light: "#f4f4f5"
  eye-light: "#0a7f8b"
  stop-light: "#a02421"
  warn-light: "#a15c00"
  letterbox-light: "#0b0b0c"
  mark-dot-light: "#d4d4d8"
typography:
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "32px"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: "24px"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  body-strong:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "22px"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  mark-tag:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  key-hint:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "11px"
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
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.soft}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.fg}"
  button-ghost:
    textColor: "{colors.muted-text}"
    rounded: "{rounded.md}"
    padding: "0 6px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  icon-button:
    textColor: "{colors.muted-text}"
    rounded: "{rounded.md}"
    size: "32px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  input-focus:
    backgroundColor: "{colors.raised-2}"
  person-row:
    textColor: "{colors.soft}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "40px"
  person-row-followed:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  avatar:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.soft}"
    rounded: "{rounded.full}"
    size: "26px"
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

The density is that of a desktop tool left open for hours beside a game or as a watch party: a 15px body, 40px rows, a 316px bar of people and an inset stage that takes everything else. Surfaces separate by tone, never by lines. Motion is short and quiet (150ms colour changes, a 220ms eye that lights, a 240ms tile arrival) and every animation stops under reduced motion.

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
- **Stop Red** (`stop`): ending or removing only. Destructive actions rest grey and turn red on hover (Stop, Forget; the removal modal's Remove rests in the tint), at 14% tint behind red text, 22% when pressed. The usage meter turns red at 95%.
- **Warning Amber** (`warn`): warnings only. The usage meter turns amber at 80%, and the People list names in amber, with a circled "!", a cut-off the instance could not yet confirm.

### Neutral
- **Ground** (`ground`): the page itself, the bar, the rail and the owner navigation.
- **Stage** (`stage`): the one-step-lighter inset panel: the room's stage, the owner page's content.
- **Raised** (`raised`): a hovered or chosen row, a secondary button, an input, skeleton bars, an owner section's inspector, the empty stage's choices.
- **Raised Two** (`raised-2`): avatars, tooltips, a hovered secondary button, a focused input, the chosen option of a segmented control, a lit watch shortcut, the usage track, inside the inspector its inputs, secondary buttons, hovered rows and rules, and in the You Menu its highlighted item and its rule.
- **Foreground** (`fg`): names, headings, values, hovered text.
- **Soft** (`soft`): names at rest in the bar, secondary text, the usage meter's fill below warning.
- **Muted Text** (`muted-text`): labels, captions, ghost buttons, descriptions.
- **Dim** (`dim`): members not here, counts, placeholders, the focus ring, and a muted share's speaker and volume (and your own audio switch while off).
- **Faint** (`faint`): share icons of shares you are not watching, and the watch shortcuts that are not lit.
- **Primary Fill / Primary Text** (`primary-fill`, `primary-text`): the one filled button: near-white on dark, near-black on light.
- **Letterbox** (`letterbox`): behind a share's picture, near-black in either theme.
- **Mark Dot** (`mark-dot`): the mark's two unlit sisters.
- Selection is `fg` mixed at 22% (dark) / 14% (light) into transparent.

### Named Rules
**The One Eye Rule.** The eye colour means "you are watching this" and appears nowhere else. If an element is not something being watched or the member being followed, it is grey.

**The One Meaning Rule.** Red is only ending or removing; amber is only a warning. A colour never decorates.

**The One Block Rule.** A theme is one block of the semantic tokens under its own selector. Components read tokens (`--ground`, `--raised`, `--eye`...), never hex values, so a new theme changes no component. The one literal is plain black in a `mask-image` (the bar's and the strip's fades), which carries alpha only and never shows as a colour.

## Typography

**Display Font:** none; the system has no display face.
**Body Font:** Geist Variable (with ui-sans-serif, system-ui, sans-serif)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, monospace), only for keyboard hints

**Character:** One neutral grotesque at tool-like sizes that read at a glance on a 1080p screen, weight 400 and 500 only (600 only for avatar initials). Hierarchy comes from weight and grey, not from size jumps.

### Hierarchy
- **Headline** (500, 24px/32px, -0.01em): the page heading of a plain page and the owner page, the room's name under the bar's tools, and "Owner" under the owner navigation's house.
- **Title** (500, 17px/24px): the "Nothing here" heading, a confirm's title, the heading of an owner section's inspector, the empty stage's heading.
- **Body** (400, 15px/22px): the app's body size; descriptions, empty-stage lines.
- **Body Strong** (500, 15px/22px): member names, room names in lists, section titles, button labels.
- **Label** (400, 13px/18px): "Here" / "Not here" headings, counts, captions, share kind under a tile, small buttons, tooltips (500).
- **Mark Tag** (500, 12px/16px, tabular): the "720p" mark on a caption, the one size between label and key hint.
- **Key Hint** (Geist Mono 500, 11px): the key in a tooltip ("S", "["), in muted text. A key never sits inside a button, where it would push the label off centre.

Spacing stays on the 16px rem while the body is 15px. Counts and usage figures use tabular numerals. Headings balance their wrap. The scale is sized for a 1080p screen seen from a desk: the space a wide window has goes to type, rows and controls that read at a glance, not to margins.

### Named Rules
**The Mono Is For Keys Rule.** Geist Mono appears only on keyboard hints. Numbers use Geist with tabular figures.

**The One Scale Rule.** What is read and pressed takes its size from the scale block in `app.css` (`--body`, `--label`, `--row`, `--control`, `--icon`, `--avatar`, `--bar`, `--caption`, `--plain` and the rest; in classes `text-sm`, `h-row`, `h-control`, `size-icon`, `w-bar`, `max-w-plain`), never from a literal, so most of a change of scale is one block, as a theme is. A few sizes are set by hand to match it and change with it: the mark's dots, the eye dot, the checkbox, the volume control, the placeholder bars, the icon on an empty picture and on the empty stage's choices, the today tick on the Usage meter, the width of the You Menu, and the width of a confirm and of setup's and "nothing here"'s lines. Spacing between things stays on the rem.

**The Plain Words Rule.** No day of the week anywhere; only glossary terms (instance, owner, member, device, invite, room, access, present, share, live, watch, stage, usage, usage budget); no exclamation marks. Never user, account, stream, channel or session.

## Layout

The app is desktop only; no phone layout exists.

**The room.** A full-height row inset 8px from the top, bottom and right. On the left, the bar: 316px wide with 8px side padding; a header of two rows: a 52px row of tools (bar toggle and home on the left, and on the right your avatar, the You Menu, with the owner's gear before it, nothing between them; the gear and the menu's "You" open in a new tab, as the usage strip's and the stopped stage's links to Usage do, so that only home leaves the room), then under it the room's name as the page's heading, at the headline step, on the line the people's heading starts from (a long name wraps, balanced, rather than being cut, a word too long for the line breaking inside it; names are at most 40 characters, so two lines for most; while it loads, a placeholder bar holds the heading's line); then the people ("Here" with its count beside it and, at the heading's right over the rows' share icons, the watch shortcuts as three faint 28px icon buttons named by their tooltips: "Watch every webcam" (video), "Watch everything" (eye) and "Watch nothing" (eye-closed, not the tile's eye-off), the one whose pick the stage holds resting lit on raised-2 in foreground, from the click on; then 40px rows of 26px avatars, then "Not here" dimmed), and at its foot your own share previews (16:9, with watchers and Stop) above the two share buttons side by side. The people scroll on their own between header and foot, under a 16px fade at the foot's edge, so a row cut by a tall foot reads as more below. On a window under 800px tall with both your screen and webcam live, each preview steps down to a 16:9 thumbnail 112px high on the caption's left edge, so the people stay in view at 1366x768. 316px is chosen so both share buttons fit and a single 16:9 share stays height-limited at 1920x953 (1566x881 in a 1572x913 stage area; the bar may be at most 321px under the 32px caption). The bar folds into a 64px rail of 32px avatars in 44px buttons (an initial in foreground while that member shares), with the share buttons stacked as icons at its foot (a live one rests as the bar's does, raised with a muted icon) and your avatar under them, 12px down, holding the same You Menu, which opens to the right; `[` toggles bar and rail, and the choice is stored per device.

**The stage** fills the rest: an inset panel with 12px padding. Its grid is 1 column for one share, 2 for up to four, 3 for up to six, 4 beyond. Tiles are 16:9 frames, with the picture at its own aspect inside them on the letterbox colour (a portrait window or a 4:3 webcam sits between bars; a tile never takes its picture's shape). They are sized from the whole stage (as wide as the column allows or as tall as the row allows, whichever is less, with 12px gaps and 32px of caption under each picture) and are packed together in the stage's centre; a short last row sits centred under the rows above it. With a share focused, it takes the stage alone (sized the same way, as one column and one row) and the others drop to a centred strip beneath it: pictures 96px high, 12px apart, scrolling sideways when they overflow, under a 16px fade at each end.

**Plain pages** (Rooms, You): one centred column, 720px max, 24px side padding, 20px from the top, 40px between header and content and 32px between sections. The header holds the mark on the left and, on the right, the owner's gear and then your avatar with the You Menu, as at the top of the bar (the "You" page leaves the avatar out, keeping only the gear); from here they open in the same tab; rows are 64px (rooms) or 56px (devices), bleeding 12px past the column so hover fills align with the text.

**The owner page**: a navigation on the ground, as wide as the room's bar (316px, `w-bar`) so the column on the left keeps one width from the room to the owner page, with the bar's header shape (the house on a 52px row, then "Owner" under it at the headline step, not a heading, since each section's name is the page's heading), 40px links and the usage meter always in view at its foot; beside it the inset content panel (content 1000px max, centred in the panel, 40px side padding). Every section splits its content the same way (`owner-columns`): what there is on the left, taking what is left, and a 360px side column on the right (`--owner-side`), 48px apart, so the sections' side column starts at one place in all four and moving between sections moves nothing. Every section works the same way in it: a short list on the left, one 40px line each, and in the side column the **inspector** (`Inspector.svelte`), a raised panel with 12px corners and 20px padding that holds the thing picked in full, under its name in the title step (Usage's holds its two settings instead, titled as the "You" page's sections are). People: a line per member (26px avatar, name, last visit), and the member picked: their rooms as ticks, their devices, then under a raised-2 rule "Let back in" and "Remove from graeae"; with nobody picked, how many members and how many are here. Invites and Rooms: "New invite" and "New room" head their lists (plus icon, muted until picked) and are picked as the section opens, so the inspector holds the form; what is made then takes its place. An invite picked shows its link, its rooms, Copy and Cancel invite; a room picked shows its address with Copy link and Rename, and who has access to it as ticks, "here" by whoever is in it. Usage: this month as a statement, then the usage budget over the reset day.

**Centred pages** (invite, "nothing here"): one small stack in the middle of the viewport, the large mark above.

**Addresses:** `/`, `/r/<room>`, `/you`, `/invite/<code>`, `/owner` (to `/owner/people`), `/owner/people|invites|rooms|usage`; anything else is the one "nothing here" page.

Spacing rhythm: 2px between stacked rows, 6px inside controls and between paired buttons, 8px frame inset and row padding, 12px stage padding and tile gaps, 24px and 40px for page-level spacing.

## Elevation & Depth

Flat, layered by tone. Depth is three steps of grey: ground, the lighter inset stage, raised rows and controls. There are no borders between surfaces. The only shadow in the system is the tooltip's soft drop (`0 4px 16px -4px rgb(0 0 0 / 0.4)`, the `--lift` token, `shadow-lift` in classes), which lifts a floating label off whatever it covers. Everything that floats takes it: tooltips, the You Menu, the confirms, the floating screen notice, "Reconnecting…" and "Click for sound".

### Named Rules
**The Tone Not Lines Rule.** Surfaces separate by tone, never by borders. The two 1px inset rings in the build sit on controls, not surfaces: the outline of an absent member's avatar (absence drawn as an empty circle) and the eye dot's 2px cut-out ring in the colour behind it. Inside one surface, a 1px raised-2 rule may divide what is read in order, never one surface from another: the lines of the Usage statement, the inspector's actions from what they act on, and the You Menu's appearance from the way to "You".

## Shapes

Everything is rounded; nothing is square. Controls, rows, inputs and tooltips take 6px; share pictures, own-share previews and the empty stage's choices 8px; the stage, the owner content panel and an owner section's inspector 12px; skeleton bars and the segmented control's inner options 4px; avatars, the eye dot, the mark's dots and the usage track are full circles or pills. Icons are Lucide line icons at 18px with a 1.75 stroke (16px in the 28px icon buttons: a row's share icons, the watch shortcuts, the own share's audio switch, a note's close; 28px on an empty picture and on the empty stage's choices).

## Components

### Buttons
Quiet and literal; one filled button per surface.
- **Shape:** gently rounded (6px); heights 28 / 32 / 36 / 44px.
- **Primary:** near-white fill with near-black text in dark (inverted in light), 36px high, 12px side padding, at 88% on hover. In the room it is Share screen, its key S in its tooltip as on the rail (while the screen is live it rests as a secondary "Screen live" instead); on the invite page it is Join.
- **Secondary:** raised grey with soft text; raised-2 and foreground text on hover.
- **Ghost:** muted text with no fill; raised fill and foreground text on hover. Used for icon buttons, the watch shortcuts among them, and quiet actions such as Cancel.
- **Destructive:** the `destructive` variant rests as a ghost button (Stop adds the raised fill to rest as a secondary) and turns stop-red on hover: 14% stop tint behind stop text, 22% when pressed. Stop and Forget. In a confirm whose one job is to remove (the removal modal, and Forget once a device row asks "Keep" or "Forget" before forgetting the device you are on), the destructive action rests in the stop tint instead (14% behind stop text, 22% on hover), with a ghost Cancel beside it holding the focus.
- **Focus / Disabled:** a 2px ring in the dim grey, offset 2px; disabled at 40% opacity.
- **Icon buttons:** 32px ghost buttons with 6px corners holding an 18px icon, always named by a tooltip that shows the key when one exists.

### Inputs / Fields
- **Style:** raised fill, no stroke, 6px radius, 36px high, 10px side padding, dim placeholder.
- **Focus:** fill steps to raised-2 and the dim ring appears.
- **Error / Disabled:** a stop-red ring when invalid; 40% opacity when disabled.

### Navigation
Rows, not tabs: 40px, 6px radius, icon and label in body-strong. Rest in muted text; hovered or current takes the raised fill and foreground text. The segmented control on "You" (Dark / Light / Match system) is a raised track with 4px-radius options, the chosen one on raised-2.

### Person Row (signature)
A 40px row: a 26px grey avatar with the initial, the name, and a ghost icon for each live share. Clicking the name follows the member: the row takes the raised fill and an eye dot lights on the avatar (scales in over 220ms). Each share icon watches one share: faint at rest, the eye colour while watched, from the click on, however long the picture takes to arrive. A double-click on it counts as one click. Your own row opens "You" in a new tab, with a dim "· you", so the room keeps its shares and watching. Members not here are dimmed, their avatar an empty outlined circle, with nothing to click. **Reconnecting:** after about 10 seconds of silence a member with no device left in the room gets a dim "· reconnecting" after the name and an avatar that breathes slowly between full and 40% opacity (still at 55% under reduced motion); a share whose sending device is the silent one gets the same breathing on its icon, with ", reconnecting" in its name and tooltip, even while another device of the member keeps the name unmarked. No colour: the eye means watching and amber a warning.

### Stage Tile (signature)
A 16:9 frame with 8px corners, the picture at its own aspect inside it on the letterbox colour (`object-contain`, so a portrait window or a 4:3 webcam sits between bars), and a caption beneath (name in soft body-strong, kind in a dim label, the kind truncating first where the caption is narrow; a screen share with no sound reads "screen · video only"). Tiles arrive by fading in from 98.5% scale over 240ms, at the click that chose the share. Until the first frame of its picture the tile is the bare letterbox with the loading mark in its middle, held back as every loading state is, so a share that arrives within 300ms of the click shows no mark. A click that lets a share go takes its tile off at once. On hover (or keyboard focus) a raised pill at 90% sits in the picture's top-right corner with 32px ghost icon buttons: Focus (layout-panel-top; "Back to the grid", layout-grid, on the focused share), Fullscreen (maximize / minimize) and Stop watching (eye-off). A share with screen audio leads the pill with what you hear of it: a mute button whose speaker shows the volume (volume-2 from half up, volume-1 below, volume at nought, volume-off in dim grey while muted), a 72px volume control (a 4px raised-2 pill track filled in soft up to the volume, a 14px foreground knob that grows slightly under the pointer, both dim while muted, which still reads over a bright picture; 48px on a picture narrower than 400px), and, while another watched share has sound too, "Hear only" (headphones), which sits on raised-2 in foreground while it is the one share heard and then reads "Hear every share again". A muted share's caption reads "screen · muted". Every share with sound plays at once and nothing is turned down by itself. The volume is the member's, kept on the device; mute is never kept. When the browser refuses sound on a page nobody has clicked (a reload that brings the stage back), the picture plays without it and a "Click for sound" pill (raised at 90%, 32px, soft label, volume-off, the tooltip's soft drop; an icon alone in the strip) sits on its bottom-left corner, arriving as the screen notice does, until the first click or key press anywhere lets the sound in. Next comes, for a share that goes out at two qualities (a Chromium screen share, while two qualities are switched on; off since build ticket 17), the quality choice: "Auto", "1080p" and "720p" as a segmented control of 32px text options in 13px labels with tabular figures, the chosen one on raised-2 with foreground text, the others muted, one stop in the tab order with the arrow keys moving the choice; it starts at Auto. While such a share arrives at 720p its caption ends with a small mark, "720p" in a 12px label on a raised 4px-radius tag, fading in over 180ms. A share with one quality (a Firefox screen share, a webcam) has neither. In the strip the whole picture is a button that focuses it, with a 6% foreground wash on hover, and the pill shrinks to 28px buttons without Focus, the quality choice, the volume or "Hear only" (mute and the mark stay). A double-click on any picture toggles fullscreen, where the picture fills the screen on the letterbox with square corners. The empty stage is described under its own heading below. **Reconnecting…:** when the room's own connection has been lost for about 3 seconds, the stage keeps playing and a raised pill at 90% (32px high, 6px corners, the tooltip's soft drop) sits at its top centre with the small loading mark and "Reconnecting…" in a soft label; it arrives in 180ms, settling 4px down from above as things at the top of the stage do, and goes once the room is back. **The usage budget:** from 80% for the owner and 95% for everyone, a 36px strip runs across the stage's top, above the shares, which make room for it: an amber circled "!" (circle-alert, 16px), "Usage is past 95% of this month's usage budget." in soft, at 95% "Watching stops for everyone when it runs out." in muted, and for the owner a ghost "Usage" link at its right; amber at 8% fills it, 8px corners, arriving in 180ms, settling 4px down from above. Once the budget is used up the empty stage says "This month's usage budget is used up." with who can raise it, and the owner gets a secondary "Raise it in Usage".

### The Empty Stage
The stage before you watch anything, which is how every tab opens: a heading at the title step in foreground, one muted line under it, then large choices (`StageChoice.svelte`): raised cards 224x136 (`--choice`, `--choice-h`) with 8px corners, 12px apart, in soft text, taking raised-2 and foreground under the pointer (a share's avatar then steps back to raised, to stay a circle).
- **No one else sharing:** "No one is sharing yet." ("Only you are sharing." while a share of yours is live), "Share your screen or webcam, and whoever is here can watch it.", and two cards, Share screen and Share webcam, each a 28px icon over its label. They are the bar's buttons in another place: the same names and states ("Starting", then "Screen live" or "Webcam live", resting in muted text, not dimmed), the same flow and click counts, and Share screen's S in its tooltip. Raised, not filled, so the bar's Share screen stays the room's one filled button. What a press asks first, the screen notice or the hand-over offer, opens under them.
- **Shares live:** "You're not watching anything yet.", "Pick a share to watch it, or watch everything.", a card for each share others have live, by name with a screen before a webcam (the sharer's avatar and the share's 18px icon, the name in body-strong, the kind in a dim label), named "Watch Bia's screen" as the row's icon is, up to four to a row with a short last row centred; then a large secondary "Watch everything" (eye). A card watches that one share, as the row's icon does. The stage offers no sharing here: the bar has it.
- **Following a member who shares nothing:** says so instead, in soft and muted body lines. **The usage budget used up:** see the usage budget above.

### Own Share
A 16:9 preview at the foot of the bar with "Bia and Caio watching" beneath (names in soft) and a small Stop. A screen sits at its own aspect on the letterbox colour (`object-contain`), so a portrait window or an ultrawide screen shows all of what is shared; a webcam fills the preview (`object-cover`), mirrored as a mirror would show you. A screen share with sound has a 28px audio switch beside Stop (volume-2 while on; volume-off in dim grey while off). A screen share that ended up with no sound has one muted label line under the caption: "Video only. No one hears this share."

**Notes to the sharer** sit under the same caption, seen by the sharer alone and driven by the share's statistics. A note the sharer may dismiss (capture stuck at 48 fps; an upload that cannot carry 1080p, naming the 720p or 720p-and-30-fps it goes out at) is a raised panel with 8px corners, soft label text and a 28px ghost close button (x), stacked 8px apart; a dismissed note comes back only if it goes away by itself and later holds again. The note on the upload is switched off with the step-down (ticket 18), and stays built behind the switch. A quiet note (encoded in software) is a muted label line like "Video only", with nothing to dismiss. No colour: these are not warnings in amber, and never block anything. Each arrives in 180ms, rising 4px, as the screen notice does, and is read out politely to a screen reader.

### Screen Notice
The first-time notice before the browser's picker, shown once per device. Not a modal: a raised panel with 8px corners and 12px padding above the share buttons in the bar's foot, or floating beside the folded rail (as wide as the bar's inside, 300px, lifted with the tooltip's soft drop). Pressed on the empty stage, it floats instead 12px under the stage's choices, centred, the same width and drop, so it opens where the click was and moves nothing. "Before you pick" in body-strong, one line of soft body text, then a ghost Cancel and a secondary "Choose what to share" on raised-2, which takes the keyboard's focus. Escape closes it. It arrives in 180ms, rising 4px. While this tab sends a screen share, "Share screen" reads "Screen live" and is disabled, as "Share webcam" does; it then rests as "Webcam live" does (raised, muted text, not dimmed), since it states what is live rather than offering an action.

### Hand-over Offer
Pressing "Share screen" or "Share webcam" while that kind of yours is live from another tab or device (one of each per member) does not share at once: the same panel as the screen notice (`FootPanel.svelte`) asks first, in the same place (under the empty stage's choices when one of those was pressed). "Your screen is already live" (or webcam) in body-strong, "It's live from another tab or device. Stop it there and share from here?" in soft body, then a ghost Cancel and a secondary "Share from here", which takes the keyboard's focus. Going on hands the share over: a screen share then goes to the picker as usual, with the first-time notice if it is due. The panel goes by itself if the other share ends meanwhile. Whoever watches in the same room keeps the share on their stage after a short gap; nothing on their side says so. On the tab that lost the share, its preview goes and a dismissible note takes its place at the foot (the sharer's note panel: raised, 8px corners, soft label, a 28px close): "Now sharing from your other device." It goes when dismissed or when that tab shares again. No colour: a hand-over is not a warning.

### Tooltip
Raised-2 fill, foreground label text, 6px radius, 4px 8px padding, the soft drop shadow, a 400ms delay; holds the label and its key hint.

### You Menu
Your own avatar as a menu, the one way to "You" besides your own row: in the bar's header (26px avatar in a 32px button), at the rail's foot (32px in 44px) and on the list of rooms, the same for the owner and a member, named "You" by its tooltip. Open, its button takes the raised fill, and a 224px raised panel with 12px corners, 4px padding and the soft drop opens 6px off it, aligned to its end: your avatar and name in body-strong over a dim "Owner" or "Member", then "You" (user-round), then under a 1px raised-2 rule a dim "Appearance" over Dark / Light / Match system, the chosen one ticked; picking one applies it at once and leaves the menu open. Items are 32px, soft, 6px corners, and take raised-2 and foreground under the pointer or keys. The owner page is not in it: the owner's gear stays beside it, one click.

### Usage Meter
A 4px pill track in raised-2 with "Usage" and "x of y" above in labels; the fill is soft, amber from 80% and red from 95%. In the navigation it reads under 10 GB to a tenth ("0.4 GB"), whole above. The owner page's Usage section gives the same track full width under "This month" (a muted label, like the owner page's list headings, with the month's first and last day in dim), with a faint stretch of the fill at 30% running on to the projected figure, and a 2px foreground tick 16px tall across the track at today, as far along it as the month is gone, so a fill short of the tick is a budget that lasts. Under it, in a muted label, "41% of the usage budget used, on day 19 of 30." Beneath, the month as a statement: 56px lines split by raised-2 rules, a muted name on the left and a soft tabular value on the right. "Used so far" leads, its name in body-strong and its value in foreground at the title step. Then "Projected by the month's end" (amber once it passes the budget), "Usage budget", "Included by Cloudflare" (1,000 GB, muted), "Cost so far" and "Projected cost" (what is past the 1,000 GB at $0.05 per GB, the projection capped at the budget, where watching stops), and "Next reset". The two settings in the inspector beside it, "Usage budget" and "Reset day", are titled in body-strong foreground as the "You" page's sections are, each over its muted field label. At the inspector's top, the usage budget: a 112px right-aligned number field ("GB a month") with a secondary Save and its dollar equivalent beside it in soft tabular figures ("$0.00 a month", "Up to $50.00 a month": $0.05 per GB past 1,000), an amber line when the typed budget is no more than is used ("watching stops for everyone once it is saved"), and a dim line of help. Raising it opens a confirm like the removal one, titled "Raise the usage budget to 2,000 GB?", that names the most it can add a month in foreground medium, with Cancel and the one filled "Raise to 2,000 GB"; lowering saves at once. Under the usage budget, the reset day: a 64px centred number field with a secondary Save, "Next reset 1 December, at midnight UTC." in soft, and a dim line of help.

### The Mark and the Loading Slot
Three circles, the outer two in mark-dot grey and the middle in the eye (7px dots with 5px gaps; 5px/3px small; 14px/11px large). As the loader it passes the lit dot along, each dot holding the eye for a third of a 1.2s loop. `Loading.svelte` is the one loading slot in the app; the owner's friend's eye-passing animation replaces the mark there and the app draws no version of its own. The mark and every skeleton placeholder are held back (`src/app/lib/hold-back.ts`): out of sight for the first 300ms of the person's move, then fading in over 250ms, easing in, so a short wait shows nothing rather than a flash. A new placeholder takes `{@attach heldBack}` too. Pages appear whole: a move keeps the page on screen until the next one has its data, then swaps it in one frame (`src/app/lib/swap.svelte.ts`, for pages and the owner page's sections). Past the hold-back the next page shows anyway, its placeholders fading in. A new page says what it waits for with `holdUntil`, and sets the tab's title with `PageTitle`, which waits for the page to be on screen. The favicon and the README icon are the same bare three dots with no tile behind them; there the outer dots are muted-text grey (`#8e8e95`), since mark-dot grey would vanish on a dark browser tab.

## Do's and Don'ts

### Do:
- **Do** keep every surface and every word grey; let the shares carry the colour.
- **Do** use the eye only for what is being watched and the member being followed.
- **Do** separate surfaces by tone: ground, inset stage (12px radius), raised rows and controls.
- **Do** keep one filled button per surface.
- **Do** read colours from the semantic tokens so a new theme is one block under its own selector.
- **Do** name every icon-only button with a tooltip, including its key when it has one, and show a labelled button's key in its tooltip too, never beside its label.
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
