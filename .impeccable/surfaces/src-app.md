---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: the app (room, plain pages, "nothing here")

Scope: every page of the Svelte app under `src/app/`. Mode: Operate. Build path: code-led (no image generation; Operate builds in code).

Audience and job: see PRODUCT.md. The room is the main page; the list of rooms, "You", the invite page, the owner page and "nothing here" are the plain pages.

Locked sketches (the composition the build matches; open them in a browser at 1440x900):
- `.impeccable/reference/minimal-room.html`: the room.
- `.impeccable/reference/minimal-nothing.html`: the "nothing here" page.
- `.impeccable/reference/later-theme-midnight-broadcast.html`: NOT this build. A second theme the owner liked (Persona 4-inspired grammar: yellow and black, slants, heavy italic condensed type), kept for later (ticket 28 or after v1). Tokens should leave room for it, but nothing of it ships now. It still needs a lot of polish, and must borrow the grammar only: no logo, characters, menus or font from the game.

How the direction was reached: three rounds were rejected: LAN tape, cinema, streaming wall and the call-app canon; then factory sleeve, botanical folio, one eye and player colours; then hairline and sleeve II. The owner then pinned it in their own words, quoted under FORM. Owner's notes to honour: no day of the week anywhere in the UI; no cursive or "fake creativity" type; decorative drawings only when they do a job; squarish shapes do not belong in this world; dark mode first, light mode offered.

## Direction contract

THESIS: graeae is "the grey ones": an interface of greys alone, where the only colour is the eye, meaning what you are watching. It refuses the category's dark call-app shell with a brand accent sprayed over every control, and any decorative world drawn around the picture.

OWN-WORLD: Linear/Vercel minimalism taken all the way. A neutral grey scale (near-black ground; a one-step lighter inset stage panel with 12px radius; no borders, so surfaces separate by tone), Geist for everything and Geist Mono only for keyboard hints. Radius 6px on controls, 8px on shares, all rounded. One eye colour (a clear cyan, around #62d2de) used only for "watching": watched share icons, and the lit dot on the avatar of the member you follow. Red only for destructive and stop states; amber only for warnings. Avatars are grey circles with initials; the shares carry all the colour. The mark is three grey dots, the middle one lit in the eye colour.

STORY: A friend opens the address and sees who is here and what each person shares. One click on a name lights the eye on that person and their shares fill the stage. Their own shares sit at the foot of the bar with the names of whoever is watching. Nothing asks for attention except the picture.

FIRST VIEWPORT: The room at 1920x1080: a bar of about 272px on the left (header: home icon, room name centred, gear; body: "Here" with count, rows of 32px with avatar, name and ghost share icons, then the Webcams/Everything/Nothing shortcuts as plain text buttons, then "Not here" dimmed; foot: own share previews with watchers and Stop, then two share buttons side by side, the primary one filled near-white with a keyboard hint). The stage is an inset rounded panel filling the rest; shares sit in its grid with a small name and kind caption beneath each. The bar collapses to a rail of avatars with a toggle and a key.

FORM: seed: none (pinned) — the owner: "safer and more Linear/Vercel-like (and, in a sense, is still very bold in a direction)… radically minimal and let's how well the elements are laid out and the cohesion (and close attention to UI/UX principles, heuristics, etc.) speak for itself", plus the grey-ones palette, the eye as the only colour and the three-dot mark, all confirmed by the owner. Signature move: the eye. One colour, one meaning, moving with your attention; the three-dot mark passes the lit dot along as the small loader. The owner's friend makes the full eye-passing loading animation; the app leaves a slot for it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
