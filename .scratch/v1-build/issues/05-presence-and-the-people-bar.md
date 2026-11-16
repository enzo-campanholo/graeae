# 05: Presence and the people bar

**What to build:** Two members open the same room and see each other in the bar: present members first, then, dimmed, the members who have access but are not present. The bar updates live as people arrive, leave and change their display names.

Spec: [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection), [The room's screen](../spec.md#the-rooms-screen).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Each open tab holds one WebSocket to the instance and says which room it is showing; the instance uses hibernating connections
- [ ] The socket is refused for an unremembered device and for a room the member has no access to
- [ ] Socket message types are shared between front end and backend by plain imports
- [ ] A tab gets the full room state on connecting, then changes as they happen
- [ ] A member is present while at least one of their devices has the room open, and is listed once however many devices that is
- [ ] Two tabs on two rooms make a member present in both
- [ ] A clean leave (tab closed, reload, navigating away) ends that tab's presence at once
- [ ] The bar lists present members first, then absent members with access, dimmed; the owner appears like anyone else
- [ ] The collapsed rail shows initials
- [ ] A member's own row is marked as theirs (it leads to the "You" page in ticket 07)
- [ ] Seam 1 tests drive several sockets; a Seam 2 journey with two browsers
- [ ] The shared socket message types are laid out by area (presence, people, shares, usage), so tickets built in parallel rarely edit the same definitions
