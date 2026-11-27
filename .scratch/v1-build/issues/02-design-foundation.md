# 02: Design foundation

**What to build:** The visual direction for graeae, set by the owner with the impeccable skill, and the empty shells every later ticket fills in. After this, an implementer building any page has a `PRODUCT.md`, a `DESIGN.md`, themed components and a shell to put its work in, and does not invent a look.

This ticket is driven by the owner, because the direction is a matter of taste.

Spec: [The room's screen](../spec.md#the-rooms-screen), [Other pages](../spec.md#other-pages), [Left to the build](../spec.md#left-to-the-build). Primary sources for layout: the prototype branches `prototype/room-experience` (variant D) and `prototype/owners-admin-surface` (variant B).

Blocked by: 01

Status: resolved

- [x] `PRODUCT.md` at the repo root, written with impeccable's `init` from the spec and the glossary
- [x] `DESIGN.md` at the repo root, recording the chosen direction and its tokens
- [x] shadcn-svelte is themed from those tokens
- [x] Room shell: a bar on the left (header, body, foot) that collapses to a rail with a toggle button and a key, and an empty stage filling the rest
- [x] The bar is wide enough for its two share buttons (the prototype's was not)
- [x] Bar header layout: the room's name centred between a home icon for the list of rooms and the gear
- [x] Shell for the plain pages: the list of rooms, the "You" page, the one-button invite page, the owner page with its four-section navigation
- [x] The "nothing here" page in its final form
- [x] No phone layout
- [x] Each shell is reachable at its final address, so tickets built in parallel can link to each other's pages
- [x] In a maximised browser on a 1080p monitor, a single 16:9 share on the stage is limited by height, not by the bar

## Comments

**2026-11-16, session 1: direction locked, build not started.**

- `PRODUCT.md` is written from the spec, the glossary and the owner's interview.
- Direction: **Minimal, "the grey ones"**. It is Linear/Vercel minimalism taken all the way: greys only, and the one colour is the eye, which means "watching". The three-dot mark (middle dot lit) is the logo, the favicon and the small loader. The direction contract is in `.impeccable/surfaces/src-app.md`. The locked sketches are `.impeccable/reference/minimal-room.html` and `minimal-nothing.html`.
- The owner also liked a Persona 4-inspired direction ("Midnight Broadcast"). It is kept for later as a second theme, in `.impeccable/reference/later-theme-midnight-broadcast.html`. Tokens should leave room for it, but it is not built in this ticket.
- Owner's notes: no day of the week anywhere in the UI. Dark mode first, light mode offered. Squarish shapes and decorative drawings without a job don't belong.
- Next session: run `/impeccable` on this ticket. It picks up the surface brief and builds code-led: tokens, the shadcn theme, the room shell and rail, the plain-page shells at their final addresses, and "nothing here". Then the finish review, and the documenter writes `DESIGN.md`.

**2026-11-17, session 2: built, reviewed, documented.**

- Built code-led from the direction contract. The tokens and the shadcn-svelte theme live in `src/app/app.css`: the semantic tokens are one block per theme, so "Midnight Broadcast" can be added later as another block. Dark is the default, and light or "Match system" is chosen on the "You" page and kept on the device.
- Addresses, confirmed by the owner: `/` (list of rooms), `/r/<room>`, `/you`, `/invite/<code>`, `/owner` (opens `/owner/people`), and `/owner/people|invites|rooms|usage`. Every other address shows "nothing here".
- The bar is 288px, so its two share buttons sit side by side. `[` folds it into a 56px rail and back. At 1920x953 (a maximised Chrome on a 1080p monitor) a single 16:9 share measures 1577x887 in a 1600x913 stage, so the stage height is what limits it.
- Stage tiles take the picture's shape, are sized from the whole stage and are packed in its middle. The column count follows the spec's table.
- Without data the shells show empty or loading states (the loading slot is `Loading.svelte`). Under `pnpm dev`, adding `?sample` fills them with made-up data: `?sample=one` for one share, `?sample=none` for none, `?sample=busy` for seven. The production build resolves `$sample` to an empty stub, and was checked to contain none of it.
- Share screen shows the S hint, but nothing binds the key yet. That belongs with sharing (ticket 13).
- The finish review said "fix". Two fixes were made: the room shows the loader until it is known, and the list of rooms says "4 shares live". Two were declined. Choosing columns from the stage's size was declined because the spec fixes the table; the reviewer recommends that ticket 14 consider it within the spec's intent. A pin quote in the surface brief was declined because there are no owner words for it. The verdict was "ship".
- `DESIGN.md` and `.impeccable/design.json` were written by the documenter from the built code. The README icon is now the bare three-dot mark.
- The code review was run on both axes, standards and spec. Fixed after it:
  - The destructive button variant now rests grey and turns red on hover, as DESIGN.md says.
  - One `ShareKind` type replaces the copies, and one localStorage helper replaces the duplicated reads and writes.
  - `[` also works when typed with AltGr.
  - A malformed address such as `/r/%E0` shows "nothing here" instead of crashing the router.
  - The rail's webcam button matches the bar's.
  - The unused label, separator and outline pieces are gone, and `OwnerPage.svelte` is renamed `OwnerAddress.svelte`.
- Left as they are:
  - An idle room on the list shows no "0 shares live".
  - Theme switching sits on the "You" page.
  - The share buttons stay in the rail, following story 21 in the spec.
- The 1080p promise holds while the viewport is at most 966px tall. A maximised Chrome or Helium on Windows 11 at 100% scaling is about 947px. A wider bar would break it, and 288px is already the narrowest that fits the share buttons.
