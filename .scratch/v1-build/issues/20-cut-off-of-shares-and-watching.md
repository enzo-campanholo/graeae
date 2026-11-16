# 20: Cut-off of shares and watching

**What to build:** Removing a member, forgetting a device or letting a grace period run out now stops media too: the covered shares end for everyone watching them and the covered watching ends, through one routine. Tickets 09, 07 and 06 already end presence; this ticket makes the same events close every track.

Spec: [Cut-off](../spec.md#cut-off). ADR 0003.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 06, 09, 11

**Status:** ready-for-agent

- [ ] One cut-off routine serves every case, in this order: change storage; force-close the covered shares' tracks; force-close every other member's pulls of those shares; force-close the covered pulls; tell the affected tabs and close the connection where the device is gone
- [ ] Removed from a room: their shares and watching in that room
- [ ] Removed from the instance: all their shares and watching
- [ ] Device forgotten: that device's shares and watching
- [ ] Grace period ran out: that tab's shares and watching
- [ ] A request arriving after the storage change is refused, even while closes are still in flight
- [ ] Ordinary stops and clean leaves go through the same forced-close path
- [ ] After each case the fake media server holds no track belonging to what was cut off
- [ ] Removal applies during a grace period exactly as otherwise
- [ ] The removal modal now also says what the member is sharing
- [ ] Viewers of a cut-off share see it leave their stage; the removed member's page becomes "nothing here"
- [ ] Seam 1 tests for every row, asserting on socket messages and the fake's tracks
