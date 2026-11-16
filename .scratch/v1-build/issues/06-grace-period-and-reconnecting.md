# 06: Grace period and reconnecting

**What to build:** A member whose connection drops stays present for 30 seconds with nothing torn down, and their browser reconnects by itself. The others see a small "reconnecting" mark only once the silence has lasted about 10 seconds.

Spec: [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The browser sends a heartbeat every 5 seconds; there is no idle detection
- [ ] A lost connection gets a grace period of 30 seconds from the last heartbeat heard; the member stays present throughout
- [ ] When the grace period runs out the tab's presence ends
- [ ] After about 10 seconds of silence a "reconnecting" mark shows on the member's name, only when they have no connected device left in the room
- [ ] A second device dropping while another stays connected shows nothing
- [ ] The browser retries by itself and gets the full room state on reconnect; nothing is replayed
- [ ] A reconnect within the grace period is invisible to the others if under about 10 seconds
- [ ] Seam 1 tests with controlled time
