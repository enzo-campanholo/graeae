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

**Status:** ready-for-agent

**Blocked by:** none

- [ ] **A share whose end has begun no longer counts** (`src/instance/shares.ts`, `src/instance/instance.ts`).
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
- [ ] **A start or watch that does not go live lets go of an empty media connection.**
  - When `Shares.start` or a watch ends without going live, for any reason (refused before the media server is called, or the media server failed), and the tab's media connection then carries no share and no watch:
    - the instance forgets it (`forgetConnectionIfEmpty`);
    - it sends the tab `dropped` after `refused` or `pull-refused`.
  - The tab already answers `dropped` with `resetMedia`, so its next share or watch makes a new connection. Check that publish's and watch's failure paths need no change.
  - A connection that carries anything is left alone.
- [ ] **Spec.**
  - **Cut-off.** In the routine's steps, the rooms hear which shares ended when their close begins (between steps 1 and 2), and the affected tabs are still told last. Add a line: a share whose end has begun is no longer listed, watchable or in the way of a new share of its kind; its record stays until its close returns.
  - **Shares.** A start or watch that does not go live lets go of the tab's media connection when that connection carries nothing, and the tab makes a new one on its next try.
  - **Seam 1's list.** Add both.
- [ ] **Tests (Seam 1, on the fakes).** Use the fake media server's `hold` to keep a close waiting the way the 5 s calls do. Each test below is one case:
  1. A share is live and its tab leaves cleanly. While the close is held, a new tab of the same member starts the same kind with no hand-over, and the share goes live. The room lists only the new share, and the old one ends once the close is let go.
  2. As 1, but with two tabs of one member open at once and the sharing one leaving ([What two tabs on one device do](../../share-reliability/issues/08-two-tabs-on-one-device.md) asked for this case).
  3. While a close is held, the ending share cannot be watched, and a fresh state does not list it.
  4. A close that fails keeps its record and its retries, but the room never lists the share again, and a later retry ends it with no second `ended`.
  5. A refused first start (for example a plain start while the member's share of that kind is live from another tab): the tab hears `refused` and then `dropped`. Its next `connect` makes a new media connection, and a start on it goes live.
  6. The same after a refused first watch.
  7. A refused start on a connection that carries a watch: no `dropped`, and the watch carries on.
- [ ] **On `graeae-test`, with `scripts/real-media/`**, once it is deployed, with a second member watching throughout:
  - **Reload.** With a share live, reload and start within 2 s. Do this three times. Each start goes live with no "already live" offer, and the watcher sees it.
  - **Two tabs.** Two tabs of one member (`newtab`, `tab <n>`). Close the sharing one and start from the other within 2 s. It goes live and the watcher sees it.
  - **A refused first start.** On a fresh page, provoke a refused first start with `eval`: a start the UI would not send, such as a plain start while a share of that kind is live from another tab. Wait 30 s, then share normally. It goes live with no 410.
  - Judge from what the pages show and the tabs' own reports. Ask the owner for the log token (CLAUDE.md, Logs, with `request_secret`) only if a check fails and the pages do not make the cause plain.

The agent does all of this alone. The owner checks nothing new, and `scripts/owner-checks.sh` gains no step.
