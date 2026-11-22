# 51: Starting again after a reload

**What to build:** two fixes for share starts that fail through ordinary use.
- A share stops counting the moment its end begins.
- A start or watch that does not go live lets go of an empty media connection.

**Why:** [Two tabs, and share starts run many times over](../../share-reliability/issues/06-two-tabs-and-share-starts.md) found two failures that chain together.

1. **After a reload, or a closed tab, with a share live, a start is refused for about 10.5 s.**
   - What the page sees: its own old share, live elsewhere. "Share from here" is refused as `not replaceable now`.
   - Why: the cut-off tells the room only after two media-server calls on the gone peer's connection, the close and then the sweep's tracks call. Each succeeds, but takes 5.0 to 5.4 s.
2. **A refused first start leaves the tab unable to share until it reloads.**
   - Its media connection never got a peer, so the media server drops the session within 11 to 20 s.
   - Every later offer into it gets a 410 after 5 s.
   - The instance answers the tab's next `connect` with `"already"`, so the tab cannot make a new connection.

The owner chose these fixes in [Starting again after a reload](../../share-reliability/issues/12-starting-again-after-a-reload.md), whose answer gives the reasoning and what was rejected. The 5 s calls stay as they are: no timeout changes. A shorter one would only turn successful closes into retries.

Spec: Cut-off, Shares, Seam 1.

**Status:** resolved

**Blocked by:** none

- [x] **A share whose end has begun no longer counts** (`src/instance/shares.ts`, `src/instance/instance.ts`).
  - **When the room hears.** For every end (an ordinary stop, a clean leave, a grace period running out, a removal, a forgotten device), the room and the lists of rooms hear that the share ended when its close begins, not once the cut-off's calls have returned.
    - Today `Instance.cutOff` awaits `Shares.cutOff` before `sharesEnded`, and `shares.stop` awaits `end`.
    - A hand-over keeps its own telling: the old tab hears `handed-over`, and the room hears nothing within one room.
  - **From that moment the share:**
    - is not listed, so it is left out of a fresh state too;
    - cannot be watched (already true while it is in `ending`);
    - does not count against a new share of its kind by the same member. `Shares.start` neither refuses a plain start because of it nor turns the start into a hand-over.
  - **The record.** It stays until its close returns.
    - A failed close keeps its record, its retries and the owner's 1-minute warning, as now.
    - The share never comes back into the room's list while it is retried. That must hold after the retry outlives `ending`, so mark it in storage (the retries already are), not only in memory. `current()`'s rule for a share replaced by a hand-over is the precedent.
  - **The sharer's own page.** Its "stopping" ends when the room hears. Check that the tab needs no change.
- [x] **A start or watch that does not go live lets go of an empty media connection.**
  - When `Shares.start` or a watch ends without going live, for any reason (refused before the media server is called, or the media server failed), and the tab's media connection then carries no share and no watch:
    - the instance forgets it (`forgetConnectionIfEmpty`);
    - it sends the tab `dropped` after `refused` or `pull-refused`.
  - The tab already answers `dropped` with `resetMedia`, so its next share or watch makes a new connection. Check that publish's and watch's failure paths need no change.
  - A connection that carries anything is left alone.
- [x] **Spec.**
  - **Cut-off.** In the routine's steps, the rooms hear which shares ended when their close begins (between steps 1 and 2), and the affected tabs are still told last. Add a line: a share whose end has begun is no longer listed, watchable or in the way of a new share of its kind; its record stays until its close returns.
  - **Shares.** A start or watch that does not go live lets go of the tab's media connection when that connection carries nothing, and the tab makes a new one on its next try.
  - **Seam 1's list.** Add both.
