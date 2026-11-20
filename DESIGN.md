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

<!-- impeccable:design-map -->
Name: graeae
Colors: primary: eye #62d2de; secondary: stop #f26d6d; neutral: ground #0b0b0c; primary: eye-light #0a7f8b; secondary: warn #f0b45a; secondary: stop-light #a02421; secondary: warn-light #a15c00 (+25 more in the sidecar)
Fonts: Geist Variable (headline, title, body, body-strong, label, mark-tag); Geist Mono Variable (key-hint)
Spacing: hair 2px, xs 6px, sm 8px, md 12px, lg 24px, xl 40px
Radius: sm 4px, md 6px, lg 8px, xl 12px, full 9999px
North Star: "The Grey Ones"
Rules:
- The One Eye Rule. The eye colour means "you are watching this" and appears nowhere else.
- The One Meaning Rule. Red is only ending or removing; amber is only a warning.
- The One Block Rule. A theme is one block of the semantic tokens under its own selector.
- The Mono Is For Keys Rule. Geist Mono appears only on keyboard hints.
- The One Scale Rule. What is read and pressed takes its size from the scale block in `app.css` (`--body`, `--label`, `--row`, `--control`, `--icon`, `--avatar`, `--bar`, `--caption`, `--plain` and the rest; in classes `text-sm`, `h-row`, `h-control`, `size-icon`, `w-bar`, `ma...
- The Plain Words Rule. No day of the week anywhere; only glossary terms (instance, owner, member, device, invite, room, access, present, share, live, watch, stage, usage, usage budget); no exclamation marks.
- The Tone Not Lines Rule. Surfaces separate by tone, never by borders.
Don't:
- Don't use the eye colour for buttons, links, focus, selection or decoration.
- Don't use red for anything but ending or removing, or amber for anything but a warning.
- Don't draw borders between surfaces.
- Don't use square corners or squarish shapes.
- Don't add decorative drawings that do no job.
- Don't use cursive or novelty type, or any face besides Geist and Geist Mono.
- Don't show a day of the week anywhere.
- Don't draw a loading animation of your own; use `Loading.svelte`.
Do:
- Do keep every surface and every word grey; let the shares carry the colour.
- Do use the eye only for what is being watched and the member being followed.
- Do separate surfaces by tone: ground, inset stage (12px radius), raised rows and controls.
- Do keep one filled button per surface.
- (+4 more)
Map: .impeccable/reference/later-theme-midnight-broadcast.html
Map: src/app/lib/hold-back.ts
Map: src/app/lib/swap.svelte.ts
Full: .impeccable/design-full.md (read a section when you need its detail)
