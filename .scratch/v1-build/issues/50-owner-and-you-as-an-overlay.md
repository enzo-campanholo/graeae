# 50: The owner page and "You" open over the page under them

**What to build:** The owner page and the "You" page open as an overlay: a panel centred over the page they were opened from, with that page dimmed and still running under it. graeae becomes one tab: no link opens a new tab any more.

**Why:** today the gear, your own row, "You" and both links to Usage open a new tab so the room keeps its shares and watching (ticket 27). Going home from that tab lands in the room again, so one member ends up with two tabs at the stage. That is how the owner hit the two-tab failure on 2026-11-20 ([Two tabs, and share starts run many times over](../../share-reliability/issues/06-two-tabs-and-share-starts.md)). "You" also looks empty as a full page. The owner picked the overlay's look and behaviour in [The owner page and "You" as an overlay](../../share-reliability/issues/07-owner-and-you-as-an-overlay.md), whose answer holds every measure. The prototype is on the throwaway branch `prototype/overlay`, commit `2263f7c`: read its router, `Overlay.svelte`, `Owner.svelte` and `You.svelte` for variant B, but rebuild them rather than copying.

Spec: The room's screen (Bar header, Bar body), Other pages, and Seam 2.

**Status:** ready-for-agent

**Blocked by:** none

- [ ] **Router.** `/you`, `/owner` and `/owner/<section>` draw over the page under them.
  - Each history entry records that page and the number of steps since the overlay opened, and a reload keeps both.
  - Closing goes back past every step at once.
  - Opened fresh, the overlay sits over whatever `/` shows. When `/` turns out to be a member's one room, that room goes under the overlay; the overlay's address stays.
  - The page under it keeps its swap and its socket; opening and closing never reload it.
- [ ] **The overlay** (a component in `src/app/lib/components/`), drawn as the answer says.
  - Scrim and motion as in the answer.
  - A dialog named "Owner" or "You", `aria-modal`. The page under it is inert, focus moves in and goes back to what opened it on close, and the room's keys do nothing while it is open.
  - It closes on Escape (a confirm or a menu inside closes first), on the X with the Esc key hint, on a click on the dimmed page, and with the back button.
- [ ] **The owner page and "You" in it.** Their layouts as full pages go.
  - The owner navigation loses the house and narrows to 240 px; the sections are unchanged.
  - "You" takes the 640 px panel.
- [ ] **Every new tab goes:**
  - `target="_blank"` and its comments in `BarHeader.svelte`, `PersonRow.svelte`, `StageEmpty.svelte` and `BudgetStrip.svelte`;
  - `YouMenu`'s `newTab` prop, and its callers.
- [ ] **Spec.**
  - Bar header and Bar body: "opens … over the room", not "in a new tab".
  - Other pages: the owner page and "You" are overlays over the page they were opened from.
  - Seam 2's list: the overlay, not new tabs.
- [ ] **`DESIGN.md`.**
  - The room (the gear and "You" open over the room, and only home leaves it).
  - Person Row (your own row opens "You" over the room).
  - Plain pages (the list of rooms alone; "You" moves to the overlay).
  - The owner page (in the panel: the navigation 240 px wide, no house, the close button at the content's top right).
  - Addresses (the two overlay addresses draw over the page under them).
  - A new component entry for the overlay, with its measures, its motion and its dim.
- [ ] **Tests (Seam 2).** Every journey that follows a new tab follows the overlay in the same tab instead:
  - `screen.spec.ts`, "the gear and your own name open their pages in a new tab": the owner shares to Uma and opens the owner page over the room, Uma opens "You", and the share stays live and watched. Each way of closing returns to the room. A reload keeps the overlay over the room, and a fresh open sits over what `/` shows.
  - `budget.spec.ts`: both links to Usage open the overlay; they no longer check `target`.
  - `invites.spec.ts`, `you.spec.ts` and `presence.spec.ts`. Presence keeps its in-app clean leave through the browser's history.
- [ ] **`pnpm capture` and `pnpm perf`.**
  - Capture: the owner page's sections and "You" over the busy room and over the list of rooms.
  - Perf: opening, moving between sections and closing paint no loading flash.
  - In light mode, check whether the dim needs to be stronger, and record what you decide.

The agent does all of this alone, on the fakes. The owner checks nothing new: `scripts/owner-checks.sh` has no step that opens one of these pages in a new tab.
