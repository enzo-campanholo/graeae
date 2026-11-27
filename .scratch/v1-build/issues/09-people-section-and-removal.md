# 09: People section and removal

**What to build:** The owner sees every member on the owner page, grants and takes away access with one tick per room, forgets a member's devices, lets a member back in, and removes a member from a room or from the instance. A removed member who is present lands on "nothing here" within about 2 seconds.

Spec: [Other pages](../spec.md#other-pages) (People, Removal confirm), [People, devices and invites](../spec.md#people-devices-and-invites), [Cut-off](../spec.md#cut-off).

UI: build with the impeccable skill, following `DESIGN.md`.

Blocked by: 07, 08

Status: resolved

- [x] People lists every member with their access to each room, device count and last visit
- [x] Picking a member shows access as one tick per room, their devices with "Forget", "Let back in" and "Remove from graeae"
- [x] Ticking a room grants access at once and present members see the change live
- [x] Unticking a room opens the removal modal; the tick stays until the modal is confirmed
- [x] Every removal asks in a modal, with no exception; it says whether the member is present, that it stops within about 2 seconds and which rooms they keep (what they are sharing is added in ticket 20)
- [x] Removal from the instance also says that their devices are forgotten and that coming back takes a new invite
- [x] No countdown and no undo
- [x] Removal from a room ends the member's presence there on every device, within about 2 seconds, and that page becomes "nothing here" with no message
- [x] Removal from the instance does this everywhere and forgets all their devices
- [x] "Let back in" creates a 7-day invite for the existing member; using it forgets all their previous devices and keeps their display name and access
- [x] The owner can forget any member's device
- [x] Storage is changed before any connection is closed, so a request racing the removal is refused
- [x] Seam 1 tests; a Seam 2 journey where a second browser is removed while present
- [x] The owner's own entry has no untick and no "Remove from graeae"

## Comments

**Done** on `ticket/09-people-section-and-removal`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration: access, devices and invites already hold everything. The first agent on this ticket ran out of memory after the protocol and a first UI; a second agent merged ticket 11 in, checked both against the boxes, added the watching tests and finished. The owner was away, so the impeccable skill's questions were not asked; the UI follows `DESIGN.md` as it stands, checked in screenshots in both themes.

- **Routes**, all owner-only, everything else refused like any address: `GET /api/owner/people` (`PeopleAnswer`: every room, then every member oldest first so the owner leads, each a `MemberEntry` with rooms, rooms present in, devices, last visit and any pending "Let back in"); `PUT` and `DELETE /api/owner/people/<id>/rooms/<address>` (the tick and the confirmed untick, answering the member as they are now); `DELETE /api/owner/people/<id>/devices/<device>` (forget, the same `Instance.forget` the "You" page uses); `POST /api/owner/people/<id>/invite` ("Let back in"); `DELETE /api/owner/people/<id>` (remove from graeae). The owner is refused on the tick, the untick, "Let back in" and removal.
- **Cut-off order.** Storage first (`People.revoke`, `People.remove`), then `Signaling.closeMember(id, address?)`, which shares `closeDevice`'s path by `member:<id>` tag: each tab is told `gone` and closed, lost tabs in a grace period end too, and the room hears `presence.left` where it was their last tab. Then the room hears the new change `people.removed { member }`, the member's other tabs hear `people.access`, their lists `rooms.unlisted { address }` (new), and each closed tab goes through `Instance.left`, which ends its shares and closes its watching. Removal from the instance closes list tabs too, and drops any invite for the member. A grant sends `people.added` to the room, `people.access` to the member, and `relist`s the room.
- **"Let back in"** is an `'owner'` invite with the member's `member_id` (as ticket 07 proposed), so it shows in the owner's pending list under their current name and rooms, and cancels like any invite. A new one replaces one still pending. Pressing it deletes every device of the member, closes their tabs (`JoinAnswer` path, through `closeDevice`), then remembers the browser. An invite for a removed member is no invite.
- **For tickets 10 and 11:** a request from a tab of a removed member cannot arrive after the storage change on an open socket, since the socket closes in the same turn. The races are tested instead: a webcam start whose publish was in flight never goes live, and a watch whose pull was in flight leaves no pull. Removal from a room is also tested to close the member's watching there, with the sharer told `watchers` without them.
- **The page.** People is a list (avatar, name with "· owner", their rooms, device count, "Here now" or the last visit) beside the picked member: one tick per room, their devices with Forget (the owner's own current device asks inline first, as on "You"), "Let back in" (copied at the press and shown, with copy and cancel) and "Remove from graeae". The owner's entry has its ticks disabled and neither button. The list asks again on focus, on coming back to the tab, every 15 seconds while in view, and when a removal confirm opens, so the modal says where the member is now. `RemovalConfirm.svelte` is a bits-ui alert dialog: title, one line per consequence, Cancel (focused) and Remove. No countdown and no undo.
- **Decisions the owner may change:** a member unticked from their only room stays a member with no room (the modal says so) rather than being removed from graeae; the modal for a member not present says so and leaves out the "about 2 seconds" line, since nothing is cut off; the confirm's Remove rests in the stop tint, unlike Forget on a row, since the modal exists only to remove.
- **For ticket 20:** the modal's lines are built in `People.svelte` (`confirm`); add what the member is sharing there. `accessRemoved` and the instance removal are the two places to route through the one cut-off routine. **For ticket 21:** the 1-minute "Couldn't confirm" warning has nowhere to show yet; the People section's `note` line under the list is the natural spot. Ticket 07's open point stays open: pressing an invite on a browser remembered as *another* member's device forgets that device without closing its tabs.
- **Tests.** `test/people.test.ts` (26 tests): the list, every route's refusals, each removal's messages and refusals afterwards, every device and the grace period, shares and watching ending with no track left, storage before the close (a held close), the in-flight start and watch, forgetting by the owner, and "Let back in" (7 days, forgetting at the press, keeping name and rooms, replacing, cancelling, gone with the member). **Seam 2:** `test/browser/people.spec.ts` (member Jo), in its own Playwright project after "several rooms", since it uses the second room: the tick granting at once and Jo's bar gaining the link back, the untick asking with the tick kept, Cancel, Remove turning Jo's page to "nothing here" within 3 seconds, "Remove from graeae" saying the device is forgotten, Jo a stranger afterwards, and the owner's own entry.
