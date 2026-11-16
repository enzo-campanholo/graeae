# 07: "You" page and own devices

**What to build:** A member clicks their own row in the bar and reaches the "You" page, where they change their display name, see their devices, forget any of them, and press "Add a device" to get a 10-minute invite to open on another browser.

Spec: [People, devices and invites](../spec.md#people-devices-and-invites), [Other pages](../spec.md#other-pages).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The "You" page is the same for every member and the owner
- [ ] Changing the display name reaches present members live
- [ ] The device list shows browser, operating system and last use for each device
- [ ] "Add a device" shows a single-use invite valid for 10 minutes; opening it on another browser shows the same one-button page and makes that browser a device of the same member
- [ ] No approval step on the old device, no limit on devices, no QR code
- [ ] A member forgets any of their own devices without the owner
- [ ] A forgotten device that has a room open has its connection closed and its page becomes the plain "nothing here" page, with no message
- [ ] An owner's device added this way carries full owner powers
- [ ] Seam 1 tests; a Seam 2 journey adding a second browser and forgetting it
