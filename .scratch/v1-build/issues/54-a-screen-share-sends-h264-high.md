# 54: A screen share sends H.264 high

**What to build:** a Chromium screen share on one quality offers H.264 high profile (`64001f`) when the sharer's browser encodes it in hardware, and baseline (`42001f`) otherwise, as today. VP8 stays last. Webcam shares, Firefox screen shares and the two-quality plan keep the list they have today.

**Why:** at the same bitrate, high gives a better picture.
- On Windows 11 with Chrome 158 on an RTX 5070 Ti ([Windows evidence run on MONSTRAO](../../share-reliability/issues/09-windows-evidence-run.md), section 3), high was answered and encoded in hardware, with CABAC and the 8x8 transform on.
- On the game clip, both profiles sent 10.6 Mbps, and QP per frame was 22.9 with high against 26.3 with baseline. Encode time was the same, at 60 fps.
- Chrome and Firefox watchers on Windows decoded every frame in hardware, even though the media server labels every watcher's stream `42e01f` (constrained baseline) whatever the sharer sends.

The research ([A better codec at 12 Mbps](../../share-reliability/issues/03-better-codec-at-12-mbps.md)) found the "Firefox cannot decode main or high" basis wrong, and the "never main or high" rule otherwise came from two qualities.

The owner chose this in [Whether a share sends H.264 high](../../share-reliability/issues/14-whether-a-share-sends-h264-high.md). Its answer gives the reasoning and what was rejected.

