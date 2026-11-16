# 18: Sharer's notes and weak upload

**What to build:** A sharer is told, on their own share and nowhere else, when something measurable is off: capture stuck near 48 fps, software encoding, or an upload that cannot carry 1080p. On a weak upload the share gives up resolution before frame rate and is never ended.

Spec: [Encoding and quality](../spec.md#encoding-and-quality), [The room's screen](../spec.md#the-rooms-screen). User stories 61 to 64.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 17

**Status:** ready-for-agent

- [ ] A capture that settles near 48 fps shows a dismissible note: "Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60"
- [ ] That note is driven by the measured rate, so it stops appearing when the browser captures 60
- [ ] A software-encoded share shows a quiet note saying so
- [ ] The media client watches the share's statistics and steps down itself: the 1080p quality stops first, so every viewer gets 720p60; if that does not fit, frame rate drops to 30
- [ ] Bitrate, frame rate and scale are changed on the live share without renegotiating
- [ ] The share steps back up when the upload recovers. The spec gives no thresholds for stepping down or up; choose them, and keep them as named constants in one place
- [ ] A dismissible note tells the sharer when their upload cannot carry 1080p
- [ ] graeae never ends a share for quality reasons
- [ ] Notes are shown only to the sharer, never before sharing, and never block anything
- [ ] The step-down decision is a pure rule tested with fed statistics through the fake media client; Seam 2 covers each note
