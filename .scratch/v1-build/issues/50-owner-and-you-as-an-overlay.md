# 50: The owner page and "You" open over the page under them

**What to build:** The owner page and the "You" page open as an overlay: a panel centred over the page they were opened from, with that page dimmed and still running under it. graeae becomes one tab: no link opens a new tab any more.

**Why:** today the gear, your own row, "You" and both links to Usage open a new tab so the room keeps its shares and watching (ticket 27). Going home from that tab lands in the room again, so one member ends up with two tabs at the stage. That is how the owner hit the two-tab failure on 2026-11-20 ([Two tabs, and share starts run many times over](../../share-reliability/issues/06-two-tabs-and-share-starts.md)). "You" also looks empty as a full page. The owner picked the overlay's look and behaviour in [The owner page and "You" as an overlay](../../share-reliability/issues/07-owner-and-you-as-an-overlay.md), whose answer holds every measure. The prototype is commit `8e527fd`, from the deleted branch `prototype/overlay` and in `v1-build`'s history only: read its router, `Overlay.svelte`, `Owner.svelte` and `You.svelte` for variant B, but rebuild them rather than copying.

Spec: The room's screen (Bar header, Bar body), Other pages, and Seam 2.

Status: resolved

Blocked by: none

- [x] **Router.** `/you`, `/owner` and `/owner/<section>` draw over the page under them.
  - Each history entry records that page and the number of steps since the overlay opened, and a reload keeps both.
  - Closing goes back past every step at once.
  - Opened fresh, the overlay sits over whatever `/` shows. When `/` turns out to be a member's one room, that room goes under the overlay; the overlay's address stays.
  - The page under it keeps its swap and its socket; opening and closing never reload it.
- [x] **The overlay** (a component in `src/app/lib/components/`), drawn as the answer says.
  - Scrim and motion as in the answer.
  - A dialog named "Owner" or "You", `aria-modal`. The page under it is inert, focus moves in and goes back to what opened it on close, and the room's keys do nothing while it is open.
  - It closes on Escape (a confirm or a menu inside closes first), on the X with the Esc key hint, on a click on the dimmed page, and with the back button.
- [x] **The owner page and "You" in it.** Their layouts as full pages go.
  - The owner navigation loses the house and narrows to 240 px; the sections are unchanged.
  - "You" takes the 640 px panel.
- [x] **Every new tab goes:**
  - `target="_blank"` and its comments in `BarHeader.svelte`, `PersonRow.svelte`, `StageEmpty.svelte` and `BudgetStrip.svelte`;
  - `YouMenu`'s `newTab` prop, and its callers.
- [x] **Spec.**
  - Bar header and Bar body: "opens … over the room", not "in a new tab".
  - Other pages: the owner page and "You" are overlays over the page they were opened from.
  - Seam 2's list: the overlay, not new tabs.
