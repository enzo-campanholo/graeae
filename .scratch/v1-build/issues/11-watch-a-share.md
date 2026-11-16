# 11: Watch a share

**What to build:** A present member clicks the webcam icon on another member's row and that share appears on their stage. Clicking the icon again, or "stop watching" on the share, takes it off. The sharer sees the names of the members watching.

Spec: [Checks on every request](../spec.md#checks-on-every-request), [Media connections and records](../spec.md#media-connections-and-records), [Shares](../spec.md#shares), [The room's screen](../spec.md#the-rooms-screen).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] The media layer seam and its fake gain "pull a share's tracks"
- [ ] The browser asks for "this member's webcam"; the backend finds the sharer's media connection and tracks in its own records and builds the pull
- [ ] To watch, the backend checks: a remembered device, access to the room, this tab present in the room the share is live in, and that the share is live
- [ ] The watch record is written before the media layer is called and dropped only after its forced close returns
- [ ] Nothing is watched on arrival; the stage says so
- [ ] A share's icon adds that share to the stage or takes it off, leaving other watched shares alone
- [ ] A share that is not watched shows no live picture anywhere
- [ ] Watching belongs to a device: two devices of one member have separate stages
- [ ] Only the sharer sees who is watching; a watching member is named once however many devices they watch on
- [ ] A member can watch their own share from another device and is not listed
- [ ] When a share ends, every watch of it is force-closed and leaves each viewer's stage
- [ ] A viewer's clean leave force-closes their watching
- [ ] Seam 1 tests; a Seam 2 journey: 1 click to watch
