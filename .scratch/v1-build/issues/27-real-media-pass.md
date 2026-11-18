# 27: Real media pass

**What to build:** Nothing. The owner deploys the integration branch and checks, on real machines, the media behaviour that no automated test can see. Tickets 15 to 25 were built against fakes; ticket 13 proved only a webcam.

Shorten the relay credential constants from ticket 25 for this deploy, so the renewal can be watched in minutes.

**Blocked by:** 17, 18, 19, 21, 22, 25

**Status:** ready-for-human

Windows 11, a supported Chromium browser, a game running, monitor at 120 Hz:

- [ ] Share the game's window: a viewer gets 1080p at about 60 fps and hears only the game
- [ ] The sharer's statistics name a hardware H.264 encoder
- [ ] Share a tab playing sound: the viewer hears it; share the whole screen: the sharer sees the "video only" line
- [ ] With graeae itself in the shared window, viewers do not hear their own shares back
- [ ] The audio on and off control silences and restores the sound for the viewer
- [ ] The browser's own "stop sharing" bar ends the share for the viewer
- [ ] A viewer sets "720p" and the mark appears; "Auto" returns to 1080p
- [ ] At 144 Hz the 48 fps note appears; at 120 Hz it does not
- [ ] With the sharer's upload throttled, the share is not ended (the step-down and its note are switched off by ticket 18; ticket 30)
- [ ] Share a desktop or a document: text is sharp enough with the "motion" content hint (ticket 18's open judgement)
- [ ] Hand a screen share over to a second device: the viewer is carried over after a short gap
- [ ] Remove a member who is sharing and watching: both stop within about 2 seconds
- [ ] Deploy while a share is being watched: at most a "reconnecting" flicker
- [x] A tab on the relay passes the shortened renewal without losing its picture; so does a tab on a direct path (checked by an agent on headless Chromium, ticket 25)

Windows 11, Firefox:

- [ ] Watch a Chromium screen share: picture and screen audio, as on Chromium
- [ ] Share a screen: the first-time notice gives the Firefox line, the share is video only, and a Chromium viewer sees it
- [ ] Share a webcam

Cloudflare's billing:

- [ ] Relayed watching billed once: in Cloudflare's Billable Usage for 2026-11-17, see whether ticket 23's relayed session (23:25–23:49 UTC) was billed at the relay's figure (about 1.39 GB) or the media server's (about 1.59 GB). If it was billed at the relay's figure, set `RELAYED_COUNTS_TWICE` in `src/instance/usage.ts` to `false`, as the spec's usage comparison says; if at the media server's, it stays `true` (see ticket 23's last comment)

Anything that fails is fixed on the integration branch before this ticket is resolved.
