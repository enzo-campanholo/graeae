# 09: People section and removal

**What to build:** The owner sees every member on the owner page, grants and takes away access with one tick per room, forgets a member's devices, lets a member back in, and removes a member from a room or from the instance. A removed member who is present lands on "nothing here" within about 2 seconds.

Spec: [Other pages](../spec.md#other-pages) (People, Removal confirm), [People, devices and invites](../spec.md#people-devices-and-invites), [Cut-off](../spec.md#cut-off).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 07, 08

**Status:** ready-for-agent

- [ ] People lists every member with their access to each room, device count and last visit
- [ ] Picking a member shows access as one tick per room, their devices with "Forget", "Let back in" and "Remove from graeae"
- [ ] Ticking a room grants access at once and present members see the change live
- [ ] Unticking a room opens the removal modal; the tick stays until the modal is confirmed
- [ ] Every removal asks in a modal, with no exception; it says whether the member is present, that it stops within about 2 seconds and which rooms they keep (what they are sharing is added in ticket 20)
- [ ] Removal from the instance also says that their devices are forgotten and that coming back takes a new invite
- [ ] No countdown and no undo
- [ ] Removal from a room ends the member's presence there on every device, within about 2 seconds, and that page becomes "nothing here" with no message
- [ ] Removal from the instance does this everywhere and forgets all their devices
- [ ] "Let back in" creates a 7-day invite for the existing member; using it forgets all their previous devices and keeps their display name and access
- [ ] The owner can forget any member's device
- [ ] Storage is changed before any connection is closed, so a request racing the removal is refused
- [ ] Seam 1 tests; a Seam 2 journey where a second browser is removed while present
- [ ] The owner's own entry has no untick and no "Remove from graeae"
