# Measure the upload estimate from this server

Type: task
Status: open
Blocked by: none
Map: ../map.md

## Question

Not a decision: the facts that the fix for Chrome's low upload estimate waits on, measured by an agent alone on `graeae-test` with `scripts/real-media/`, changing nothing in graeae's code. [Why Chrome's upload estimate sits low](02-upload-estimate-sits-low.md) has the causes and the candidate fixes; its doc on `research/upload-estimate` has the steps in full.

1. Read the media server's answer (`remoteDescription.sdp`): `b=AS` or `x-google-max-bitrate` (expected: neither, so probes stop at 5 Mbps), `transport-cc` and its header extension, `goog-remb`.
2. Sample `availableOutgoingBitrate`, `targetBitrate`, bytes sent and round trip every 200 to 500 ms through the harness's `eval`, during `content game` and `content document`, and check the research's predictions: no probe past 5 Mbps, about 1.5× what is sent while calm, falls to about 0.85× of what was sent, then about 45 kbps a second of growth.
3. Record a WebRTC event log (`--chromium-arg=--webrtc-event-logging=<dir>`) and, if building WebRTC's `rtc_event_log_visualizer` is reasonable, say what each fall came from: delay, loss or a report from the media server.
4. Fix A without touching graeae: rewrite the received answer in the harness's init script (`scripts/real-media/page.js`) to carry `x-google-max-bitrate=20000` on the video codec, and time how long the estimate takes to reach 12 Mbps after a fall, with a second member watching to see whether probe padding reaches them (freezes, frames decoded against received). Then the same with regular probing forced (`--force-fieldtrials=WebRTC-StrictPacingAndProbing/1.0,2875,80,40,-60,3/`), and with `contentHint` "detail".
5. Optional, if cheap: a loopback page (two connections on one page, no media server), to separate Chrome's behaviour from the media server's.

A datacentre line with software encoding will likely show the cap and the slow growth but few false falls; say what this run could not show, for the Windows evidence run. Answer with the readings, a chart or table per run, and the event log or readings saved under `.logs/` (gitignored), named in the answer.