- [x] **`DESIGN.md`.**
  - The room (the gear and "You" open over the room, and only home leaves it).
  - Person Row (your own row opens "You" over the room).
  - Plain pages (the list of rooms alone; "You" moves to the overlay).
  - The owner page (in the panel: the navigation 240 px wide, no house, the close button at the content's top right).
  - Addresses (the two overlay addresses draw over the page under them).
  - A new component entry for the overlay, with its measures, its motion and its dim.
- [x] **Tests (Seam 2).** Every journey that follows a new tab follows the overlay in the same tab instead:
  - `screen.spec.ts`, "the gear and your own name open their pages in a new tab": the owner shares to Uma and opens the owner page over the room, Uma opens "You", and the share stays live and watched. Each way of closing returns to the room. A reload keeps the overlay over the room, and a fresh open sits over what `/` shows.
  - `budget.spec.ts`: both links to Usage open the overlay; they no longer check `target`.
  - `invites.spec.ts`, `you.spec.ts` and `presence.spec.ts`. Presence keeps its in-app clean leave through the browser's history.
- [x] **`pnpm capture` and `pnpm perf`.**
  - Capture: the owner page's sections and "You" over the busy room and over the list of rooms.
  - Perf: opening, moving between sections and closing paint no loading flash.
  - In light mode, check whether the dim needs to be stronger, and record what you decide.

The agent does all of this alone, on the fakes. The owner checks nothing new: `scripts/owner-checks.sh` has no step that opens one of these pages in a new tab.

## Comments

### 2026-11-22: done

**The router.** A route says it is an overlay (`overlay: { name, size }` in `App.svelte`). At an overlay's address the router keeps two pages: the one under it, from the history entry's `{ under, steps }`, and the overlay's. Each is picked again only when its own pathname changes, so a move within the overlay gives the room nothing new and it carries on. A move into an overlay adds a step; closing goes `history.go(-steps)`, so Forward opens it again and Back from the page under never does. One opened fresh (a typed address, a reload of an entry from an older build) has taken no steps and has `/` under it, with no entry of that page to go back to: closing goes back past its moves, then replaces it with the page under it. A second close while one is on its way through history does nothing. The list of rooms, sending a member with one room on, now calls `redirect`, which under an overlay swaps the page under it and keeps the overlay's address. An entry whose `under` is another origin or another overlay is treated as fresh.

**The overlay** (`Overlay.svelte`) stays out of sight until the page in it is whole (its `Swap`'s first `onshow`), then fades and scales in. The page under is inert and its `Swap` reports it as not shown (`covered`), so its title and keys wait; the room's `[` and the rest do nothing. Escape is caught on the window ahead of everything, and passed over while an alertdialog, a menu or a listbox is open. Focus goes back to what opened it, or to the You Menu's button when it was opened from the menu.

**Forgetting this device in "You"** now reloads the tab, since the page under it is a stranger's too.

**The dim in light mode stays at 60%.** Measured on the captures: it takes the white page under to `#6d6d6d` against the panel's `#f4f4f5`, where in dark mode the page under only goes from `#111113` to `#09090b`. Light mode already separates more; a stronger dim would only hide more of the room. Recorded in DESIGN.md's Overlay entry.

**Tests.** `screen.spec.ts` has the journey the ticket names. `budget`, `invites`, `you` and `presence` follow the overlay in the same tab. Presence's in-app leave now goes through history to an address with nothing there, and back. `moves.spec.ts` lost the house and the one-width bar: it now checks that a fresh overlay puts a member's one room under it, and the panel's measures (1280×880 at most, 32px from the edges, the navigation 240px) at three window sizes. `rooms.spec.ts` changed one assertion: its owner-page tab, opened fresh while First room was the only room, keeps the owner present there. Typecheck and lint pass (lint's only errors are in the untracked `.logs/upload-estimate/scripts`). All 452 tests in the Workers runtime and all 58 journeys pass. `dropped.spec.ts`'s silent-drop journey failed in two of three full runs (Rhea's stage still showed "Reconnecting…"); alone and in smaller sets it passes. It fails the same way at HEAD before this ticket (one of two full runs in a worktree), so it is an older flake, not from the overlay.

**Capture and perf.** `pnpm capture` (label `ticket-50`) shoots the owner sections and "You" over the busy room, opened from the gear and the owner's own row, and the owner page and "You" over the list of rooms. `pnpm perf` adds the gear, each section, Close, the own row and Escape from the room, fresh opens, and the gear and Escape from the list: none flashes, at 0 and at 60ms round trip.

Deployed to `graeae-test` on 2026-11-22 with ticket 51, from `8c3730e` (version `7d894374`).

**After review.** The review found two bugs in closing, both now covered in `moves.spec.ts`: a fresh overlay moved within took two closes, and a double press went back too far. It also moved the overlay's motion to CSS keyframes on `--ease-out` with a reduced-motion block, as the other components animate. And "You" reloads when it finds this browser forgotten from elsewhere, rather than drawing "nothing here" in the panel. `screen.spec.ts` now checks that the room is under the overlay after the reload and the fresh open. Left as they are: the `{ name, size }` pair written in the route and in the overlay's props, and `plain/Section.svelte` staying where it is.
