# 04: Invites and joining

**What to build:** The owner opens the owner page from the gear, types a display name and presses "Create and copy link". The invited person opens the link, presses "Join as <display name>" and lands in the room as a member on a remembered device.

Spec: [People, devices and invites](../spec.md#people-devices-and-invites), [Other pages](../spec.md#other-pages) (owner page, Invites).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The gear shows only to the owner and opens the owner page; a member requesting any owner route or action is refused
- [ ] Invites section: a form with display name and room ticks, and the button "Create and copy link"; the link is copied at the press and also shown with a copy-again button
- [ ] Pending invites are listed with rooms and expiry, each with copy and cancel; no ready-made message
- [ ] An owner's invite lasts 7 days and is single-use
- [ ] Opening an invite shows one button; only the press uses the invite up, remembers the device and makes the person a member with access to the invite's rooms
- [ ] Merely fetching the invite's address (as a link preview does) uses nothing up
- [ ] New members get access to the first room unless the invite says otherwise (only one room exists until ticket 08)
- [ ] Until the press, the person is visible to the owner alone, as a pending invite
- [ ] A used, expired or cancelled invite gives the "nothing here" page
- [ ] Seam 1 tests for every rule; a Seam 2 journey from creating an invite to the new member standing in the room
