# 20: Cut-off of shares and watching

**What to build:** Removing a member, forgetting a device or letting a grace period run out now stops media too: the covered shares end for everyone watching them and the covered watching ends, through one routine. Tickets 09, 07 and 06 already end presence; this ticket makes the same events close every track.

Spec: [Cut-off](../spec.md#cut-off). ADR 0003.

UI: build with the impeccable skill, following `DESIGN.md`.

Blocked by: 06, 09, 11

Status: resolved

- [x] One cut-off routine serves every case, in this order: change storage; force-close the covered shares' tracks; force-close every other member's pulls of those shares; force-close the covered pulls; tell the affected tabs and close the connection where the device is gone
- [x] Removed from a room: their shares and watching in that room
- [x] Removed from the instance: all their shares and watching
- [x] Device forgotten: that device's shares and watching
- [x] Grace period ran out: that tab's shares and watching
- [x] A request arriving after the storage change is refused, even while closes are still in flight
- [x] Ordinary stops and clean leaves go through the same forced-close path
- [x] After each case the fake media server holds no track belonging to what was cut off
- [x] Removal applies during a grace period exactly as otherwise
- [x] The removal modal now also says what the member is sharing
- [x] Viewers of a cut-off share see it leave their stage; the removed member's page becomes "nothing here"
- [x] Seam 1 tests for every row, asserting on socket messages and the fake's tracks

## Comments

**Done** on `ticket/20-cut-off-of-shares-and-watching`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration. The owner was away, so the impeccable skill's questions were not asked; the one UI change is a sentence in the existing removal confirm, in its own voice.

- **The routine** is `Instance.cutOff(covered, cut?)` over `Shares.cutOff(covered, tabs)`. `Covered` is `{ member, room? }`, `{ device }` or `{ tab }`, matched against the `share` and `watch` records themselves (both carry member, device, room and tab). So it also reaches records whose tab is in its grace period, or never came back after a restart. In order: the caller changes storage; `Signaling.cutMember` / `cutDevice` (which replace `closeMember` / `closeDevice`) cut the tabs off at once, without closing them; the covered shares are all marked ending, then their own tracks close one by one; then every pull of those shares that is not itself covered closes; then the covered pulls close; the room and lists hear `shares.ended`; and last, `Cut.tell()` sends each cut-off tab `gone` and closes it with 4404, in a `finally`, so it happens even if a close throws. The media connections of the covered tabs are forgotten once empty, including one with no share or watch on it.
- **Removal from a room** covers `{ member, room }`, **removal from the instance** `{ member }`, a **forgotten device** `{ device }` (the "You" page, the owner, and "Let back in" at the press alike), and a **grace period that ran out** or a **clean leave** `{ tab }`. An **ordinary stop** goes through the same private `end()` with one share and no covered pulls. `Shares.left` and the old `close` are gone.
- **Requests during the closes.** A cut-off tab's attachment is marked `cutOff` in the first step, so from that instant it is not present, nothing it sends is read (not even an answer or a stop), it is sent nothing, and `isOpen` is false. A start or a pull of its that was waiting on the media server therefore closes itself when it returns. A share being ended gains no viewer: a watch request for it is refused, and a pull that returns while it is ending closes at once, even if the share's own close then fails. `closeWatch` does nothing for a record another path has already dropped.
- **What the room hears, and when.** Presence (`presence.left`) and `people.removed` / `people.access` / `rooms.unlisted` come with the storage change, as before. Then the viewers hear `unwatched` and the sharers `watchers`, then the room hears `shares.ended`, and only then does the cut-off tab get `gone`. Ticket 09's tests keep their order; the removed member's page now becomes "nothing here" only once the closes have returned (about 300 ms on the real media server).
- **The modal.** `MemberEntry` gains `sharing: { room, kind }[]` (`Shares.sharedBy`). For a present member the confirm adds "Their webcam share there ends for everyone watching." (room) or "Their webcam share in Late shift and screen share in First room end for everyone watching." (instance), or "They share nothing (there) now." It is built in `People.svelte` (`sharingLine`). I checked it through the Seam 2 journey's text, not in screenshots.
- **For ticket 21.** A failed close still keeps its record and the share stays live; the cut-off carries on with the other closes and still tells the tabs. The retry has one place to go: `Shares.closeTracks` and `closeWatch`. The sweep can go at the end of `Shares.cutOff`, which already knows which tabs it touched. `Signaling.alarm` still closes a silent socket (4408) at once rather than at step 5, since its device is not gone. **For ticket 24:** the budget stop is one more `Covered` kind (every watch, no share), which `whereCovered` can express as a condition over `watch` alone.
- **Tests.** `test/cutoff.test.ts` (10 tests): the order of the closes and of `gone`, using held closes; each row of the table (room, instance, device, grace period) with the socket messages and the fake's tracks; removal during a grace period; a request racing the closes refused; a clean leave in the same order; a stop refusing a new watch while it closes; and `sharing` on the People list. **Seam 2:** `test/browser/people.spec.ts` now has Jo share a webcam that the owner watches. The confirm names it, it leaves the owner's stage when Jo is removed from the room, and the instance removal says "They share nothing now."
