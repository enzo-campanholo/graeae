# 39: Instant feedback when you choose what to watch

**What to build:** A click on a name or a share icon shows at once that it was taken, even while the real media takes time to arrive. A second click during that wait does not undo the first by accident.

Owner's note (2026-11-18), on real media: "Selecting which transmission to watch is slow (you click on the screen or the webcam and nothing happens for some time), this makes users think they misclicked and click again, which, in turn, makes the screen disappear."

**Blocked by:** none. Needs `graeae-test` to verify, since the fakes are instant.

**Status:** ready-for-human

## Open questions

- The pressed state and the tile appear on the click, with a "connecting" tile until the picture arrives?
- Measure where the time goes (signaling, subscribe, first frame) and cut what can be cut.
- Is the "screen disappears" a toggle-off on the second click, or something else? Reproduce on `graeae-test`.

## Comments

### 2026-11-19: built on the fakes; waiting on `graeae-test`

**The "screen disappears" is the toggle-off.** It reproduces on the fakes once the instance's answer is held. The first click asked for the share and lit nothing. A second click during the wait marked it unwanted, so when the instance answered, the share came onto the stage and was dropped straight away.

**Built:**
- **The click shows at once.** A share's icon lights and its tile arrives on the stage at the click that chose it. A click on a name does the same for each share of theirs. Until the picture's first frame the tile is the bare letterbox with the loading mark in its middle. The mark is held back like every loading state (`hold-back.ts`), so a watch that arrives within 300ms shows none.
- **Taking a share off is just as quick.** The icon, the tile's eye-off and the bar's "Watch: Nothing" take it off at once. The instance closes the pull behind it.
- **Choosing it again** while it is still leaving brings it back at once, and it is watched afresh once the old pull is closed.
- **Small fixes:**
  - A double-click on a share icon counts as one click.
  - With the usage budget used up, a click shows nothing, since the instance refuses every watch then.
  - The quality choice waits until the share is watched.
- **One cut:** the instance now mints the relay credential while it makes the media connection, rather than after. That is one Cloudflare call less before a tab's first watch or share.
- **Timings for `graeae-test`.** Each watch leaves `graeae watch: <step>` entries in the browser's performance timeline. Each is measured from the click: "media connection" (the first watch only), "turn" (earlier negotiations done), "pull" (the instance pulled it), "answer" (the media server has the tab's answer) and "first frame". To read them, open the room's console and run `performance.getEntriesByType("measure").filter((m) => m.name.startsWith("graeae watch")).map((m) => [m.name, Math.round(m.duration), m.detail])`.
- **Where the code is:**
  - `RoomClient.wants` and `staged` say what the member chose, and the page shows those.
  - `leaving` and `rewatch` carry the in-between states through a lost socket and through a rebuilt media connection.
  - `WatchedPicture.svelte` draws the connecting state.
  - DESIGN.md's Person Row and Stage Tile entries describe it.

**Tests.** Test first, each slice red before green:
- Seam 2, `watching.spec.ts`, with the instance's answers held on the watcher's socket:
  - The icon is lit and the tile connecting while the answer is held.
  - A second click during the wait takes the share off and it stays off.
  - A double-click counts as one click.
  - Stopping is instant, and re-choosing a leaving share brings it back.
  - A share let go of on its way stays off when the socket is lost before the answer. This one came from the review.
- Seam 2, `budget.spec.ts`: with the budget used up, a click shows no tile and no lit icon.
- Seam 1, `shares.test.ts`: the credential is asked for while the connection is still being made, and a refused credential makes the connection unavailable.
- `pnpm test` (Seam 1 and every journey), `pnpm typecheck` and `pnpm lint` pass.

**Not done here:**
- **Measuring on real media.** Nothing was deployed. Where the time goes (pull, answer, first frame) is for the timings above on `graeae-test`. What they show decides the next cut.
- **Two bigger cuts, left for the owner's call:**
  - Making the media connection when the room opens, so the first watch skips it. This costs a media connection per open tab.
  - Asking the sharer for a fresh keyframe on a new watch, if "first frame" turns out to be the long step.
- **A second single click** (not a double-click) during the wait still takes the share off. That is now what the lit icon says it will do.
