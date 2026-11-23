# 54: A screen share sends H.264 high

**What to build:** a Chromium screen share on one quality offers H.264 high profile (`64001f`) when the sharer's browser encodes it in hardware, and baseline (`42001f`) otherwise, as today. VP8 stays last. Webcam shares, Firefox screen shares and the two-quality plan keep the list they have today.

**Why:** at the same bitrate, high gives a better picture.
- On Windows 11 with Chrome 158 on an RTX 5070 Ti ([Windows evidence run on MONSTRAO](../../share-reliability/issues/09-windows-evidence-run.md), section 3), high was answered and encoded in hardware, with CABAC and the 8x8 transform on.
- On the game clip, both profiles sent 10.6 Mbps, and QP per frame was 22.9 with high against 26.3 with baseline. Encode time was the same, at 60 fps.
- Chrome and Firefox watchers on Windows decoded every frame in hardware, even though the media server labels every watcher's stream `42e01f` (constrained baseline) whatever the sharer sends.

The research ([A better codec at 12 Mbps](../../share-reliability/issues/03-better-codec-at-12-mbps.md)) found the "Firefox cannot decode main or high" basis wrong, and the "never main or high" rule otherwise came from two qualities.

The owner chose this in [Whether a share sends H.264 high](../../share-reliability/issues/14-whether-a-share-sends-h264-high.md). Its answer gives the reasoning and what was rejected.

Spec: [Encoding and quality](../spec.md#encoding-and-quality).

**Status:** ready-for-agent

**Blocked by:** none

- [ ] **First, before any code changes: a Linux Chromium watcher decodes high under the `42e01f` label.** A Linux sharer cannot make high, since Chrome's software H.264 encoder (OpenH264) makes only constrained baseline. So a throwaway rig fakes it.
  - Add the rig to `scripts/real-media/` as an option of the sharing member, like `--max-bitrate`. A sender transform (`RTCRtpScriptTransform`, or `createEncodedStreams` if that is what this Chromium has) swaps each encoded video frame for the next frame of an x264 high-profile clip.
  - Make the clip with `ffmpeg -c:v libx264 -profile:v high`, at 1920x1080 and 60 fps, at about 10 Mbps, with headers repeated on every key frame. Use moving content, so a garbled decode shows.
  - Answer a key frame from the encoder with the clip's next key frame. The sharer offers `64001f` if its browser lists it, so the sharer's side looks as it will in the real case.
  - Against `graeae-test`, a Linux Chromium member watches the faked share for 5 minutes, through the real media server. Record its `stats` lines (decoded frames, frames per second, dropped frames, freezes, `pli`/`fir`) and a screenshot showing the clip's picture.
  - Then a Linux Firefox watcher does the same, with Playwright's Firefox if `scripts/real-media/` cannot drive it. This one is recorded only, since Firefox off Windows is best effort.
  - **Decode load:** the Linux Chromium watcher's frames per second and dropped frames for one faked high share and then one baseline share (the rig off), on this server, which has no GPU.
  - **If Linux Chromium does not decode high cleanly, stop here.** Comment on this ticket and on [Whether a share sends H.264 high](../../share-reliability/issues/14-whether-a-share-sends-h264-high.md) with the readings, set this ticket to `needs-triage`, and build nothing. Firefox's result never stops the ticket.
  - The rig can stay in `scripts/real-media/` as an option if it is small; otherwise remove it, and keep its readings in the comment.
- [ ] **The plan (`src/shared/encoding.ts`).**
  - `Codec`'s H.264 profile gains `"high"`.
  - The one-quality Chromium screen plan lists high, then baseline, then VP8. The two-quality plan, the webcam plan and Firefox keep today's lists.
  - Rewrite `Codec`'s doc comment: drop "never main or high, which … Firefox cannot decode". High is offered on one quality only, since the media server answers it with VP8 on two. Constrained baseline and HEVC are still never offered.
  - `encodingPlan` stays pure: it lists high, and the browser decides whether it has high in hardware.
- [ ] **The browser's choice (`src/app/lib/media/encodings.ts`, `browser.ts`).**
  - `H264_PROFILE` gains `high: "6400"`.
  - High counts as available only when `getCapabilities` lists a `6400` profile with packetization mode 1, and `navigator.mediaCapabilities.encodingInfo({ type: "webrtc", video: { contentType: "video/H264; profile-level-id=64001f", width: 1920, height: 1080, framerate: 60, bitrate: 12_000_000 } })` says `powerEfficient`. If the check is missing, throws or says no, the browser goes on to baseline. Main is listed even without hardware, and high may be too, hence the second check.
  - One way: `codecPreferences` takes the set of codecs known to be in hardware, and stays pure and tested. `preferCodecs` asks `encodingInfo` first. It is async, so the codec preferences must be set before the offer is made.
  - Update `preferCodecs`'s doc comment ("hardware H.264 baseline").
- [ ] **Spec (`.scratch/v1-build/spec.md`).**
  - **The table:** the Chromium screen share's codec becomes "H.264 high profile (`64001f`) when the sharer encodes it in hardware, otherwise baseline (`42001f`)". The webcam row no longer says "Same rule as a Chromium screen share"; it says H.264 baseline (`42001f`), or VP8.
  - **Hardware encoding:**
    - Firefox decodes baseline and high (Windows Media Foundation, share-reliability ticket 09), and "cannot decode main or high" goes.
    - With one quality, a Chromium screen share offers high when the browser lists it and says it encodes it power-efficiently, then baseline. Give the Windows run's QP reading.
    - With two qualities, it offers baseline.
  - **History:** add a line under the one about build ticket 17. High comes back for one quality in build ticket 54, after share-reliability tickets 03, 09 and 14.
  - **Unverified facts:**
    - Widen the relabelling line: the media server describes baseline and high to viewers as `42e01f`. Chromium and Firefox on Windows and Linux Chromium decode high under that label; give Firefox on Linux as the rig found it.
    - Add the decode-load reading for a Linux watcher with no GPU.
- [ ] **Ticket 29.** Add a comment: bringing two qualities back has to retest H.264 high, since the media server answered it with VP8 on simulcast (ticket 17). On two tracks of one quality each, high may be possible again.
- [ ] **Tests (on the fakes), in `test/encoding.test.ts`.**
  - A Chromium screen plan lists high, baseline, then VP8. The two-quality plan, the webcam plan and Firefox are unchanged.
  - With `6400` listed and in hardware, `codecPreferences` offers high alone, plus the repair formats.
  - With `6400` listed but not in hardware, or not listed, it offers baseline alone.
  - Constrained baseline and main are never offered.
- [ ] **On this server, with `scripts/real-media/`, against `graeae-test` once it is deployed, with the rig off.** A Linux Chromium screen share offers and sends baseline (`42001f`), with no high in hardware here. A watcher sees it as today.

The agent does all of this alone. Hardware high is left to the map's final Windows check, which gains two lines:
- In Chrome and Helium, a fresh game-window share goes out as `64001f` in hardware, read from its `stats` line.
- The owner looks at a real game and says the picture is no worse.

The owner checks nothing for this ticket alone.
