# The owner page and "You" as an overlay

Type: prototype
Status: resolved
Blocked by: none
Map: ../map.md

## Question

How should the owner page and the "You" page look and behave when they open over the room as an overlay, instead of in a new tab?

Decided while charting: they open over the room, the stage keeps running underneath (shares and watching carry on), and graeae becomes one tab. The overlay keeps an address of its own, so a link, a reload and the back button work; from the list of rooms they open the same way. Every `target="_blank"` goes: the gear (`BarHeader.svelte`), the member's own row (`PersonRow.svelte`), "You" in `YouMenu.svelte`, and "Raise it in Usage" (`StageEmpty.svelte`, `BudgetStrip.svelte`). This reverses the spec's rule that they open in a new tab (spec, The room's screen: Bar header, Bar body) and fixes the "You" page looking empty as a full page.

Open for the prototype: its size (a sheet over the stage, a centred panel, a side panel), how it closes, whether the room underneath stays visible or dims, how the owner page's four sections (People, Invites, Rooms, Usage) sit in it, and how the "You" page fills it. Follow `DESIGN.md`, `PRODUCT.md` and the craft lens (`.impeccable/reference/craft/lens.md`).

The owner is busy: an agent builds two or three variants on the fakes (`pnpm dev:fake-media`), on a throwaway `prototype/overlay` branch, takes screenshots of each at 1920×953 and 1366×768, dark and light, and puts them in front of the owner in one sitting to pick from. The answer records the pick and the behaviour, ready to become a build ticket with the spec and `DESIGN.md` changes.

## Answer

On 2026-11-21 the owner picked **B: a centred panel over the dimmed room**. Clicking the dimmed room closes it too.

The other two variants:
- **A**, a sheet in the stage's place. It hid the stage, and "You" still looked sparse at 1920.
- **C**, a side panel with the stage shrinking beside it. At 1366 it left the stage 314 px wide, and over the list of rooms it covered that page's own gear and avatar.

The prototype was on the throwaway branch `prototype/overlay`, now deleted; its commit `8e527fd` is in `v1-build`'s history with none of its files. `pnpm prototype:overlay` runs on the fakes, fills an instance, walks each variant (opening it, reloading, back, forward, closing) and puts the 52 shots and a contact sheet in `.impeccable/review/captures/overlay-prototype/` (deleted on 2026-11-27; the command makes them again).

How it behaves:

- **The frame.** A panel centred over the whole window, 32 px from its edges, with `shadow-lift` and `rounded-xl`.
  - The page under it stays as it was, dimmed by `letterbox` at 60%. In the room, shares, watching and sound carry on.
  - The dim fades in over 180 ms. The panel scales in from 0.985 over 220 ms, ease-out. Both are instant under reduced motion.
- **The owner page in it** is the owner page in miniature.
  - The panel is at most 1280×880, on `ground`, so it is 1302×704 at 1366×768.
  - On the left is the navigation, 240 px wide: "Owner", the four sections' 40 px links, and the usage meter at its foot. It has no house, since the page under it is where closing goes.
  - Beside it is the `stage` content panel with the sections as they are now (`owner-columns`, the inspector, content 1000 px max), with the close button at its top right.
- **"You" in it.** A 640 px panel on `stage`, as tall as its content up to the window minus 64 px, scrolling inside.
  - The "You" heading has the close button on its line, and the sections follow.
  - The full "You" page goes, and with it the empty look.
- **Closing.**
  - Escape closes it, unless a confirm or a menu inside it is open; that closes first.
  - So do the X (tooltip "Close", key hint Esc), a click on the dimmed page, and the back button.
  - Closing returns to the page under it past every section stepped through since it opened (one `history.go(-n)`), so forward reopens it but back never does.
- **Addresses.** `/you`, `/owner` and `/owner/<section>` stay.
  - Each history entry records the page under the overlay and how many steps there have been since it opened.
  - A reload keeps both the overlay and the page under it.
  - When the overlay is opened fresh (a link, a new tab, a typed address), the page under it is whatever `/` would show: the list of rooms, or a member's one room.
- **While it is open.** Focus moves into the panel and goes back to what opened it on close. The page under it cannot be reached by keyboard or screen reader. The room's keys (`[`, the watch shortcuts) do nothing.
- **Every way in** opens it in the same tab, and no `target="_blank"` is left:
  - from the room: the gear, your own row, "You" in the You Menu, and both links to Usage;
  - from the list of rooms: the gear and the You Menu.

One point is left to the build: in light mode, `letterbox` at 60% dims the page to a soft grey. The build's critique decides whether the light theme needs a stronger dim.

The build ticket is [The owner page and "You" open over the page under them](../../v1-build/issues/50-owner-and-you-as-an-overlay.md).
