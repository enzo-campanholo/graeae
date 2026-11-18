# 27: Real media pass

**What to build:** Nothing. The owner deploys the integration branch and checks, on real machines, the media behaviour that no automated test can see. Tickets 15 to 25 were built against fakes; ticket 13 proved only a webcam.

~~Shorten the relay credential constants from ticket 25 for this deploy, so the renewal can be watched in minutes.~~ Done in ticket 25's check; `graeae-test` is back on the 12 and 11 hours.

**Blocked by:** 17, 18, 19, 21, 22, 25

**Status:** ready-for-human

Most boxes were already met by the owner's checks on tickets 15, 17 and 18, or by an agent on `graeae-test` (see the comments). What is left for the owner is under "The owner's last sitting" in the comments.

Windows 11, a supported Chromium browser, a game running, monitor at 120 Hz:

- [x] Share the game's window: a viewer gets 1080p at about 60 fps and hears only the game (tickets 17 and 15)
- [x] The sharer's statistics name a hardware H.264 encoder (ticket 17)
- [x] Share a tab playing sound: the viewer hears it (ticket 15)
- [ ] Share the whole screen: the sharer sees the "video only" line
- [x] With graeae itself in the shared window, viewers do not hear their own shares back (ticket 15)
- [x] The audio on and off control silences and restores the sound for the viewer (an agent, below)
- [x] The browser's own "stop sharing" bar ends the share for the viewer (ticket 15)
- ~~A viewer sets "720p" and the mark appears; "Auto" returns to 1080p~~ Switched off by ticket 17; ticket 29
- [x] At 144 Hz the 48 fps note appears; at 120 Hz it does not (ticket 18)
- [x] With the sharer's upload throttled, the share is not ended (ticket 18's capped run, and an agent, below)
- [ ] Share a desktop or a document: text is sharp enough with the "motion" content hint (ticket 18's open judgement)
- [x] Hand a screen share over to a second device: the viewer is carried over after a short gap (an agent, below)
- [x] Remove a member who is sharing and watching: both stop within about 2 seconds (an agent, below)
- [x] Deploy while a share is being watched: at most a "reconnecting" flicker (an agent, below)
- [x] A tab on the relay passes the shortened renewal without losing its picture; so does a tab on a direct path (checked by an agent on headless Chromium, ticket 25)

Windows 11, Firefox:

- [x] Watch a Chromium screen share: the picture (ticket 17)
- [ ] Watch a Chromium screen share: the screen audio
- [x] Share a screen: a Chromium viewer sees it (ticket 17, in VP9)
- [ ] Share a screen: the first-time notice gives the Firefox line, and the share is video only
- [ ] Share a webcam

Cloudflare's billing:

- [ ] Relayed watching billed once: in Cloudflare's Billable Usage for 2026-11-17, see whether ticket 23's relayed session (23:25–23:49 UTC) was billed at the relay's figure (about 1.39 GB) or the media server's (about 1.59 GB). If it was billed at the relay's figure, set `RELAYED_COUNTS_TWICE` in `src/instance/usage.ts` to `false`, as the spec's usage comparison says; if at the media server's, it stays `true` (see ticket 23's last comment)

Anything that fails is fixed on the integration branch before this ticket is resolved.

## Comments

**2026-11-18: what earlier tickets already settle, and an agent's pass on `graeae-test`.** The owner asked for their part to be as small as possible.

*Ticked from earlier tickets' owner checks* (Chrome on Windows 11, `graeae-test`):
- **The game's window at 1080p60, its sound alone:** ticket 17's shipped-build check (CS2 at 120 Hz, one encoding at 1920x1080 and 60 fps, no packet lost) and ticket 15's picker check (a game's window sent only that game's sound).
- **A hardware encoder:** ticket 17 (`NVIDIA H.264 Encoder MFT`, H.264 `42001f`, `powerEfficientEncoder: true`).
- **A tab's sound reaches the viewer**, **graeae's own sound left out**, **the browser's "stop sharing" bar:** ticket 15, boxes 5, 6 and 11.
- **The 48 fps note at 144 Hz and gone at 120 Hz:** ticket 18, "Needs the owner" step 2.
- **A throttled upload does not end the share:** ticket 18's capped run (10 Mbps on `chrome.exe`, a 10-minute match), and the agent's run below on the build with the step-down switched off.
- **Firefox watching a Chromium share, and a Chromium viewer of a Firefox screen share:** ticket 17 (the baseline share decodes in Firefox; a Firefox screen share starts and plays in VP9). The screen audio in Firefox, the Firefox notice and "video only" were not looked at, so those halves stay open as boxes of their own.
- **"720p" and "Auto":** struck. Two qualities are switched off (ticket 17), and ticket 29 holds them.

