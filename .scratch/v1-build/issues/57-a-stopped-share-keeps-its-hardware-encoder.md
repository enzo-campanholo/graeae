# 57: A stopped share keeps its hardware encoder

**Status:** needs-triage

**Blocked by:** none

**What was seen:** in ticket 55's rerun on MONSTRAO (2026-11-23, `evidence/windows-2026-11-23-2`, commit `353621b`, check 7), Win Chrome made 32 tab shares in turn from one page load of `graeae-test` at `b2a396c`, with no reload. Each share was stopped before the next started. Chrome 158, Windows 11, RTX 5070 Ti, NVIDIA 621.24. The sharer's readings are in `docs/evidence/windows-2026-11-23/repeat-NN-sender.jsonl` and `repeated-chrome-stats.jsonl`:
- shares 1 to 12 (mids 0 to 22) went out on `D3D12VideoEncodeAccelerator`, `hardware: true`;
- shares 13 to 32 (mids 24 to 62) went out on `OpenH264`, `hardware: false`, still negotiated as `H264 64001f`, at 1904x928 and 60 fps;
- from share 13 on, the connection's stats still listed 12 outbound video streams with `hardware: true`, one for each stopped share.

The watcher decoded every share at 60 fps, so nothing on screen showed it. It costs the sharer CPU at 1080p60, and the high profile's gain, since OpenH264 makes only baseline.

**Why, as far as is known:** `stop` in `src/app/lib/media/browser.ts` stops the tracks, calls `replaceTrack(null)` on each transceiver and sets it `inactive`. The transceivers stay on the connection, like a watcher's pulls in 56. Chrome seems to keep each one's encoder, and this GPU and driver gave 12 hardware H.264 sessions, then none. Webcams use the same encoder (55's check 6), so they count too. A GPU with fewer sessions would fall back sooner.

**Not yet known:**
- whether `transceiver.stop()`, or `setParameters` with the encoding's `active: false`, releases the encoder in Chrome;
- whether Cloudflare's media server accepts the offer that `transceiver.stop()` makes (a rejected media section, port 0).

**Checking it:** this server has no GPU, so only a hardware-encoding machine shows the fallback. A sharer's `stats` lines show the count of outbound video streams still reading `hardware: true`. A rerun of 55's check 7 on MONSTRAO would read whether share 13 stays in hardware.