- [x] **Tests (Seam 1, on the fakes).** Use the fake media server's `hold` to keep a close waiting the way the 5 s calls do. Each test below is one case:
  1. A share is live and its tab leaves cleanly. While the close is held, a new tab of the same member starts the same kind with no hand-over, and the share goes live. The room lists only the new share, and the old one ends once the close is let go.
  2. As 1, but with two tabs of one member open at once and the sharing one leaving ([What two tabs on one device do](../../share-reliability/issues/08-two-tabs-on-one-device.md) asked for this case).
  3. While a close is held, the ending share cannot be watched, and a fresh state does not list it.
  4. A close that fails keeps its record and its retries, but the room never lists the share again, and a later retry ends it with no second `ended`.
  5. A refused first start (for example a plain start while the member's share of that kind is live from another tab): the tab hears `refused` and then `dropped`. Its next `connect` makes a new media connection, and a start on it goes live.
  6. The same after a refused first watch.
  7. A refused start on a connection that carries a watch: no `dropped`, and the watch carries on.
- [x] **On `graeae-test`, with `scripts/real-media/`**, once it is deployed, with a second member watching throughout:
  - **Reload.** With a share live, reload and start within 2 s. Do this three times. Each start goes live with no "already live" offer, and the watcher sees it.
  - **Two tabs.** Two tabs of one member (`newtab`, `tab <n>`). Close the sharing one and start from the other within 2 s. It goes live and the watcher sees it.
  - **A refused first start.** On a fresh page, provoke a refused first start with `eval`: a start the UI would not send, such as a plain start while a share of that kind is live from another tab. Wait 30 s, then share normally. It goes live with no 410.
  - Judge from what the pages show and the tabs' own reports. Ask the owner for the log token (CLAUDE.md, Logs, with `request_secret`) only if a check fails and the pages do not make the cause plain.

The agent does all of this alone. The owner checks nothing new, and `scripts/owner-checks.sh` gains no step.

## Comments

### 2026-11-22: built, not yet checked on real media

**The mark.** Migration 0008 adds `share.ending_at` and `watch.left_at`. `Shares.end` sets `ending_at` on each live share it ends before any media server call, tells the room and the lists of rooms (`ending`, which the instance turns into `shares ended`), then takes the share off its watchers' stages: each pull of it gets `left_at` and its watcher hears `unwatched`, and the sharer hears `watchers: []`. Then the closes run as before. `current()` leaves out an ending share as it does one a hand-over replaced, so it is not listed, not watchable and not in the way of a start (no refusal, no hand-over); `handOver` will not take one over. Its record, and its pulls' records, stay until their closes return; a pull's close that has `left_at` tells nobody again. A failed close keeps both, with its retries and the 1-minute warning, and since the mark is in storage it holds across a restart: `finishEnds` (was `finishHandOvers`) closes, after a restart, every live share that is ending or replaced. A hand-over keeps its own telling: the old share is ended through the same path, but `replacedIn` the same room tells the room nothing and its watchers are moved, not unwatched.

Taking the share off its watchers' stages at once goes a little past the ticket. Without it a watcher kept the old share's tile under the same name as the new one, and could not watch the new one until the old pull's close returned. The spec's Cut-off says so.

**Letting go.** After `refused` or `pull-refused`, `Shares.letGo` forgets the tab's media connection at once when it carries no share or watch and is not being made, and the instance sends `dropped`. Then, without holding up `dropped`, it asks the media server what is on the forgotten connection and closes any track it made although it reported the call failed, as the sweep at a cut-off closed it before (`restart.test.ts`'s "closes a pulled track the media server made although it reported the pull failed" now sees it closed after the refusal, and a new test there keeps the cut-off's own sweep covered for a connection that is not let go of). Publish's and watch's failure paths needed no change.

**The page.** No change. On `shares ended` for its own share the tab tidies it unless it is still starting, so "stopping" ends when the room hears; `unwatched` drops the picture, as before, only sooner.

**Tests.** `test/ending.test.ts` has the ticket's seven cases, case 5 both ways (the media server failing the publish, and a plain start while the member's share is live from another tab), and a stop from a tab that started the kind again while its old share was still closing. The old tests that encoded the room hearing after the closes now expect `ended` first, then `unwatched` and `watchers`, and a refusal on an empty connection now expects `dropped` after it: `cutoff`, `shares`, `watching`, `screen`, `retries`, `restart`, `dropped`, `setup`. The two "stays live when its forced close fails" tests now say it is no longer listed. `migrations.test.ts` gains the 0008 test (start on 1–7 with an owner, a member and a room, restart on all, then a share ends for the room while its close is held). The usage migration's test could no longer share on its older schema, since today's code reads 0008's column when it lists shares, so its share now comes after the restart. Typecheck and lint pass (lint's only errors are in the untracked `.logs/upload-estimate/scripts`). All 463 tests in the Workers runtime and all 60 journeys pass.

**After review.** The review found two bugs, both fixed and tested. A stop could pick the tab's old, ending share of the kind rather than the one it had started since, leaving the new one live: `stop` now goes through `current()`. And `letGo` awaited the sweep before forgetting the connection, which held `dropped` back by a media server call (about 5 s on real media, the very delay the ticket is about) and let a second refusal forget a connection made meanwhile: it now forgets at once and closes leftovers after. Also: `retry` and `faltered` no longer return the shares they ended, which nothing read; the in-memory sets are now `closingShares` and `closingWatches`, apart from the stored `ending` mark; `handOver`'s and `closeWatch`'s doc comments say what a failed close now does; `cutoff.test.ts`'s `settle` returns what it read, so its check there checks something. Left as it is: the stage rule (`watching_at IS NOT NULL AND left_at IS NULL`) written in five queries, and no test that a share recorded before 0008 survives the migration, since only today's code can write one and it needs 0008 to.

### 2026-11-22: checked on real media

Deployed to `graeae-test` from `8c3730e` (version `7d894374`). Two members ran on `:97` in the first room: Probe S shared a fake webcam (640x480, 30 fps, H.264 in OpenH264) and Probe W watched. All three checks pass, judged from the pages and the tabs' own stats. No log token was needed.

- **Reload.** Three rounds of `reload` followed at once by `share webcam`. Each went live within the second. The page showed neither "already live" nor "didn't start", and the sending side reported a fresh outgoing video (about 118 frames encoded after 5 s). Each time Probe W watched it again and decoded a new incoming video at 30 fps (mids 1, 2 and 3, about 117 frames after 5 s), with no drops or freezes.
- **Two tabs.** Probe S opened a second tab (`newtab`), shared from tab 1, and Probe W watched it. Then `reopen` closed tab 1, the sharing one: the script has no close-tab command, and `reopen` closes the tab and opens a fresh page in its place. `tab 2` and `share webcam` followed in the same second. The share went live from tab 2 with no offer and no "didn't start". Probe W watched it and decoded it at 30 fps (mid 5).
- **A refused first start.** Tab 2 still held the webcam share. On the fresh page from `reopen`, which had made no media connection, `eval` wrapped the socket's `send` so that the first start of a hand-over went out as a plain start; then `share webcam` and "Share from here" sent it. The instance refused it and the page said "Your webcam share didn't start. Try again." After 30 s the same tab shared again, normally, through "Share from here". It went live with no 410 and no "didn't start", and carried Probe W over: their watch moved to the new share (mid 6, decoded at 30 fps) without a click. Probe W's own `watch` click after that timed out only because the hand-over had already put the share on their stage.

Afterwards Probe S and Probe W were removed from People, their browser profiles were deleted, and the desktop on `:97` was stopped.
