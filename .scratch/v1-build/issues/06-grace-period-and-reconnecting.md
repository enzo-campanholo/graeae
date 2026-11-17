# 06: Grace period and reconnecting

**What to build:** A member whose connection drops stays present for 30 seconds with nothing torn down, and their browser reconnects by itself. The others see a small "reconnecting" mark only once the silence has lasted about 10 seconds.

Spec: [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 05

**Status:** resolved

- [x] The browser sends a heartbeat every 5 seconds; there is no idle detection
- [x] A lost connection gets a grace period of 30 seconds from the last heartbeat heard; the member stays present throughout
- [x] When the grace period runs out the tab's presence ends
- [x] After about 10 seconds of silence a "reconnecting" mark shows on the member's name, only when they have no connected device left in the room
- [x] A second device dropping while another stays connected shows nothing
- [x] The browser retries by itself and gets the full room state on reconnect; nothing is replayed
- [x] A reconnect within the grace period is invisible to the others if under about 10 seconds
- [x] Seam 1 tests with controlled time

## Comments

**Done** on `ticket/06-grace-period-and-reconnecting`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration: lost tabs and marks are kept in the Durable Object's key-value storage (`ctx.storage.kv`), not in a table.

- **The protocol** (`src/shared/socket/heartbeat.ts`, shared by both sockets): a tab sends `{ type: "heartbeat" }` every 5 s and the instance answers each with `{ type: "heard" }`. Both are top-level messages on the room's socket and the list's (`ClientMessage`, `ListClientMessage`, `ServerMessage`, `ListMessage`), since the list has no presence area. The constants are there too: `HEARTBEAT_EVERY_MS`, `RECONNECTING_AFTER_MS` (10 s), `GRACE_MS` (30 s), `LOST_CLOSE_CODE` (4000) and `SILENT_CLOSE_CODE` (4408).
- **Presence** gains `reconnecting: string[]` in its state and two changes, `reconnecting` and `reconnected` (`{ member }`). `left` clears both lists. A member is marked when they are present and none of their tabs in the room, open or lost, has been heard for 10 s. So a second device that is still beating hides the mark, and a reconnect clears it. The mark is per room.
- **What counts as lost.** A socket error, close code 1006, or `LOST_CLOSE_CODE`, which the page sends when it gives up on a dead socket. Any other close is a clean leave, including 1001, which browsers send on closing or reloading a tab. A socket that stays open but falls silent is lost too: at 30 s the instance closes it with `SILENT_CLOSE_CODE` and the tab's presence ends. Seam 1 cannot produce a real 1006, so the tests use `LOST_CLOSE_CODE` and silence.
- **Lost tabs** are the attachment of the closed socket, kept under `signaling:lost` until 30 s after their `heardAt`. They count in `Signaling.present()`. The rooms' marks are kept under `signaling:reconnecting`. A socket that opens for the same device and room takes back that device's lost tab, **keeping its tab id**. **Ticket 22** can key shares and watching by tab id, and "if the sharer reconnects in time it is the same share" follows. Forgetting a device (`closeDevice`) also ends its lost tabs at once. **Ticket 09** gets that for free if it reuses `closeDevice` or does the same by member.
- **The alarm.** `Instance.alarm()` calls `Signaling.alarm()`, which ends expired tabs, updates the marks and sets the next alarm. It is set only on opening a socket, on a lost close and in the alarm itself. Heartbeats only push deadlines later, so an early alarm just finds nothing to do. That is about one alarm every 5 s while any tab is open. **Ticket 21** (retry backoff) will need the same alarm: it should become one alarm for the earliest of several schedules.
- **Not done here (ticket 21):** a restart. Sockets the restart drops never reach `webSocketClose`, so they do not become lost tabs. Lost tabs already in storage do survive a restart.
- **Why the instance answers heartbeats itself** rather than with `setWebSocketAutoResponse` (which would not wake it): the auto-response timestamp comes from the runtime's clock, not the test's, so Seam 1 could not control it. Worth revisiting when the duration quota is measured (ADR 0002).
- **The page.** `src/app/lib/connection.svelte.ts` is the one connection both clients now use. It beats every 5 s and gives a socket up after 4 s without an answer, or 4 s without opening, closing it with `LOST_CLOSE_CODE`. It then checks for a refusal over HTTP as before, and otherwise reconnects after 250 ms, 1 s, 2 s, 4 s, then every 5 s, and at once on the browser's `online` event. It applies the full state again and replays nothing. `gone` is handled there for both. The tick runs in a dedicated worker (`ticker.ts`, `ticker.worker.ts`). Chromium throttles a tab hidden for five minutes to one timer wake-up a minute, which would end presence while the room sits in a background tab; dedicated workers are not throttled. It falls back to `setInterval` without workers.
- **The mark** (built with the impeccable skill; the owner was away, so no direction questions were asked): the member's row gets a dim "· reconnecting" after the name, in the same form as "· you". The avatar breathes slowly between full and 40% opacity, and sits still at 55% under reduced motion. No colour, since the eye means watching and amber means a warning. In the rail, the avatar breathes the same way, the tooltip reads "Hana · reconnecting" and the button's name is "Follow Hana, reconnecting". The row can still be clicked to follow. `?sample` shows Duda reconnecting. The mark on a share's icon is ticket 22's.
- **Tests.** `test/grace.test.ts` covers Seam 1 with the test's clock. A test tab now has `heartbeat()` (it waits for the answer, so everything sent before it has arrived), `queued()` and `drop()`. Test tabs never beat by themselves. `addDevice` and `addSecondBrowser` moved from `you.test.ts` to `steps.ts`. The harness test's stand-in alarm now restores the instance's own handler. **Seam 2:** `test/browser/reconnecting.spec.ts` routes Hana's socket through Playwright and cuts it. The owner sees "· reconnecting" after about 10 s, and it goes once the route passes traffic again; the same holds in the rail. It runs in real time, about 30 s.
- Under heavy load from other work on this machine, a few Seam 1 tests once timed out at 5 s while two files ran in parallel. They passed on every quieter run.
