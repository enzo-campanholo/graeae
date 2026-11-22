# Whether a share sends H.264 high

Type: grilling
Status: open
Blocked by: none
Map: ../map.md

## Question

Does graeae offer H.264 high first, as [A better codec at 12 Mbps](03-better-codec-at-12-mbps.md) recommends (high when `getCapabilities` lists `6400` and `encodingInfo` says `powerEfficient`, otherwise baseline as today, VP8 last), now that [Windows evidence run on MONSTRAO](09-windows-evidence-run.md) has measured it? That answer set the bar: adopt only on a measurable gain with CABAC actually on.

What the run found (its answer, section 3):
- High was answered and encoded in hardware on the RTX 5070 Ti, with CABAC and the 8x8 transform on.
- On the game clip, both sent 10.6 Mbps; QP per frame was 22.9 with high against 26.3 with baseline, encode time the same. On the scroll the two spent different bitrates, so they do not compare. No VMAF or PSNR, and the watcher's screenshots look alike on synthetic content.
- Chrome and Firefox on Windows decoded every frame at 60 fps, both in hardware.
- The media server labels every watcher's stream `42e01f` (constrained baseline) whatever the sharer sends. Windows watchers decoded high under that label; a decoder elsewhere that takes the label at its word (Firefox on Linux or macOS, phones: never tested, never blocked) was not tried.

Settle whether a lower QP at the same bitrate is the gain the bar asked for, or whether it needs a measure of what a watcher sees first, and how cheaply that could be had (the owner's own eye on a real game, or a PSNR from frames recorded at a watcher). Settle whether the label risk matters for the platforms promised, or what would rule it out. If adopted, write the build ticket: the codec list, the stale "Firefox cannot decode main or high" note in `src/shared/encoding.ts`, what the agent checks on `graeae-test` (a Linux sharer has no high in hardware, so it can only check the fallback), and what joins the final Windows check.
