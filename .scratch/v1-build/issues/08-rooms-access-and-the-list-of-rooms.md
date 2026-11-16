# 08: Rooms, access and the list of rooms

**What to build:** The owner creates a second room and renames rooms on the owner page, and invites grant access per room. A member with several rooms sees a live list of them at the root address; a member with one still goes straight in.

Spec: [Rooms and access](../spec.md#rooms-and-access), [Other pages](../spec.md#other-pages).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Rooms section: create a room, rename a room, see each room's address; the address is fixed at creation and survives a rename
- [ ] The invite form's room ticks grant access to exactly those rooms
- [ ] The owner has access to every room, including ones created later
- [ ] A room that does not exist and a room the visitor has no access to give the same "nothing here" page, for a stranger and for a member alike
- [ ] The root address shows a member with several rooms a list: each room's name and the display names of the members present (the count of live shares arrives with ticket 10)
- [ ] The list updates live and makes the member present nowhere
- [ ] The list carries a link to the "You" page, and the gear for the owner
- [ ] The bar header's link back to the list shows only to a member with more than one room
- [ ] A rename reaches present members live
- [ ] No deleting of rooms
- [ ] Seam 1 tests; a Seam 2 journey through the list
