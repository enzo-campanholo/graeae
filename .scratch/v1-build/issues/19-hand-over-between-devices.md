# 19: Hand-over between devices

**What to build:** A member with a screen share live on one device presses "Share screen" on another and is offered to stop it there and share from here. Viewers in the same room are carried over to the new share after a short gap. The same holds for the webcam.

Spec: [Shares](../spec.md#shares). User stories 57 to 59.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] One screen share and one webcam share per member across the whole instance, not per room and not per device
- [ ] Starting a kind that is already live offers to stop the live one and share from here
- [ ] The backend registers the new share first, marked as replacing the old, then closes the old one
- [ ] Each viewer in the same room is moved: the old pull closed, the new one created
- [ ] If the new share fails to register, the old one carries on untouched
- [ ] The first device shows "Now sharing from your other device"
- [ ] A hand-over into a different room ends the share in the first room and carries nobody
- [ ] Seam 1 tests for each case, including the failed hand-over; a Seam 2 journey
