# 59: A screen share in H.264 high, watched in a reused section that lists only baseline

**Status:** ready-for-human

**Blocked by:** none

**What is suspected:** ticket 58 found that the media server sends a watch on a payload type the tab offered for its codec, in any section, even one the watch's own section never listed. Chrome then counts the packets and drops them all, so the watch shows nothing. A reused section lists only what the tab last gave it. After the tab has watched a webcam, or made its own webcam share, that is baseline H.264 alone (102, and 103 for retransmissions).

When such a tab next watches a screen share sent in H.264 high (ticket 54, on a hardware encoder), the media server may put it in that section. It would then go out on a high payload type the section lacks, and decode nothing. This was so before 58's fix, and is likely still so: the fix keeps each section's own codecs, and adds none. `docs/media-server.md` lists it as unchecked. The loopback's stand-in cannot play it, because the stand-in sends baseline only.

**Checking it:** on `graeae-test`, two members.
1. Member W watches a webcam share and stops watching, so W has a closed baseline section.
2. On MONSTRAO, member S shares a screen whose sender's stats read `H264 64001f` on `D3D12VideoEncodeAccelerator` (as in ticket 55).
3. W watches it. Note which mid the watch's `pull` went in, and whether `inbound-rtp` decodes frames there (`pnpm real-media`'s `eval`). If it does not, Chrome's RTC event log (`--webrtc-event-logging=<dir>`) gives the payload type the packets carry, as in ticket 58.

**If it drops:** a section that receives could offer, besides what it negotiated, the screen-share codecs the encoding plan sends (H.264 high and baseline), at the payload types the tab uses for them elsewhere. That keeps the payload types stable and gives the media server a high one in every section. It is a change to `receiving.ts`, checked against `docs/media-server.md`.
