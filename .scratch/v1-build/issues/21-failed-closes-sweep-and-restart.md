# 21: Failed closes, sweep and restart

**What to build:** A cut-off still lands when the media server misbehaves or the instance restarts. Failed closes are retried, tracks the records do not account for are found and closed, the owner is warned if a cut-off cannot be confirmed, and a graeae update during a session shows members at most a "reconnecting" flicker.

Spec: [Cut-off](../spec.md#cut-off), [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection). ADRs 0002 and 0003.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 20

**Status:** resolved

- [x] A failed forced close keeps its record and is retried on a backoff: 1s, 2s, 4s, up to 30s between tries
- [x] Retrying ends when the close succeeds or a sweep shows the track gone
- [x] The owner's page shows a removal as done at once
- [x] If closes are still failing after 1 minute the owner sees: "Couldn't confirm that <name> was cut off. Still trying."
- [x] Sweep: at each cut-off and after a restart, the backend asks which tracks the affected media connections really have and force-closes anything its records do not account for
- [x] There is no timed sweep
- [x] A crash between writing a record and calling the media server leaves a record that the sweep clears
- [x] An empty media connection left open by a cut-off browser is left alone and its record dropped
- [x] After a restart of the instance, live shares and watching are still on record and everyone is treated as in their grace period
- [x] Members who reconnect within the grace period keep their shares and watching; those who do not are cut off as usual
- [x] Seam 1 tests use the fake's failures and delays and restart the instance mid-session
- [x] The media layer seam gains "which tracks does this connection have", in the fake and in the Cloudflare implementation
- [x] The Seam 1 harness gains a way to restart the instance mid-test while the fake media server keeps its tracks

## Comments

**Done** on `ticket/21-failed-closes-sweep-and-restart`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration: retries and the open tabs are kept in the Durable Object's key-value storage. A first agent built the backend and stopped at a rate limit partway through the UI. A second one merged `v1-build` (ticket 14), finished the UI and fixed what the full suite showed. The owner was away, so the impeccable skill's questions were not asked. The one UI addition is a warning line in DESIGN.md's amber.

- **Retry** (`src/instance/shares.ts`): a failed forced close of a share, a watch, or a track no record names is kept under `shares:retries` with its try count and next moment: 1 s, 2 s, 4 s, 8 s, 16 s, then every 30 s. It ends when a close returns, when the record is gone, or when a sweep shows the track gone. The share stays live, and its watching stays on the stage, until then. `Instance.alarm` runs `Shares.retry` after `Signaling.alarm`. The instance has **one alarm** for the earliest of `Signaling.nextMoment()` and `Shares.nextRetry()` (`Instance.schedule`), as ticket 06 asked. **Ticket 24's** budget work, and anything else that needs a timer, should add its moment there.
- **The owner's answer does not wait.** Removal from a room, removal from graeae and forgetting a device now answer at once and run the cut-off in `waitUntil`. Ticket 20's order of messages is unchanged. "Let back in" still awaits its forgets, since the join answers the new browser. A cut-off carries a `Subject` (the member, their name, when it began). `PeopleAnswer.unconfirmed` names each member whose cut-off has had a retry pending for a minute or more, including a member already removed from graeae.
- **The warning** (`People.svelte`): under the list, "Couldn't confirm that Jo was cut off. Still trying." in `text-warn` with a circled "!" (lucide `circle-alert`), one line per member. The list already asks again every 15 s while in view, so the line comes and goes by itself. Its `role="status"` container is always in the page, so a screen reader hears it appear. The "removed" note beside it is now picked by its text in `people.spec.ts`.
- **Sweep**: `MediaLayer.tracks(connection)`, in the fake (`fakeMediaControl.calls("tracks")` counts the questions) and in Cloudflare (`GET sessions/{id}`: inactive tracks don't count, and a 410 means no tracks). It runs at the end of every `Shares.cutOff` over the connections the cut-off touched, and after a restart over every connection on record. A track no record accounts for is force-closed, with retries. A record whose track is gone is dropped, and a live share whose track is gone ends for its viewers. A record left half-made by a call the restart cut short is dropped, after closing its track if the media server made one. Records whose call is still under way in this run (`inFlight`), ending or closing are left alone. A connection the media server can't be asked about is left until the next sweep. There is no timed sweep (a test runs 10 minutes of heartbeats and sees no `tracks` call). An empty connection is never closed, and its record is dropped.
- **Restart** (`Signaling.restore`): the room tabs with an open socket are kept under `signaling:open`. An instance that starts and finds such a tab with no socket treats it as lost, heard at that moment. So do tabs that only the records of shares and watching name. Everyone is in their grace period, and a browser that reconnects in time takes its tab id back, with its shares and watching. A tab that doesn't is cut off by the usual alarm. An instance that wakes from hibernation still holds its sockets and is not swept. The restore is wrapped so that a failure logs and the instance still starts. Without that, an instance started on an older schema (the migration tests) broke on the query, and in production one failed restore would refuse every request.
- **Harness**: `instance.restart()` now aborts the Durable Object (`state.abort`), which drops every socket the way a deploy does. Evicting alone kept them, as hibernation does. The fake keeps its tracks. Each call makes a new stub, since one that saw the abort stays broken. The abort logs `uncaught exception … the test restarts the instance` from workerd for each restart. That is expected noise, not a failure. The fake gained `fail(op, { done })`, `queued(op)` and `calls(op)`.
- **Tests**: `test/retries.test.ts` covers the backoff to 30 s, retrying until success, a sweep stopping retries, a removal answering while the close is held, and the 1-minute warning appearing and clearing. `test/restart.test.ts` covers the restart within and past the grace period and a viewer outlasting its sharer, plus the crash-mid-start record, a track or a pull the media server made just before a restart, the sweep at a cut-off closing a pull reported failed, the empty connection, and no timed sweep. **Seam 2**: `people.spec.ts` shows the warning, with the instance's answer extended through Playwright's routing, since the fake behind the app can't be told to fail from the browser. Screenshots (dark and light) come from `GRAEAE_SCREENSHOTS=<dir>`.
- **Left open:** ticket 07's point still stands. Pressing an invite on a browser remembered as *another* member's device, or using the setup secret again, forgets that device without cutting off its open tabs. The sweep would close their tracks only at the next cut-off or restart that touches them.
