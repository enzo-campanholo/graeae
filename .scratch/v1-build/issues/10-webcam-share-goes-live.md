# 10: Webcam share goes live

**What to build:** A member presses "Share webcam" and their webcam share is live at once: every present member's bar shows the webcam icon on their row, and the sharer sees a small preview at the foot of the bar with a stop button. Pressing stop ends it for everyone.

This ticket introduces the media layer seam and builds everything against fakes. The real media server arrives in ticket 12.

Spec: [Modules](../spec.md#modules), [Media connections and records](../spec.md#media-connections-and-records), [Checks on every request](../spec.md#checks-on-every-request), [Shares](../spec.md#shares), [Relay](../spec.md#relay). ADR 0003.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 05, 08

**Status:** ready-for-agent

- [ ] The media layer is one seam between the instance and the media server. This ticket defines only the operations it uses: make a media connection, publish a share's tracks, force-close named tracks, mint a relay credential. Tickets 11, 17 and 21 add pull, change of quality and the listing of a connection's tracks
- [ ] An in-memory fake media server implements it for Seam 1: it keeps tracks per media connection, lets a test read them, and can be told by a test to fail or delay a call, through a control that exists only in tests. Its state lives outside the instance, so it outlives a restart of the instance
- [ ] The media client is the browser's one module for capture and the tab's media connection, with a fake for Seam 2 that captures and connects nothing
- [ ] A tab makes its one media connection the first time it shares or watches, not on opening the room
- [ ] A relay credential lasting 12 hours is minted for each new media connection and handed to that tab; the backend keeps no record of it
- [ ] The browser never receives or sends a media server identifier
- [ ] The backend picks every track name and writes the media connection and share records to storage before calling the media layer
- [ ] To share, the backend checks: a remembered device, access to the room, this tab present in that room, and no other live webcam share by the member (a second attempt is refused until ticket 19 adds hand-over)
- [ ] A share is live once registered with the media server; every present member's bar shows its icon at that moment, and the list of rooms shows its count of live shares
- [ ] "Share webcam" starts with no dialog: 1 click
- [ ] The sharer's preview and stop button sit at the foot of the bar
- [ ] Stop and a clean leave both end the share by a forced close; the record is dropped only after the close returns
- [ ] Seam 1 tests assert on socket messages and on the fake's tracks; a Seam 2 journey with two browsers
