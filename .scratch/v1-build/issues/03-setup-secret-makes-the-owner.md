# 03: Setup secret makes the owner

**What to build:** The deployer opens `/setup#<secret>` and that browser becomes the owner's first device, with the first room created; the owner lands in that room's empty shell. From then on the browser is a remembered device and needs no login. Using the setup secret again later makes a browser an owner device and forgets all the owner's other devices.

Spec: [The setup secret](../spec.md#the-setup-secret), [People, devices and invites](../spec.md#people-devices-and-invites), [Seam 2](../spec.md#seam-2-the-app-in-a-browser).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] The setup page sends the part after `#` to the backend itself; it is never in a request address
- [ ] First use creates the owner, their first device and the first room, and lands the owner in that room
- [ ] A later use makes this browser an owner device and forgets every other owner device
- [ ] A wrong secret gives the "nothing here" page, indistinguishable from any other refused address
- [ ] A setup secret that is missing or shorter than 32 characters refuses setup entirely
- [ ] A setup page shown to someone holding the setup secret names any other missing secret
- [ ] A device is remembered by a cookie for 400 days from its last visit, renewed on every visit, and forgotten after that
- [ ] The instance records each device's browser, operating system and last use
- [ ] The root address takes a remembered device with one room straight into it; an unremembered browser gets "nothing here"
- [ ] Seam 1 tests cover all of the above
- [ ] Seam 2 harness: a real Chromium against the app running locally; setup-to-room is its first journey
