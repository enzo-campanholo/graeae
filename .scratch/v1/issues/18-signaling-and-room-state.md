# Signaling and room state

Type: grilling
Status: resolved
Blocked by: 11, 12
Map: ../map.md

## Question

How do presence, the list of live shares and reconnection work over the instance's single Durable Object and its WebSocket?

Inputs are [App hosting and framework](11-app-hosting-and-framework.md), which fixed one Durable Object per instance with hibernating WebSockets, and [Room experience](12-room-experience.md), which fixes what a member sees in a room.

Decide:

- What makes a member present in a room, and when they stop being present (tab closed, connection lost, several devices at once).
- How a share becomes live and stops being live, and how every present member learns of it.
- What a client does when the connection drops, including Cloudflare's runtime updates that drain connections within 20 minutes, and what the others see meanwhile.
- What happens to a live share when its sharer's signaling connection drops but the media keeps flowing.

Who may publish or watch on the media server is not part of this ticket; it stays in the map's fog as Securing the media layer.

From [Room experience](12-room-experience.md):

- A sharer sees which members are watching each of their shares, so the room state has to carry who watches what.
- A member sends at most one screen share and one webcam share at a time across all their devices. Starting one on a second device offers to stop the first and share from the new device.

From [Usage budget](14-usage-budget.md):

- Each watching browser reports the bytes it received every few seconds over this WebSocket, and the backend charges the share's maximum bitrate for watch time that goes unreported.
- When the usage budget is reached the backend stops all watching and refuses new watching while shares stay live. Present members are warned at 95% and told at the stop.

## Answer

Settled by grilling on 2026-11-16.

**Presence**

- Each open tab holds one connection to the instance and says which room it is showing. A member is present in a room while at least one of their devices has that room open, background and minimised tabs included. There is no idle detection.
- The list of rooms at the root address updates live and makes the member present nowhere. Two tabs on two rooms make a member present in both.
- A clean leave (tab closed, reload, navigating away) ends presence for that tab at once, along with any share that tab was sending.
- A lost connection gets a grace period of 30 seconds, counted from the last heartbeat the backend heard. During it the member is still present and nothing is torn down. The browser sends a heartbeat every 5 seconds.
- After about 10 seconds of silence the others see a small "reconnecting" mark. It appears on the member's name when they have no connected device left in the room, and on a share's icon when the lost device is the one sending that share. A second device dropping while another stays connected shows nothing.

**Shares**

- A share becomes live when the backend has registered it with the media server. Every present member's bar shows its icon at that moment.
- It stops being live when the sharer presses stop, uses the browser's own "stop sharing" bar, closes the shared tab or window, leaves cleanly, is removed, hands over to another device, or their grace period runs out.
- One screen share and one webcam share per member across the whole instance, not per room. Starting one anywhere while another is live offers to stop the live one.
- On a hand-over the first device's share stops and that device shows "Now sharing from your other device". Viewers in the same room are carried over to the new share after a short gap. A hand-over into a different room ends the share in the first room and carries nobody.

**Dropped connections**

- Sharer drops, media still flows: the share stays live through the grace period. Current viewers keep watching and new viewers can start, since the backend sets up watching without the sharer. If the sharer's browser reconnects in time it is the same share. If not, the backend closes it.
- Media falters while the connection is fine: the share stays live for 30 seconds while the browser tries to recover, then ends.
- Viewer drops: their watching continues through the grace period, charged at the share's maximum bitrate as [Usage budget](14-usage-budget.md) decided. After 30 seconds the backend closes what they were watching. The viewer sees "Reconnecting…" after about 3 seconds while the stage keeps playing.
- A browser retries the connection by itself. Cloudflare's runtime updates are an ordinary drop: the browser reconnects in a second or two, well inside the grace period, and nobody sees anything.
- Coming back after the grace period ran out: a viewer's stage is restored to what they were watching, where those shares are still live. A sharer's share starts again by itself with no picker if the tab still holds the capture, unless they have started it from another device meanwhile. The sharer's previous viewers are not carried over, since for them the share ended.
- Removal and the usage budget stop apply during a grace period exactly as otherwise.

**Watching**

- Watching belongs to a device, since each device has its own stage.
- Only the sharer sees who is watching a share. A watching member is named once however many devices they watch on.
- A member may watch their own share from another device, without being listed.

**State**

- The backend is the single source of truth. A browser gets the full room state on connecting and on every reconnect, then changes as they happen. Nothing is replayed.
- Changes to names, rooms and access reach present members live over the same connection.
- Live shares and watching survive a backend restart (a graeae deploy or a Cloudflare restart). Everyone is treated as in their grace period and reconnects, so a deploy during a session shows at most a "reconnecting" flicker. This means live state is kept in the Durable Object's storage, not only in its connections; `docs/adr/0002-one-durable-object-per-instance.md` is amended to say so.

**Still unknown.** Whether a 5-second heartbeat and the viewers' byte reports keep the Durable Object under the free duration quota. The 42% figure in the ADR was estimated before either existed and is measured when something is built.

**Glossary.** Added **Live**. **Present** now mentions the grace period.

**No new ADR.** The grace period, heartbeat and marks are all easy to change.

**Follow-ons.** Graduates [Media layer records and relay credentials](20-media-layer-records-and-relay-credentials.md) from the map's Securing the media layer.

## Comments after resolution

**2026-11-16, from [Usage count accuracy](24-usage-count-accuracy.md).** A viewer's byte report is one running total per media connection (the transport's bytes received since it opened), not a per-watch figure. The backend charges the difference between reports, and the tab sends a final total before a connection restart.