*Checked on Cloudflare by an agent* with ticket 22's and 25's harness: headless Chromium 157 on Linux with Chromium's synthetic camera, microphone and screen, each browser in a network namespace of its own. The members were `bot` (and a second device of `bot`, made through its own "Add a device"), `bot viewer`, a throwaway `bot removed` invited for the removal, and an owner device the owner added for the run. Media went direct (`srflx`), at the synthetic source's 20 fps.
- **The audio switch.** `bot` shared a screen with sound and `bot viewer` watched. The viewer's `totalAudioEnergy` rose 0.25 a second. With "Turn your screen audio off" it rose 0, with audio packets still arriving at 50 a second, so the share went on in silence. With it back on, it rose 0.27 a second.
- **An upload cap** (`tc tbf` on the sharer's namespace, step-down off). At 2 Mbit/s nothing changed: the synthetic screen needs less. At 300 kbit/s for 90 s, the viewer stalled 5 times in the first 4 s (0.3 to 1.8 s each). Then Chrome scaled the share to 1280x720 (`qualityLimitationReason` "bandwidth") and the viewer decoded 20 fps throughout. No `media.faltering` was sent and the share stayed live. With the cap lifted it went back to 1920x1080 within 30 s.
- **A hand-over** (three runs). `bot viewer` watched `bot`'s screen and webcam. `bot`'s second device pressed "Share screen", then "Share from here", then the notice, then the picker. The viewer got `moved` and answered it. The gap from the old screen's last frame to the new one's first was 1.55, 1.64 and 1.56 s, about 3.2 s from the press. The webcam's picture never stalled through it (ticket 19's question about a second share). The first device showed "Now sharing from your other device."
- **A removal.** `bot removed` shared a webcam watched by `bot viewer`, and watched `bot`'s screen. The owner device sent `DELETE /api/owner/people/<id>`. Counting from the press:
  - the owner's answer at 210 ms;
  - the webcam gone from the viewer's page at 267 ms, and its last frame decoded at 389 ms;
  - the removed member's last frame of the screen at 1.0 s;
  - the sharer's caption reading "No one watching" at 1.2 s;
  - the removed member's page reading "Nothing here" at 1.5 s, its socket closed at 1.6 s.

  The People list then had no `bot removed` and nothing unconfirmed.
- **A deploy while watching.** Since Cloudflare's [deferred code updates](https://developers.cloudflare.com/changelog/post/2026-10-30-durable-objects-deferred-code-updates/) (2026-10-30), a deploy does not touch a busy Durable Object at once. It waits up to 300 s for the object to hibernate, and graeae's heartbeats keep a room's object awake, so the new code is forced in at about 5 minutes. Three deploys watched for 60 s showed no socket closing at all. Watched for 7 minutes (`pnpm run deploy --name graeae-test`, version `e3c0feda`), every socket closed together 5 minutes after the deploy. They reopened 0.85 s later, each taking its tab back (`connected: true`), on the same media connections. The viewer's two pictures never stalled 300 ms, and "Reconnecting…" (which waits 3 s) never showed. So the flicker is less than the spec allows. The README's Updating section now says a release can take 5 minutes to reach open pages.
- **Left behind:** `graeae-test` runs `e3c0feda`, `v1-build`'s code with no extra variable (one probe deploy added `DEPLOY_PROBE` and the next removed it). `bot`'s second device, `bot removed` and the owner's harness device are gone; `bot` and `bot viewer` stay for later runs.

**The owner's last sitting** (about 5 minutes; Chrome and Firefox on Windows 11, both already devices of the owner, in the same room on `graeae-test`):
1. *Chrome:* "Share screen", pick a **tab playing music**. *Firefox:* click your name to watch it. Do you hear the music? (Firefox: screen audio)
2. *Chrome:* stop, "Share screen" again, pick the **entire screen** with a document or a desktop full of text in front. Chrome's own preview should read "Video only. No one hears this share." In Firefox's picture, is the text sharp enough? (whole screen video only; the "motion" content hint)
3. *Firefox:* "Share screen". The notice should read "In Firefox a screen share is video only…". It shows once per browser, so if it does not come (ticket 17 may have used it up), delete `graeae:screen-notice` under DevTools, Storage, Local Storage, and press again. Go on, pick a window, and check Firefox's preview reads "Video only…". *Chrome:* it plays. Stop it. (Firefox: notice and video only)
4. *Firefox:* in `about:config`, set `media.navigator.streams.fake` to `true` (it stands in for a webcam), then "Share webcam". *Chrome:* it plays (H.264 baseline, encoded in software by Firefox). Set the preference back. (Firefox: webcam)
5. *Cloudflare dashboard:* the billing box above (one figure to read).
