# 16: Viewer's audio controls

**What to build:** A viewer hears every watched share that has screen audio, mixed, and sets each one's volume, mutes it, or chooses "hear only this one".

Spec: [The room's screen](../spec.md#the-rooms-screen). User stories 35 to 40.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] Every watched share with audio plays at once; there is no automatic ducking
- [ ] Hover controls gain mute, volume and "hear only this one"
- [ ] "Hear only this one" mutes the other watched shares
- [ ] The volume a viewer sets for a member is remembered on that device and applied the next time they watch that member
- [ ] Mute is not remembered
- [ ] A share with no audio is labelled "video only" and has no audio controls
- [ ] Seam 2 journeys cover the controls and the remembered volume across a reload
