# Whether a share sends H.264 high

Type: grilling
Status: resolved
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

## Answer

Decided with the owner on 2026-11-22. Build ticket: [A screen share sends H.264 high](../../v1-build/issues/54-a-screen-share-sends-h264-high.md) (v1-build 54, `ready-for-agent`, nothing for the owner beyond the final Windows check).

**The gain is the lower QP: adopted.** The bar was "a measurable gain with CABAC actually on", and both were met. On the game clip at the same 10.6 Mbps, high ran at QP 22.9 against baseline's 26.3, with CABAC and the 8x8 transform on. About 6 QP steps halve the bits, so 3.4 steps is a real gain in fidelity, in line with the research's 9 to 14%.
- Rejected: a PSNR from frames recorded at a watcher first, which would cost another MONSTRAO run to confirm what the encoder already shows.
- Rejected: the owner's eye on a real game first. That eye comes anyway, in the final Windows check, at no extra cost.
- The change is small and easy to reverse, and the `stats` lines show which profile each share sends.

**The rule.**
- It applies to a Chromium screen share on a one-quality plan only. The codecs are H.264 high (`64001f`) first, then baseline (`42001f`), then VP8.
- High is offered only when `RTCRtpSender.getCapabilities` lists a `6400` profile and `navigator.mediaCapabilities.encodingInfo` (`type: "webrtc"`) says `powerEfficient`. Otherwise the share falls back to baseline, as today. That covers a check that is missing, throws or says no.
- Webcam shares, Firefox and the two-quality plan keep today's list. The webcam was not measured, and nothing on it has failed. With two qualities the media server answers high with VP8, so [Two qualities as two tracks](../../v1-build/issues/29-two-qualities-as-two-tracks.md) is told that bringing them back has to retest high.

**The label risk: promised platforms only, and Linux Chromium is ruled out first.** The media server tells every watcher `42e01f` whatever the sharer sends. The run showed Chrome and Firefox on Windows decoding high under that label. Chromium decodes from the stream's own header, and today's baseline already plays under the same mislabel.
- Linux Chromium (Limited, "everything" for watching) is the one promised watcher left untested. A Linux sharer cannot make high, since OpenH264 encodes constrained baseline only.
- So the build ticket's first step is a throwaway rig in `scripts/real-media/`: a sender transform swaps in frames from an x264 high clip, sent through the real media server on `graeae-test`.
- Linux Chromium watches it, and blocks the ticket: if it fails, the ticket stops and comes back to this map. Linux Firefox watches it too, recorded only, since it is best effort.
- Best-effort platforms (macOS, phones, Firefox off Windows) stay never blocked and never tested.
- Rejected: a Windows sharer against a Linux watcher in the final Windows check. It needs no rig, but a failure would surface just before 0.1.

**Decode load.** The rig records a Linux watcher's frames per second and dropped frames on this server, which has no GPU, for one high share and one baseline share. The reading goes into the spec's Unverified facts, not into a rule, since Linux is Limited.

**The final Windows check gains two lines.**
- In Chrome and Helium, a fresh game-window share goes out as `64001f` in hardware, read from its `stats` line.
- The owner looks at a real game and says the picture is no worse.

No ADR (small and easy to reverse) and no glossary change.
