# 22: Media through dropped connections

**What to build:** A dropped signaling connection does not interrupt media. Viewers keep watching through the grace period, a sharer's share stays live and can gain viewers, and a member who returns after the grace period ran out gets their stage or their share back without rebuilding it.

Spec: [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection), [Shares](../spec.md#shares). User stories 68 to 72.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 06, 15, 20

**Status:** ready-for-agent

- [ ] Sharer's connection drops while media flows: the share stays live through the grace period, current viewers keep watching and new viewers can start
- [ ] If the sharer reconnects in time it is the same share
- [ ] The "reconnecting" mark shows on a share's icon when the lost device is the one sending that share
- [ ] Viewer's connection drops: the stage keeps playing and shows "Reconnecting…" after about 3 seconds
- [ ] A viewer who returns after the grace period ran out has their stage restored to what they were watching, where those shares are still live
- [ ] A sharer who returns after the grace period ran out has their share start again by itself, with no picker, if the tab still holds the capture, unless they started it from another device meanwhile
- [ ] That sharer's previous viewers are not carried over
- [ ] Media falters while the signaling connection is fine: the share stays live for 30 seconds while the browser tries to recover, then ends: the sharer's tab reports the faltering and the recovery, and the backend ends the share
- [ ] Seam 1 tests with controlled time; Seam 2 for the marks and the restored stage
