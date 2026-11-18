# 33: The app feels slow

**What to build:** Moving around the app feels instant. Loading animations do not flash on the way from page to page.

Owner's note (2026-11-18, on the dev server over Tailscale): "The whole app is not very fast. I can see loading animations for brief periods."

**Blocked by:** none

**Status:** resolved

## Open questions

- Measure first, on the production build on `graeae-test`. The dev server serves hundreds of unbundled modules and the fakes, so its speed says little about the real thing.
- A loading state that shows for under about 300ms reads as a flash. Show it only after a short delay, and keep the last page's content until the next one is ready?
- Which waits are real: the page shell, `/api/me`, the room's socket, the lists?

## Comments

### 2026-11-18: measured

Probe: `scripts/perf/` (Playwright on the fake-media build under `vite preview`, not a test). It times 15 moves (setup, room, owner and its sections, `/you`, the list and the rooms in it) and records each interval the loading mark or a skeleton is painted. `GRAEAE_PERF_RTT` adds a round trip to HTTP (Chromium's emulation) and to the sockets (a delaying proxy). A move fails when it paints a loading state for less than 300ms.

Baseline at 60ms RTT: every move is ready in 70–390ms, yet 14 of 15 paint the mark or skeletons for 50–240ms, from the first frame. The app is not slow; its loading states flash. Even at 0ms (localhost), 14 of 15 flash, for 20–90ms.

Hypotheses, ranked:
1. Loading states have no delay. **Confirmed:** with a throwaway 300ms CSS hold-back on the mark and the skeletons, all 15 moves are clean at 0, 60 and 150ms RTT, and no ready time changes.
2. Every page starts from nothing: owner sections refetch on each visit, and the list and room sockets reopen on every move. Supported by Usage, the one section that never flashes: its figures are already held by the meter.
3. Waterfalls: `/owner` asks `/api/me` before its section asks for its list; "house → /" with one room goes list socket → redirect → room socket (about 2 RTT).
4. The dev server's unbundled modules over Tailscale. Not measured; graeae-test would settle it.

What a per-element hold-back leaves (seen at 150 and 400ms RTT):
- A wait just past 300ms still paints the mark for about 100ms.
- Handing off from one loading state to the next (Setup → Room, the list → the one room, `/owner`'s `/api/me` → its section) restarts the hold-back. At 150ms RTT setup → room was blank for 1.1s with no mark; at 400ms it showed mark, gap, mark.

### 2026-11-18: built and checked on the fakes

The owner chose the hold-back and the home link going straight to their room. Kept data and asking for `/api/me` and the section's list together were left out.

- **Hold-back** (`src/app/lib/hold-back.ts`, the `.held-back` rule in `app.css`). The loading mark and every skeleton (the list of rooms, "You"'s devices, the room's name, the owner page's meter) stay at opacity 0 until 300ms into the move, then fade in over 250ms, easing in. A move starts when the app first runs, and again on each click, key press, or back and forward. A redirect or one page's loading handing over to the next continues the same move. Every placeholder in a move shares one fade, so one that mounts late joins it partway, and a hand-over shows no dip. The mark keeps `role="status"` throughout, so assistive technology still hears it at once.
- **Home goes straight to the one room.** `GET /api/me` now answers `home`: the member's one room, or `/` once they have more. The owner page's house and the mark on "You" link to it, so a member with one room skips the list's socket and its redirect. At a 60ms round trip, the probe measured the house move at about 360ms before and 270ms after. (The hypotheses above guessed "about 2 RTT" for the old path; it is more.) The owner page asks again after making a room, which can turn home into the list. A failed refresh leaves the page as it was. On "You", the mark goes to `/` until `/api/me` answers.
- **Tests.** Seam 1: "where home is" in `test/you.test.ts`, plus `home` in the two exact `/api/me` answers (`invites.test.ts`, `devices.test.ts`). Seam 2: `test/browser/moves.spec.ts`, where a held-back Invites list shows the mark at opacity 0 and then 1, and both home links reach the room without opening the list's socket. Both went red on the code before the fix. `pnpm test` (428 tests and 41 journeys), `pnpm typecheck` and `pnpm lint` pass.
- **Not tested:** that a hand-over between two loading states (setup → room) keeps one fade. No test can hold its timing steady, so `pnpm perf` is its check.
- **`pnpm perf`** (`scripts/perf/`) is the probe, kept. A move fails when it paints a loading state for under 300ms. "Painted" means at least 0.05 opacity, checked every frame, so a placeholder still fading in below that does not count. Results:
  - 0ms round trip: 15 of 15 moves clean (14 flashed before).
  - 60ms: 15 of 15 clean (14 flashed before). No move got slower; "house → the one room" went from about 360ms to 270ms.
  - 150ms: 13 of 15 clean. On setup → room, the room is ready about 150ms after the hold-back ends, so its placeholders show faintly (up to about 0.4 opacity) for about 100ms. On a new `/owner` tab, a skeleton shows for 13ms at near-zero opacity. That edge belongs to any delay threshold. A minimum time on screen would remove it only by holding back content that is ready.
- **Not verified here:** how it feels on the owner's dev server over Tailscale, and on `graeae-test`. Nothing was deployed. On the dev server, the first load of a tab is still slow (hundreds of unbundled modules); the tab stays blank meanwhile, as before.
- **Deployed to `graeae-test`** on 2026-11-18, from `4b78fa4` (version `f38d5a62`), for the owner to try.
- **Whole pages deployed to `graeae-test`** on 2026-11-18, from `c029f87` (version `04bdea04`), for the owner to try.

### 2026-11-18: pages appear whole

Owner, after trying it: "I still don't like that part of the UI appears instantly and some of it appears later." The owner chose to keep the old page on screen until the next one is whole.

- **How.** `$lib/swap.svelte.ts` and `Swap.svelte`: a move mounts the next view out of sight while the current one stays, and swaps it in, in one frame, once nothing in it holds it back, or once the move's 300ms hold-back is over, whichever comes first. Past the hold-back the next page shows with its placeholders fading in, as before. The router swaps pages (keyed by page, so the same page at a new address keeps its view), and the owner page swaps sections: heading, list, the navigation's mark and the tab's title change together. Each page says what it waits for with `holdUntil`:
  - the room: its socket's first state;
  - the list of rooms: the list, and a member with one room never sees it, since the move goes on into the room;
  - the owner page: `/api/me`, the meter's figures and its section's list;
  - "You", an invite, each owner section: their one answer;
  - setup: its answer.
  A new tab is blank until its page is whole, or the hold-back ends.
- **Tests.** `test/browser/moves.spec.ts`: with the Invites list held, People stays, its link still current, and once the list comes the heading and list arrive in one frame with no loading state. Held past the hold-back, Invites shows with the mark. The first went red before the swap. `pnpm test` (428 tests and 42 journeys), `pnpm typecheck` and `pnpm lint` pass, and the `?sample` pages render on the dev server.
- **`pnpm perf`:** clean at 0 and 60ms; at 150ms the same two faint edges as before. A section's "ready" now counts until its list is in, since the heading waits for it.
- **Not tested:** a hand-over between two pages on their way (setup → room, the list → the one room), which `pnpm perf` covers.
- **From the spec and standards review.** A page on its way is mounted but out of sight, so what reaches past it now waits until it swaps in:
  - the tab's title (`PageTitle`, which the test checks);
  - the room's keyboard shortcuts.

  Each address is now its own view, so a move between two rooms or two invites swaps whole too. The owner page's two routes share one view (`Route.view`). A room left behind stays connected until the next page swaps in, at most 300ms. The first test in `moves.spec.ts` asks that People is still there right after the click, so a runner that takes 300ms between the click and that check would fail it.

### 2026-11-18: closed

Owner, on `graeae-test`: "It still doesn't feel great because it is not instant, but better than not having the finished state I guess. Let's close this for now."

Pages no longer flash and appear whole, but a move still waits a round trip or two for its data. What could make moves feel instant, left for later:
- **Kept data** (hypothesis 2): a page seen before in the tab shows its last answer at once and refreshes it.
- **No waterfalls** (hypothesis 3): `/owner` asks `/api/me` and its section's list together.
- **Asking ahead:** a link starts its page's requests on hover or press, before the click lands.
