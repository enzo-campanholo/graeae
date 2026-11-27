# Measure the upload estimate from this server

Type: task
Status: resolved
Blocked by: none
Map: ../map.md

## Question

Not a decision: the facts that the fix for Chrome's low upload estimate waits on, measured by an agent alone on `graeae-test` with `scripts/real-media/`, changing nothing in graeae's code. [Why Chrome's upload estimate sits low](02-upload-estimate-sits-low.md) has the causes and the candidate fixes; its doc, `docs/research/upload-estimate.md`, has the steps in full.

1. Read the media server's answer (`remoteDescription.sdp`): `b=AS` or `x-google-max-bitrate` (expected: neither, so probes stop at 5 Mbps), `transport-cc` and its header extension, `goog-remb`.
2. Sample `availableOutgoingBitrate`, `targetBitrate`, bytes sent and round trip every 200 to 500 ms through the harness's `eval`, during `content game` and `content document`, and check the research's predictions: no probe past 5 Mbps, about 1.5× what is sent while calm, falls to about 0.85× of what was sent, then about 45 kbps a second of growth.
3. Record a WebRTC event log (`--chromium-arg=--webrtc-event-logging=<dir>`) and, if building WebRTC's `rtc_event_log_visualizer` is reasonable, say what each fall came from: delay, loss or a report from the media server.
4. Fix A without touching graeae: rewrite the received answer in the harness's init script (`scripts/real-media/page.js`) to carry `x-google-max-bitrate=20000` on the video codec, and time how long the estimate takes to reach 12 Mbps after a fall, with a second member watching to see whether probe padding reaches them (freezes, frames decoded against received). Then the same with regular probing forced (`--force-fieldtrials=WebRTC-StrictPacingAndProbing/1.0,2875,80,40,-60,3/`), and with `contentHint` "detail".
5. Optional, if cheap: a loopback page (two connections on one page, no media server), to separate Chrome's behaviour from the media server's.

A datacentre line with software encoding will likely show the cap and the slow growth but few false falls; say what this run could not show, for the Windows evidence run. Answer with the readings, a chart or table per run, and the event log or readings saved under `.logs/` (gitignored), named in the answer.

## Answer

**Done, 2026-11-22**, by an agent alone, on `graeae-test` as it was (build `74cb885`; graeae's code untouched). Two throwaway members joined "First room": Probe S shared a 1600x900 window of `content.html` (game or document) and Probe W watched it. Both were headed Chromium 157 on one Xvfb display, OpenH264 in software, with a round trip of about 2 ms. Both pages were read every 250 ms. To force a fall, Probe S ran in a network namespace of its own (pasta), whose upload was held to 6 Mbit for 10 s with `tc netem`, twice a run. A first try with slirp4netns was dropped: see below.

**The headline: on this server the estimate is not what holds a share down. The share's size is.** In 13 of 16 shares started with graeae's settings, Chrome sent the first frames at 480x270 (the 1600x900 window scaled by 10/3) and never grew them again. That held for up to 7 minutes, through two forced falls, and with an estimate of 20 Mbps under fix A. The capture itself was 480x270, not just the frames sent; graeae calls no `applyConstraints`, so this is Chrome's own adaptation under `maintain-framerate`. OpenH264 makes only about 5.8 Mbps at that size, against a target of 9 to 12, so Chrome says `limitedBy` "bandwidth" throughout, and the estimate settles at about 1.6× what is sent: 9.5 to 10 Mbps. The other 3 opened at 640 wide and stepped through 800 and 960 to 1600 within 14 s. This matches the owner's Windows readings in [v1-build ticket 18](../../v1-build/issues/18-sharers-notes-and-weak-upload.md): spells of "bandwidth", mostly at 854x480 on OpenH264, sending about 85% of the estimate below its own target, with nothing lost. So the owner's low estimate may follow from a shrunken, software-encoded picture rather than cause it.

**Two one-line changes each removed it, 8 starts of 8** (fresh starts, each on a new media connection, a reload between):

| Setting | First frames | At 10 s | At 25 s |
|---|---|---|---|
| As today | 480 wide, 8 of 8 | 480 wide, 5.6 to 6.0 Mbps | 480 wide, 5.6 to 6.1 Mbps, "bandwidth", estimate 9.5 to 10.0 |
| `x-google-start-bitrate=6000` in the received answer (fix C) | 1600 wide, 8 of 8 | 10.2 to 11.4 Mbps | 12.0 Mbps, "none", estimate 19.7 to 19.9 |
| `degradationPreference` "maintain-resolution" | 1600 wide, 8 of 8 | 7.4 to 9.6 Mbps | 12.0 Mbps, "none", estimate 19.6 to 19.8 |

Both held 60 fps; "maintain-resolution" dipped to about 40 fps in the first 2 s only. Which to adopt, and what each costs on a real weak upload, is not this ticket's to decide.

**1. The media server's answer.** No `b=AS` and no `x-google-max-bitrate`. The video codec is H.264 `42001f` (payload 102, RTX 103), with `transport-cc`, `goog-remb`, `nack`, `nack pli` and `ccm fir`, and the transport-wide sequence number extension (id 4). As predicted.

**2. The research's predictions, against the readings.** The runs that got past 480 wide were the baseline without and with the namespace (`base`, `ns-base2`):

| Phase | Estimate | Sent | Estimate ÷ sent | Round trip | `limitedBy` "bandwidth" |
|---|---|---|---|---|---|
| Game, first 60 to 90 s | 19.9 to 20.0 | 12.2 | 1.6 | 2 ms | 16 to 24% (the first 14 s) |
| Document, 30 to 60 s | 19.9 to 20.2, held | 0.01 | — | 2 ms | 0% |
| Game again | 23.0 to 23.4 | 12.2 | 1.9 | 2 ms | 0% |
| Upload held to 6 Mbit, 10 s | 4.9 to 5.1 | 4.6 to 4.8 | 1.05 | 5 to 16 ms | 0% |
| After each fall, 150 s | 19.9 to 20.0 | 12.2 | 1.6 | 2 ms | 0% |
| All 8 cores loaded, 60 s (`base` only) | 23.6, held | 8.7 (30 fps) | — | 4 ms | 0% |

- **"No probe past 5 Mbps" does not hold the estimate down.** With no maximum in the answer, it passed 12 Mbps 12 to 13 s after each start and reached 20 within 20 s. The encoder filling its 12 Mbps target is enough to grow it.
- **"About 1.5× what is sent while calm": not seen.** During 30 to 60 s of a still document (0.01 Mbps sent), the estimate held where it was. The 1.5× ceiling showed only while the encoder could not fill its target: the stuck shares, at about 1.6×.
- **No fall came by itself.** Not in 30 minutes of shares here, not with every core loaded, and not with the picture changing from still to motion. Any false falls on the owner's line could not be reproduced here.
- **A forced fall, then growth.** Holding the upload to 6 Mbit cut the estimate within a second, to 4.7 to 5.0 Mbps: about 0.85× what was getting through. It then grew about 50 kbps a second for about 20 s, as predicted. Then the encoder, aiming at 12, sent past the estimate, and growth turned fast. **Back to 12 Mbps 27 to 28 s after each fall**, not the 140 s worked out in the research.

**3. The event log.** Recorded for every run, in the `eventlog-*` folders below. WebRTC's `rtc_event_log_visualizer` was not built: it needs a full WebRTC checkout and build. The only falls here were forced, so their cause is known.

**4. Fix A, regular probing and "detail".** These ran in the namespace, and all four shares opened at 480 wide and stuck there, so they show the estimate, not the picture:

| Run | Estimate by 2 s after start | Sent | Back to 12 Mbps after a fall | Watcher |
|---|---|---|---|---|
| Fix A (`x-google-max-bitrate=20000`) | 20 | 6.3 | never: the estimate settled at 10.7, 1.7× sent | 0 freezes, all frames decoded |
| Fix A and `WebRTC-StrictPacingAndProbing` forced | 19.5 | 6.4 | 16 to 17 s, back to 20 | 0 freezes, all frames decoded |
| Fix A and `contentHint` "detail" | 20 | 1.8 | 3 s, back to 20 | 0 freezes, all frames decoded |
| "detail" alone | 6.2 | 1.7 | never above 6.4 | 0 freezes, all frames decoded |

- **Fix A** lets probes take the estimate to 20 Mbps within 2 s of a start, and with periodic probing back to 20 within 17 s of a fall. But that alone never lifted a share from 480 wide. And after a fall without periodic probing, the estimate stayed at 1.7× what was sent.
- **Probe padding at the watcher: none seen.** The bytes the watcher received beyond its media stayed at about 1.4% in every run, fix A or not. Its frames decoded equalled frames received and nothing froze. A freeze of about 0.33 s at the switch to the still document came in every run, with or without a fix. At the sharer, padding never passed 0.4 Mbps in any second. The probes are probably retransmissions, which count as media, so they cannot be told apart per second here.
- **"detail"** sent less than a third of "motion" at the same 480x270 (1.7 against 5.8 Mbps). Without fix A, the estimate stayed under 6.4. It is worse on both counts here.

**5. Loopback: not done.** Through the media server the estimate reached 20 Mbps in every share that was not stuck small, and nothing pointed at the media server, so there was nothing of its to separate.

**What this run could not show, for the Windows evidence run.**
- Whether a share started on Windows opens small: a first frame under 360 lines, which Chrome sends on OpenH264 on purpose. And whether it stays small, which would be the 854x480 spells. Then the same with `x-google-start-bitrate=6000`, and with "maintain-resolution": the first frame's size and encoder, and the size, encoder and bitrate after 10 and 25 s, over 8 fresh starts each (a reload between, since only a new media connection opens small).
- The owner's own falls: whether any come with no size change, and what the event log says they came from. That needs a WebRTC event log of a game share from the owner's Chrome, as the run already plans.
- Fix A on the owner's line and with hardware encoding, and any padding reaching a Windows watcher.

**The slirp4netns try.** Under slirp4netns, the namespace baseline sat at 480x270 and 6 Mbps for 7 minutes. That first looked like slirp4netns's fault, but the plain line then showed the same in 8 of 8 starts, so it was the same stuck start, not the network. Pasta was used from then on.

**Files**, in `.logs/upload-estimate/` (gitignored):
- `<run>-s.jsonl` and `<run>-w.jsonl`: the 250 ms readings of sharer and watcher, one JSON a line.
- `<run>-seconds.csv`: the sharer per second.
- `<run>-s.out` and `<run>-w.out`: `member.ts`'s own lines, with the invite addresses redacted.
- `phases.txt`: when each phase began.
- `eventlog-<run>/`: Chrome's WebRTC event log.
- `start-<setting>-<n>.jsonl`: the 24 fresh starts.
- `scripts/`: the run and analysis scripts.

The runs are `base` (no namespace, no fix), `ns-base` (slirp4netns), `ns-base2`, `ns-a`, `ns-a-strict`, `ns-a-detail` and `ns-detail` (pasta).

**Done along the way.**
- `scripts/real-media/page.js` gained a sampler (`sample <ms>` and `unsample <file>` in `member.ts`). It reads the pair's estimate, round trip and bytes, and each stream's bytes, target, size, frames, freezes and limit.
- `scripts/real-media/fixes.js` is new. It tries fixes without touching graeae, through `member.ts` options: `--max-bitrate` and `--start-bitrate` (added to each video codec of the received answer), `--content-hint` and `--degradation`.
- `member.ts` also gained `navigate <kind>`, which changes the content window's kind and keeps its title, so a capture of it goes on.
- On `graeae-test`, an owner device was made with `/setup` through `curl`, which again forgot the owner's other devices there; the owner gets back in with `/setup#<secret>`. Probe S and Probe W were removed in People, and their browser profiles deleted. The other members and the pending invite were not touched.

## Comments

**2026-11-21, from [Readings in the logs](05-readings-in-the-logs.md).** Each tab's `stats` line on `graeae-test` (build `74cb885`) now carries `estimate` (`availableOutgoingBitrate`), `targetBitrate`, `limitedBy`, `encoder` and `capture`, every 15 seconds. So a run here can read its seconds from the pulled logs as well as from `member.ts`'s own lines. In that ticket's two short runs, the estimate held at 5.5 to 6.1 Mbps, with nothing lost and a 2 ms round trip.
