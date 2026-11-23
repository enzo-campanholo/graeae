# 57: A stopped share keeps its hardware encoder

**Status:** ready-for-human

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

## Comments

### 2026-11-23: built and checked in Chrome here; the media server's side is unchecked

**The fix.** `stop` in `src/app/lib/media/browser.ts` now calls `transceiver.stop()` on each of the share's transceivers, in place of `replaceTrack(null)` and `inactive`. It still stops the tracks first, and does nothing once the connection is closed. Webcams and screens go through the same `stop`, so both are covered, and a screen share's audio transceiver is stopped with its picture. `setParameters` with `active: false` was not tried: an inactive encoding keeps its transceiver and its media section, and nothing says Chrome lets the encoder go for it.

**Chrome's side, checked here.** This server has no GPU, so the check reads the ticket's other sign: the outbound video streams still listed in the connection's stats. A loopback page in headless Chromium 158 on Linux made 14 shares in turn on one connection, each answered by a plain `RTCPeerConnection` standing in for the media server, and stopped each before the next.

| After share 14 | Old stop (`inactive`) | `transceiver.stop()` |
|---|---|---|
| Outbound video streams in stats | 14 | 1 |
| Transceivers | 14 | 1 |
| Media sections in the offer | 14 (55,982 bytes) | 2, one rejected (8,004 bytes) |

- With `stop()`, the stopped share's stream is gone once the next negotiation settles it. From share 3 on, Chrome reused the rejected section for each new share, under a new mid (2 to 13), so the sharer's offer stays the same size.
- Every share in both runs encoded frames (22 to 45 in its first 1.5 s).
- Chrome hides `encoderImplementation` from a page that is not capturing, so the loopback cannot show hardware or software.

**The media server's side, not checked.** `.dev.vars` holds the fakes' credentials, so `pnpm dev` here cannot reach Cloudflare, and nothing was deployed. What is known:
- Cloudflare's own client library, partytracks (0.0.56, `dist/client/index.js`), closes a track the same way. It calls `transceiver.stop()` and sends the new offer to `tracks/close` with `force: false`. Its later `tracks/new` offers carry the rejected section, and Chrome reuses it. So the media server takes those offers.
- graeae's order is different. The instance force-closes the track first, with no SDP. The tab's next negotiation then rejects the section, in one of three ways, none of them checked:
  1. **The tab's next share:** its offer to `tracks/new` carries the rejected section (port 0). This is the closest to partytracks.
  2. **A share the tab watches:** the media server makes that offer, and the tab's answer, through `renegotiate`, rejects the section. partytracks never does this. A sharer who stops and then watches someone takes this path first.
  3. **A media restart:** its offer carries the rejected section, as in 1.

  If the media server refuses any of the three, every later share, watch or restart on that connection fails until a reload. That is worse than this ticket's fallback to software.

**Tests.** No test reaches `browser.ts` (Seam 2 runs on the fake), and the fake's behaviour is unchanged. Typecheck and lint pass. All 481 tests pass in the Workers runtime, and all 61 browser journeys.

**Review.**
- **Standards:** shorten the comment and cite the ticket in the repo's style. Both done.
- **Spec:** it raised the second path above, now written up there. It also found that clearing `offered` in `stop` could never run: the room client stops a capture only once its share is live, or after `publish` failed. That line is removed.

**Left, on real media.**
1. **Here, on `graeae-test` (once deployed).** A Linux Chromium sharer makes 14 or more webcam shares in turn from one page load. After each stop, it watches another member's share, then shares again. Each share and watch must start, and the sharer's `stats` lines should list one outbound video stream at a time. This settles the media server's side, all three paths in a few minutes.
2. **On MONSTRAO.** Rerun ticket 55's check 7: share 13 and every later share should stay on `D3D12VideoEncodeAccelerator`.