Spec: [Encoding and quality](../spec.md#encoding-and-quality).

**Status:** needs-triage

**Blocked by:** none

- [x] **First, before any code changes: a Linux Chromium watcher decodes high under the `42e01f` label.** A Linux sharer cannot make high, since Chrome's software H.264 encoder (OpenH264) makes only constrained baseline. So a throwaway rig fakes it.
  - Add the rig to `scripts/real-media/` as an option of the sharing member, like `--max-bitrate`. A sender transform (`RTCRtpScriptTransform`, or `createEncodedStreams` if that is what this Chromium has) swaps each encoded video frame for the next frame of an x264 high-profile clip.
  - Make the clip with `ffmpeg -c:v libx264 -profile:v high`, at 1920x1080 and 60 fps, at about 10 Mbps, with headers repeated on every key frame. Use moving content, so a garbled decode shows.
  - Answer a key frame from the encoder with the clip's next key frame. The sharer offers `64001f` if its browser lists it, so the sharer's side looks as it will in the real case.
  - Against `graeae-test`, a Linux Chromium member watches the faked share for 5 minutes, through the real media server. Record its `stats` lines (decoded frames, frames per second, dropped frames, freezes, `pli`/`fir`) and a screenshot showing the clip's picture.
  - Then a Linux Firefox watcher does the same, with Playwright's Firefox if `scripts/real-media/` cannot drive it. This one is recorded only, since Firefox off Windows is best effort.
  - **Decode load:** the Linux Chromium watcher's frames per second and dropped frames for one faked high share and then one baseline share (the rig off), on this server, which has no GPU.
  - **If Linux Chromium does not decode high cleanly, stop here.** Comment on this ticket and on [Whether a share sends H.264 high](../../share-reliability/issues/14-whether-a-share-sends-h264-high.md) with the readings, set this ticket to `needs-triage`, and build nothing. Firefox's result never stops the ticket.
  - The rig can stay in `scripts/real-media/` as an option if it is small; otherwise remove it, and keep its readings in the comment.
- [x] **The plan (`src/shared/encoding.ts`).**
  - `Codec`'s H.264 profile gains `"high"`.
  - The one-quality Chromium screen plan lists high, then baseline, then VP8. The two-quality plan, the webcam plan and Firefox keep today's lists.
  - Rewrite `Codec`'s doc comment: drop "never main or high, which … Firefox cannot decode". High is offered on one quality only, since the media server answers it with VP8 on two. Constrained baseline and HEVC are still never offered.
  - `encodingPlan` stays pure: it lists high, and the browser decides whether it has high in hardware.
- [x] **The browser's choice (`src/app/lib/media/encodings.ts`, `browser.ts`).**
  - `H264_PROFILE` gains `high: "6400"`.
  - High counts as available only when `getCapabilities` lists a `6400` profile with packetization mode 1, and `navigator.mediaCapabilities.encodingInfo({ type: "webrtc", video: { contentType: "video/H264; profile-level-id=64001f", width: 1920, height: 1080, framerate: 60, bitrate: 12_000_000 } })` says `powerEfficient`. If the check is missing, throws or says no, the browser goes on to baseline. Main is listed even without hardware, and high may be too, hence the second check.
  - One way: `codecPreferences` takes the set of codecs known to be in hardware, and stays pure and tested. `preferCodecs` asks `encodingInfo` first. It is async, so the codec preferences must be set before the offer is made.
  - Update `preferCodecs`'s doc comment ("hardware H.264 baseline").
- [x] **Spec (`.scratch/v1-build/spec.md`).**
  - **The table:** the Chromium screen share's codec becomes "H.264 high profile (`64001f`) when the sharer encodes it in hardware, otherwise baseline (`42001f`)". The webcam row no longer says "Same rule as a Chromium screen share"; it says H.264 baseline (`42001f`), or VP8.
  - **Hardware encoding:**
    - Firefox decodes baseline and high (Windows Media Foundation, share-reliability ticket 09), and "cannot decode main or high" goes.
    - With one quality, a Chromium screen share offers high when the browser lists it and says it encodes it power-efficiently, then baseline. Give the Windows run's QP reading.
    - With two qualities, it offers baseline.
  - **History:** add a line under the one about build ticket 17. High comes back for one quality in build ticket 54, after share-reliability tickets 03, 09 and 14.
  - **Unverified facts:**
    - Widen the relabelling line: the media server describes baseline and high to viewers as `42e01f`. Chromium and Firefox on Windows and Linux Chromium decode high under that label; give Firefox on Linux as the rig found it.
    - Add the decode-load reading for a Linux watcher with no GPU.
- [x] **Ticket 29.** Add a comment: bringing two qualities back has to retest H.264 high, since the media server answered it with VP8 on simulcast (ticket 17). On two tracks of one quality each, high may be possible again.
- [x] **Tests (on the fakes), in `test/encoding.test.ts`.**
  - A Chromium screen plan lists high, baseline, then VP8. The two-quality plan, the webcam plan and Firefox are unchanged.
  - With `6400` listed and in hardware, `codecPreferences` offers high alone, plus the repair formats.
  - With `6400` listed but not in hardware, or not listed, it offers baseline alone.
  - Constrained baseline and main are never offered.
- [x] **On this server, with `scripts/real-media/`, against `graeae-test` once it is deployed, with the rig off.** A Linux Chromium screen share offers and sends baseline (`42001f`), with no high in hardware here. A watcher sees it as today.

The agent does all of this alone. Hardware high is left to the map's final Windows check, which gains two lines:
- In Chrome and Helium, a fresh game-window share goes out as `64001f` in hardware, read from its `stats` line.
- The owner looks at a real game and says the picture is no worse.

The owner checks nothing for this ticket alone.

## Comments

### 2026-11-23: built, deployed to graeae-test and checked there

**The gate first: Linux watchers decode high under the `42e01f` label.** Before any change to `src/`, `scripts/real-media/` gained `--fake-h264 <clip.h264>` (`fake-h264.js`). Through `RTCRtpScriptTransform`, it swaps each encoded frame of a screen share for the next frame of a clip, after the browser's encoder. A key frame from the encoder is answered with the clip's next key frame.
- **The clip:** x264 high profile, 1920x1080 at 60 fps, about 10 Mbps, no B-frames, with headers before each key frame. It is 600 frames of `testsrc2` with moving noise, and a key frame every 2 s.
- **The members:** headed members on an Xvfb display (`:98`), against `graeae-test` through the real media server. Probe S shared a 1600x900 game window with the clip swapped in, and Probe W watched.
- **What Probe S offered:** `42001f`. Linux Chromium 158 lists no `6400` to send, so the share was high on the wire under a baseline description, as the rig intends.

| Watcher, 5 minutes | Frames decoded | Frame rate | Dropped | Freezes | Lost | PLI / FIR / NACK |
|---|---|---|---|---|---|---|
| Chromium 158 | 18,013 of 18,014 | 60 average, 54 lowest | 0 | 0 | 0 | 1 / 0 / 0 |
| Firefox 160 (OpenH264) | 18,340 of 18,340 | 59.9 average, 55 lowest | 0 | 0 | 24 | 2 / 0 / 2 |

- **What each watcher saw.** Both read the stream as `42e01f`. The screenshots (`.impeccable/review/real-media/high-chromium.dark.1920x953.png` and `high-firefox.dark.1920x953.png`, not committed) show the clip's picture clean.
- **Driving Firefox.** Playwright 1.65 drives stock Firefox over WebDriver BiDi (`--browser firefox`, the Firefox at `GRAEAE_FIREFOX`). A persistent context hangs, so the rig launches a plain one and keeps its sign-in in `firefox-state.json`. Playwright turns off the plugin updater, which is what fetches OpenH264. With it off, Firefox had no H.264 and the connection failed with "ICE failed". The rig turns it back on (`media.gmp-manager.updateEnabled`), and OpenH264 arrives within about a minute of start.

**Decode load.** The same Chromium watcher, on this server, which has no GPU, for about 70 s each:
- **Faked high share:** 60 fps on average (59 lowest), 4,380 of 4,380 frames decoded, nothing dropped, about one core (100%).
- **Real baseline share (rig off):** 58.7 fps on average (55 at the 5th percentile, one dip to 31), nothing dropped, 96% of a core.

Both are in the spec's Unverified facts. They were measured once, on one machine.

**The plan.** In `src/shared/encoding.ts`, `Codec`'s H.264 profile is `"high" | "baseline"`. The one-quality Chromium screen plan lists high, then baseline, then VP8 (`HIGH_FIRST`). The two-quality plan and webcams keep baseline, then VP8. Firefox keeps VP9, then VP8. `Codec`'s doc comment is rewritten as the ticket asks. `encodingPlan` stays pure.

**The browser's choice.**
- **`encodings.ts`:**
  - `H264_PROFILE.high` is `6400`, matched with packetization mode 1.
  - `hardwareQuery(codec, plan)` gives the `encodingInfo` query for a codec that needs hardware, H.264 high. The query is the ticket's, at the plan's capture size, frame rate and bitrate (`64001f`, 1920x1080, 60, 12 Mbps). Every other codec gets null.
  - `codecPreferences` takes a third argument, `inHardware`, and counts high as available only when high is in it.
- **`browser.ts`:**
  - `preferCodecs` is async, and `offer()` awaits it before the offer is made. The doc comment is updated.
  - `codecsInHardware` asks `encodingInfo` only for a codec the browser lists. The browser goes on to baseline when the check is missing, throws, says no, or has not answered within 1 s. The time limit was not in the ticket. A browser that never answers would otherwise hold up the share.

**Spec and ticket 29.** All four spec edits are in: the table, Hardware encoding (with the Windows QP reading), Superseded, and Unverified facts (the relabelling line, widened, and the decode load). Ticket 29 has its comment.

**Tests.** `test/encoding.test.ts` checks the following:
- The one-quality Chromium screen plan lists high, baseline, VP8.
- The two-quality, webcam and Firefox plans are unchanged.
- High is offered only on a one-quality Chromium screen share.
- With `6400` listed and in hardware, high is offered alone with the repair formats.
- With `6400` listed but not in hardware, or not listed, baseline is offered alone.
- High in packetization mode 0 is never offered.
- Constrained baseline, main and HEVC are never offered.
- `hardwareQuery` builds the exact query for high, and null for baseline and VP8.

Typecheck passes. Lint's only errors are in the untracked `.logs/upload-estimate/scripts`. All 479 tests pass in the Workers runtime. All browser journeys pass, though two in `stage.spec.ts` needed a rerun: each failed once and passed the second time.

**Review.**
- **Spec axis:** nothing missing.
  - It noted the 1 s time limit (above).
  - It noted that `--fake-h264` alone no longer makes a sharer offer high, since the page now asks for hardware. The rig's help now says to add `--codec H264:6400` for that.
  - It asked whether Chrome offers high at level `1f` or at another level. Ticket 09 read `64001f` from Chrome on Windows, so the spec and ticket 55 stay as written.
- **Standards axis:**
  - Fixed: two stale headers (`member.ts` named only Chromium, and `encodings.ts` didn't mention the hardware check), "viewers" for "watchers" in `Codec`'s doc comment, and a lost space in a test.
  - Kept: the list-shaped `inHardware`, which the ticket proposed.

**On real media, deployed.** Deployed to `graeae-test` from the working tree on `eca6adf` (version `b6d04cf6`), with the rig off. Probe S shared a fresh 1920x1080 game window, captured at 1920x1080. The offer's only H.264 line was `profile-level-id=42001f`, packetization mode 1. The sender's stats line read `H264 42001f`, OpenH264, software, 1920x1080, 11.9 Mbps. `encodingInfo` for `64001f` there said supported but not power-efficient. Probe W watched for 72 s:
- 4,052 of 4,052 frames decoded at 1920x1080, as `42e01f`;
- 56.3 fps on average, 60 median;
- 0 dropped, 0 freezes, 0 lost, 1 PLI.

Both browsers encoding and decoding 1080p60 in software on one machine with no GPU took it to "limited by cpu" and 40 fps in the last seconds, the same as any baseline share here. After the deploy, both probes' cached room page still asked for the previous build's script (a 404) until they were restarted.

**Files**, in `.logs/h264-high/` (gitignored):
- `high-chromium-{s,w}.jsonl` and `high-firefox-w.jsonl`, each with its `-stats.jsonl`: the gate.
- `load-high-w.jsonl` and `load-baseline-{s,w}.jsonl`: the decode load.
- `deployed-{s,w}.jsonl` and their `-stats.jsonl`: the deployed check.
- `*.out`: `member.ts`'s own lines, with invite addresses redacted.

Not checked here: hardware high, which this server lacks. It is ticket 55's, which already has both lines. Afterwards Probe S, Probe W and Probe F were removed in People, and their browser profiles and invite codes deleted. The other members were not touched. The desktop on `:98` was stopped.

**Failed the final Windows check (ticket 55, 2026-11-23).** The report is `docs/evidence/windows-2026-11-23.md` on `evidence/windows-2026-11-23`. MONSTRAO: Windows 11 build 26300, RTX 5070 Ti, NVIDIA driver 621.24, Chrome 158.0.8127.37, Helium 0.22.2.1 (Chromium 158.0.8127.36). `graeae-test` was on `eca6adf-dirty`, the same front end as `98f62aa`.

- **High is never chosen.** All 24 fresh shares sent `H264 42001f`: 8 window and 4 tab shares from Chrome, and the same from Helium. Each was encoded by `D3D12VideoEncodeAccelerator`, in hardware. So did the 5-minute watched share.
- **Why: `hardwareQuery` leaves out the packetization mode.** It asks `encodingInfo` for `video/H264; profile-level-id=64001f`, the query this ticket wrote (`src/app/lib/media/encodings.ts:38`). Both browsers answer `supported: true, smooth: true, powerEfficient: false`. With `; packetization-mode=1` appended, both answer `powerEfficient: true`. That holds for `64001f`, `64002a` and `640033`, and also for baseline `42001f`. The agent varied the query in fresh profiles, at the same 1920x1080, 60 fps and 12 Mbps. Without the mode, Chrome on Windows seems to judge the query against mode 0, which its hardware encoder does not take. The readings are in `chrome-encoding-diagnostics.json` and `helium-encoding-diagnostics.json` beside the report.
- **A second thing to settle: the level Chrome lists.** `getCapabilities("video")` lists high only as `640033` (mode 1), not `64001f`, in both browsers. The ticket, the spec, ticket 55's pass line and the wizard edit all expect `64001f` on the wire. Ticket 09 read `64001f`, which may have been from the offer, not the capabilities. Once the query is fixed, check which level the offer and `outbound-rtp` actually carry before those lines are kept.
- **Everything else on the path held.** Every share opened at the full capture size, in hardware, and kept it at 10 s and 25 s. Window shares opened at 1920x1080. Tab shares opened at 1920x934 in Chrome and 1912x964 in Helium. The resized tab never left hardware. Chrome and Firefox watchers decoded the 5-minute share in hardware at 59.9 fps, with 0 freezes and no growing drop count, but it was baseline. Decoding high from graeae's own sender is still unchecked on Windows.

Ticket 55 is to be run again once this is fixed and on `graeae-test`, and the wizard stays unedited until then.
