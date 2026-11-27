# 57: A stopped share keeps its hardware encoder

Status: resolved

Blocked by: none

**What was seen:** in ticket 55's rerun on MONSTRAO (2026-11-23, `docs/evidence/windows-2026-11-23-2.md`, check 7), Win Chrome made 32 tab shares in turn from one page load of `graeae-test` at `b2a396c`, with no reload. Each share was stopped before the next started. Chrome 158, Windows 11, RTX 5070 Ti, NVIDIA 621.24. The sharer's readings are in `docs/evidence/windows-2026-11-23/repeat-NN-sender.jsonl` and `repeated-chrome-stats.jsonl`:
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

### 2026-11-23: checked on graeae-test; two of Chrome's limits found and kept clear of

Three runs of step 1 on `graeae-test`, from this server. Two Linux Chromium 158 members ran `scripts/real-media/member.ts` with fake webcams. The sharer made 14 webcam shares in turn from one page load. After each one, the watcher watched it; after each stop, the sharer watched the watcher's share for 6 s.

**Run 1, version `6a2953aa` (commit `9674570`, every transceiver stopped).**
- The tab's offer after the first stop rejected mid 0, the first mid of `a=group:BUNDLE`. Chrome then built a new transport (new ICE ufrag), and the media server never connected it.
- The next pull got `410 Session appears to be disconnected`, and the tab rebuilt its media connection, every second cycle.
- Log: `.logs/graeae-test-1795455120000-1795455540000.jsonl`.

**Run 2, version `d8269bf1` (the BUNDLE tag's transceiver left inactive).**
- One transport all run, and shares 1 to 10 went out and were watched.
- Two new faults:
  - **A pull in the tag's section.** The media server put the sharer's second watch in mid 0, which the tab held inactive. The tab answered `inactive`. The old `stop` gave every share this, so it is older than this ticket; ticket 58 has it.
  - **Share 11 refused with `503 Transport is temporarily unavailable`.** Its unanswered transceiver was stopped while the offer was pending. After the rollback, Chrome's next offer gave the new share's transceiver no mid, so shares 12 to 14 failed with `The offer gave the capture no mid`.
- Both reproduce in a loopback. Stopping a transceiver that never negotiated breaks the next offer, whether it is stopped before or after the rollback; leaving it inactive does not. A pull in an inactive section decodes (60 frames in 2 s) once the tab sets it to `recvonly` before answering.
- Log: `.logs/graeae-test-1795456290000-1795456900000.jsonl`.

**The fix as it stands.**
- `stopping` in `src/app/lib/media/stopping.ts` (tested in `test/stopping.test.ts`) stops a transceiver only once it has negotiated, and never the BUNDLE tag's. Other transceivers are left inactive.
  - The tag's keeps its encoder, one per connection at most.
  - One that was never answered never had an encoder.
- `pull` sets an inactive transceiver that the media server's offer names to `recvonly`.

**Run 3, version `b93e34ff`.**
- All 14 shares went live, and the watcher decoded each one (116 to 133 frames).
- The sharer kept one transport all run (ufrag `chfl`, connected throughout).
- Its stats listed 2 outbound video streams from share 2 on (the tag's and the live one), not one per stopped share.
- There were no failed media server calls, closes or shares.
- The sharer's watches after the first still decoded nothing. Each pull went in a section the tab had published on, and the media server sent nothing there. The same member re-watching with no shares of its own decoded every time. This is ticket 58.
- Log: `.logs/graeae-test-1795457588000-1795457956000.jsonl`.

**Tests.** 486 in the Workers runtime (5 new for `stopping`) and the 61 browser journeys pass, with typecheck and lint.

**Review.**
- **Spec:**
  - It found that `abandonRestart` stopped its never-negotiated audio spare after the rollback. In a loopback, once an earlier share's transceiver had been stopped, that made Chrome refuse every later offer (`Transceiver type does not match media description type`). Run 3's version still has it.
  - The spare is now made inactive. With that, the next shares negotiate.
  - A live share stopped while another offer is pending, then rolled back, was checked in a loopback too, and the next shares negotiate.
- **Standards:** an impossible test case is dropped, the parameter is renamed `localSdp`, and the header says the rule is pure.

**Not checked.**
- **A media restart** (the third path in the first comment). The rig cannot cut a tab's media alone. Its offer carries the same rejected and inactive sections as a share's offer, which runs 2 and 3 show the media server takes through the same `tracks/new`.
- **The inactive sections left by refused shares and abandoned restarts.** Each one stays in every later offer: at most one section each, and none holds an encoder. Ticket 56's bound on the offer's size still covers them.

**Left.** Rerun ticket 55's check 7 on MONSTRAO. Share 13 and every later share should stay on `D3D12VideoEncodeAccelerator`, with at most two `hardware: true` outbound streams in the sharer's stats.

**2026-11-24: resolved on MONSTRAO.** In ticket 65's check 3 (`docs/evidence/windows-2026-11-24.md`), on `graeae-test` at `063611c`: Win Chrome 158.0.8127.37 made 32 tab shares in turn from one page load. Every one went out on `D3D12VideoEncodeAccelerator`, with `hardware: true`, and from share 2 on there were never more than 2 outbound video streams reading `hardware: true`. Win Watcher decoded each share within 0.97 to 2.22 s (442 to 517 frames in 10 s), up to video mid 64.
