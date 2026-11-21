# Windows evidence run on MONSTRAO

Type: task
Status: ready-for-human
Blocked by: 01, 03, 04, 05, 11
Map: ../map.md

## Question

Not a decision: the Windows facts that the tab-share fix, the codec choice and the audio loop wait on, gathered by an agent on the owner's Windows desktop (MONSTRAO) driving Chrome and Helium itself on the real GPU against `graeae-test`. The owner pastes a prompt and lets it run.

Waits for the owner to say MONSTRAO is free; this server cannot reach it. Until then it stays `ready-for-human`.

When unblocked, a session here writes the prompt into this file under **Prompt for MONSTRAO**, from the answers of Why a shared tab falls back to software encoding, A better codec at 12 Mbps and What window audio picks up on Windows, and Readings in the logs. The prompt must let that agent, alone:

- pull `v1-build` from origin and run what it needs (`scripts/real-media/` or its own Playwright), with an invite to `graeae-test` the session here makes;
- the tab encoder: share a tab, a window and a screen and record the capture size and encoder named for each, before and after resizing, and with the candidate fix;
- the codec candidate: what the research asks it to measure;
- the audio: the two-profile loop in Helium, and the watch-party case (share a Helium window with sound while watching another member's share with sound in the same graeae tab), read from audio levels or tones, not by ear;
- the upload estimate: a WebRTC event log from the owner's Chrome during a game share, with and without fix A from [Why Chrome's upload estimate sits low](02-upload-estimate-sits-low.md), and what Measure the upload estimate from this server could not show;
- push its findings to a branch `evidence/windows-<date>` with a short Markdown report, which a session here reads and links from the answer.

The owner's part: open the agent on MONSTRAO, paste the prompt, approve what it asks, and say when it is done.
