# 29: Two qualities as two tracks

**What to build:** A Chromium screen share goes out again at 1080p60 and at 720p60, so a viewer on a weak link can drop to 720p alone, and each viewer gets back the "Auto", "1080p" and "720p" choice and the "720p" mark. This time the two qualities are two tracks of one quality each, not simulcast.

**Why:** ticket 17 built two qualities as simulcast and switched them off after the owner's check on Cloudflare (`TWO_QUALITIES` in `src/shared/encoding.ts`; see ticket 17's comments). Both encodes stayed on the hardware encoder, but a viewer on the 720p quality of an H.264 share froze for about half the time, in Chromium and Firefox alike. The webrtc-internals dumps showed the sharer sending 720p steadily while the viewer received packets but no frames, with nothing lost, until a fresh key frame came. Small packets in bursts suggest the media server's padding while it probes for bandwidth to move the viewer up; H.264 receivers lose frames to it and VP8 ones do not. It happened at Auto and at a fixed 720p, with and without `ridNotAvailable`. 1080p, the top quality, never froze: the media server has nothing above it to probe for. A track of one quality has nothing above it either.

Spec: [Encoding and quality](../spec.md#encoding-and-quality). User stories 41 to 43.

UI: the choice and the mark are built (ticket 17) and stay, tested, behind the switch.

**Blocked by:** 17

**Status:** needs-triage

- [ ] A Chromium screen share publishes two tracks, 1080p60 at 12 Mbps and 720p60 at 4 Mbps, each H.264 baseline on the hardware encoder; a viewer pulls one
- [ ] A viewer's choice of "1080p" or "720p" moves their pull to the other track mid-watch, with the shortest freeze the media server allows
- [ ] "Auto" is graeae's: the viewer's page reads its own statistics and asks for 720p while its link cannot carry 1080p, and for 1080p again once it can; the rule is pure and tested
- [ ] A sharer's weak upload stops the 1080p track first, and every viewer on it moves to 720p
- [ ] The usage count counts each viewer at the track they pull
- [ ] Proven on Cloudflare by the owner: no freezes on either track over a few minutes, read from a webrtc-internals dump

## Comments

**Open questions for triage.**

- Whether per-viewer quality is worth a second track at all. With one quality, a viewer on a weak link pulls the share down for nobody but freezes themselves; the media server cannot step them down.
- Whether the media server pads a track of one quality too. Ticket 17 saw no freezes on the 1080p quality of a simulcast share, which suggests not, but nobody has tried two separate tracks.
- How long a move from one track to the other freezes the picture, against simulcast's switch.
- The ticket 17 switch: whether the instance keeps the simulcast path (`setQuality` with a preferred rid) for anything, or this ticket replaces it.
