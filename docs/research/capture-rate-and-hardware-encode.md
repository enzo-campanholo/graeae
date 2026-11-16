# Research: why capture runs at 48 fps and H.264 encodes in software (Chromium 157, Windows 11)

**Question.** The quality-proof prototype (`prototype/quality-proof/public/index.html`, `share()` and `preferCodec()`) was run on 2026-11-16 on the owner's gaming PC. It showed two unexplained results:

- Capture was pinned at about 48 fps.
- The H.264 encoder was OpenH264, a software encoder.

This document explains both from source and says what a web page can do about each.

**Researched:** 2026-11-16.

**Test machine:**

| Item | Value |
|---|---|
| OS | Windows 11 (exact build not yet known) |
| GPU | NVIDIA GeForce RTX 5070 Ti |
| Monitor | 144 Hz |
| Game | Persona 5 Royal, capped at and holding 120 fps |
| Browsers | Chrome 157 and Helium 0.21.3.1 (Chromium 157.0.8103.78) |

**Source read:**

| Source | Version |
|---|---|
| Chromium `chromium/src` | `refs/branch-heads/8103` (M157, the build under test), cross-checked against `main` |
| libwebrtc `webrtc.googlesource.com/src` | `refs/branch-heads/8103` and `main`. `wgc_capture_session.cc` is identical on both. |
| Firefox | `mozilla-firefox/firefox` `main` (for the H.264 interop question only) |
| Chromium issue tracker | [issue 565075148](https://issues.chromium.org/issues/565075148) and its comments, read through the tracker's JSON endpoint |
| Gerrit | the two CLs attached to that issue |

**Labels:** the same as in `docs/research/capture-quality.md` (branch `research/capture-quality`):

| Label | Meaning |
|---|---|
| **[source]** | Read in browser source on the date above |
| **[doc]** | Official documentation (Microsoft Learn) |
| **[reported]** | A report on a public tracker that was not reproduced here |
| **[unverified]** | Not confirmed; needs the test given next to it |
| **[derived]** | Arithmetic from the facts above it, not measured |

All file links below point at the M157 branch unless stated otherwise:

- Chromium links start with `https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8103/`.
- libwebrtc links start with `https://webrtc.googlesource.com/src/+/refs/branch-heads/8103/`.

---

## 0. Summary

### Symptom 1: capture pinned at 48 fps

**Most likely cause (high confidence).** Windows' screen-capture API (Windows Graphics Capture, WGC) is producing at most 48 frames a second. Chromium's polling, and the tick that delivers no frame, follow from that.

1. **Windows' capture throttle.** On Windows 11 24H2 and later, a WGC capture session has a minimum interval between frames (`GraphicsCaptureSession.MinUpdateInterval`).
   - Its default reads back as **16 ms** [reported].
   - Chromium 157 never changes it, for either window or monitor capture [source].
   - WGC can only hand over a frame on a display refresh. On a 144 Hz monitor (6.94 ms per refresh), the first refresh at least 16 ms after the last frame is the **third** one.
   - So WGC produces one frame every 20.83 ms: **144 / 3 = 48 fps**, whatever rate the page asks for [reported, derived].
   - The same bug report gives 53.33 fps on a 160 Hz panel (160 / 3) [reported].
2. **Why the timer ticks every 17.3 ms rather than 16.67 ms.**
   - Chromium polls WGC on a timer, not on WGC's frame events [source].
   - On Windows, each timer wait is rounded **up** to a whole millisecond and wakes on the next 1 ms system timer tick [source].
   - That makes every 16.67 ms period come out about 0.5–1 ms late [source, derived].
3. **Why about one tick in six or seven delivers nothing.**
   - Ticks come about 57.8 times a second, but WGC frames only come 48 times a second. Some ticks therefore find the WGC frame pool empty.
   - Chromium then takes the previous frame with an empty "changed region". Its zero-hertz path drops that frame instead of re-sending it [source]. That produces the 34–35 ms gaps.
   - Asking for 72 or 120 fps only makes Chromium poll faster. Polling faster cannot pull out more frames than WGC produces, so the average stays 48 [derived].

**Page-side fix.** None that gets above 48 on a 144 Hz monitor in Chromium 157.

- No constraint, `resizeMode`, surface type or cursor setting touches the WGC throttle [source].
- There is no flag or policy for it in M157, and the old DXGI fallback flag is gone [source].
- A fix (WebRTC CL [512180](https://webrtc-review.googlesource.com/c/src/+/512180)) is under review and has not landed as of 2026-11-16 [source].

**User-side fix.** Set the monitor to **120 Hz** (or 60 or 240 Hz).

- 16 ms then rounds up to 2 refreshes at 120 Hz (16.67 ms), 1 at 60 Hz or 4 at 240 Hz. Each of these gives **60 fps** [derived; test 1.B].
- Then have the page **ask for `frameRate` 90–120** and cap the sender at `maxFramerate: 60`. That keeps Chromium's polling faster than the 60 fps WGC delivers; at exactly 60 the poll itself only manages about 57.8 [derived].

### Symptom 2: OpenH264 instead of the hardware encoder

**Cause (certain, from source and the owner's `encodingInfo` measurement).** The session negotiated `profile-level-id=42e01f`, which is **Constrained Baseline (CBP)**. Chromium 157 on Windows does not hardware-encode CBP, for two independent reasons:

1. **Off on Windows for every GPU.** `kPlatformH264CbpEncoding` is `FEATURE_DISABLED_BY_DEFAULT` on Windows. With it off, the hardware encoder factory never advertises a CBP format, so the encoder adapter picks the software factory, OpenH264 [source].
2. **NVIDIA skipped even if the flag were on.** `MediaFoundationVideoEncodeAccelerator::ActivateAsyncEncoder` skips any NVIDIA Media Foundation encoder for constrained-baseline H.264 ("due to https://crbug.com/1088650") [source].

Main (`4d001f`) and High (`64001f`/`640032`) are hardware-encoded on this machine [owner measurement, consistent with source].

The starting resolution of 640×360 plays no part, and neither do `contentHint`, `maxFramerate` or L1T1. Nothing was ever "falling back": the hardware encoder was never chosen [source].

**Page-side fix.**

1. Put only the hardware profile's entries in `setCodecPreferences`. That forces the SFU to answer with it.
2. **Which profile:**
   - **Main `4d001f`** if every viewer is Chromium-based.
   - Firefox negotiates only the `42e0xx` (CBP) and `4200xx` (Baseline) H.264 profiles, so a Firefox viewer cannot accept Main or High [source].
   - For a Firefox viewer, test **Baseline `42001f`** first. It is not CBP, so neither block applies; whether NVIDIA's encoder accepts it is [unverified; test 2.A].
3. If neither works for a mixed group, use VP8/VP9 (software) for Firefox viewers.

---

## 1. Symptom 1: why 48 fps

### 1.1 What Chromium does on each capture tick (M157)

**Capturer choice** [source, `content/browser/media/capture/desktop_capture_device.cc`]:

- Window capture always uses WGC.
- Whole-monitor capture uses WGC when `base::win::GetVersion() >= WIN11_24H2` (`IsWgcEnabledForScreenCapture()`, l.262–267).
- No feature flag in M157 turns WGC screen capture off:
  - `WebRtcAllowWgcScreenCapturer`, the flag named in the issue as the old DXGI workaround, no longer appears in `desktop_capture_device.cc` or `media/webrtc/webrtc_features.cc` on 8103.
  - Issue 565075148 says the flag existed up to Chromium 150 [reported].

**Thread and timer** [source, `desktop_capture_device.cc`]:

- Capture runs on a dedicated `desktopCaptureThread` with a UI message pump on Windows (l.1529, l.1539).
- `AllocateAndStart` activates the high-resolution timer (`ScopedHighResolutionTimer`, l.513).
- Each capture then reschedules itself from `ScheduleNextCaptureFrame()` (l.1287–1306):

```
last_capture_duration = NowTicks() - capture_start_time_
capture_period = max(last_capture_duration * 100 / 50, requested_frame_duration_)
capture_timer_->Start(capture_period - last_capture_duration, OnCaptureTimer)
```

**What "capture duration" covers.** It runs from `CaptureFrame()` until delivery to the client has finished, because `ScheduleNextCaptureFrame()` is called at the end of `OnCaptureResultLegacy` (l.1114) [source]. That includes:

- the WGC work below;
- the CPU `libyuv::ARGBToI420` conversion and `I420Scale` when the source is larger than the requested size;
- the hand-off to the client.

This corrects the earlier research, which called this a "CPU" budget. It is wall-clock time, including blocking waits. The issue's CL author measured 3.66 ms elapsed but only 0.75 ms of CPU for one capture at 1080p, using the GPU-texture path [reported, CL [8689850](https://chromium-review.googlesource.com/c/chromium/src/+/8689850)].

**Zero-copy paths are off by default** [source]:

| Flag | Default | Location |
|---|---|---|
| `kWebRtcAllowWgcUsingTexture` | `FEATURE_DISABLED_BY_DEFAULT` | `media/webrtc/webrtc_features.cc` l.27 |
| `kZeroCopyDesktopCapture` | `FEATURE_DISABLED_BY_DEFAULT` | `media/base/media_switches.cc` l.1106 |

So every frame:

- is copied GPU → staging texture;
- is mapped with a blocking `D3D11_MAP_READ` (`wgc_capture_session.cc` l.629–637);
- is `memcpy`'d row by row into a CPU frame (l.721–733).

**Polling, not event-driven** [source, `modules/desktop_capture/win/wgc_capture_session.cc`]:

- The frame pool is created free-threaded with `kNumBuffers = 2` (`.h` l.75; `.cc` l.281).
- A `FrameArrived` handler is attached **only to wait for the first frame** and removed straight after (l.344–383).
- After that, each Chromium timer tick calls `ProcessFrame()`, which calls `TryGetNextFrame()` once (l.516).
- **`MinUpdateInterval` is never set.** The session code sets `IsCursorCaptureEnabled`, `IsBorderRequired` and `IncludeSecondaryWindows` and nothing else (l.296–329). That holds on both 8103 and `main`.
  - The earlier research left "whether Chromium sets it" as [unverified]. It does not.

**When the pool is empty** [source]:

1. `TryGetNextFrame()` returns null and `ProcessFrame()` returns `E_FAIL` with `kFramePoolEmpty` (l.523–534).
2. `EnsureFrame()` keeps the existing frame (l.404–407).
3. `GetFrame()` hands that frame back with an **empty updated region**, because `damage_region_` was cleared after the previous delivery (l.475–476).
4. In Chromium, `zero_hertz_is_active` is then true (`desktop_capture_device.cc` l.651–658). The frame is **not delivered** and the next tick is scheduled.

On 24H2+, `DoesWgcSkipStaticFrames()` is true, so every frame WGC does hand over is marked fully damaged without a pixel compare (l.136–138, l.699). The only way a tick delivers nothing during gameplay is an empty pool.

### 1.2 Why WGC produces only 48 frames a second on a 144 Hz monitor

**What the bug report says.** [Issue 565075148](https://issues.chromium.org/issues/565075148), "[WGC] Screen capture capped at 60fps on Win11 24H2+ due to missing MinUpdateInterval configuration", component Blink>MediaStream, opened 2026-09:

- The reporter says that on 24H2+ the default WGC update interval is about 16 ms, so WGC delivers no faster than that whatever the monitor rate or the getDisplayMedia constraints [reported].
- Comment #8 (Chrome test team, 2026-09-25) reproduced it on Stable 154 to Canary 156 on a **144 Hz** Windows machine: **"Delivery FPS was around ~40-45 FPS"** [reported].
- Comments #9 and #10 (a 3840×2160, ~160 Hz display, Edge 154/156) [reported]:
  - getDisplayMedia delivered **~53.3 fps whether 60 or 120 was requested**.
  - Turning on WGC texture capture did not help.
  - A native, timestamp-only WGC test gave **53.33 fps with the default interval and 159.50 fps with `MinUpdateInterval = 0`**.
- Comment #11 explains the 53.33 as 160 Hz / 3: "the default 16 ms `MinUpdateInterval` introduces an extra frame delay whenever a refresh tick falls within that 16 ms window" [reported].
- Comment #12 (2026-10-30) says that "querying the capture session returned a default MinUpdateInterval of 16 ms" and that setting it to 1 ms removed the cap [reported].

**Applied to this machine** [derived]:

| Monitor | Refresh period | First refresh ≥ 16 ms after the last frame | WGC frame rate |
|---|---|---|---|
| 60 Hz | 16.67 ms | 1st | 60 |
| 100 Hz | 10.00 ms | 2nd (20 ms) | 50 |
| **120 Hz** | 8.33 ms | 2nd (16.67 ms) | **60** |
| **144 Hz** | 6.94 ms | **3rd (20.83 ms)** | **48** |
| 160 Hz | 6.25 ms | 3rd (18.75 ms) | 53.3 (matches #9/#10) |
| 165 Hz | 6.06 ms | 3rd (18.18 ms) | 55 (the reporter's "~19 ms between frames", ~55 fps in #12) |
| 240 Hz | 4.17 ms | 4th (16.67 ms) | 60 |

**Caveats.**

- Microsoft Learn documents the property only as a `TimeSpan`, present from SDK 26100 (24H2), with no default and no semantics ([MinUpdateInterval](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.minupdateinterval)) [doc].
- So the 16 ms default and the "first refresh after the interval" rule come from the reports above, not from Microsoft.
- The 120 Hz row has only 0.67 ms of margin. A third-party crate that set 16.66 ms (not 16) saw ~52 fps at 120 Hz ([windows-capture #190](https://github.com/NiiightmareXD/windows-capture/issues/190)) [reported]. Test it (1.B).

**Window and monitor capture.** The owner sees 48 for both. That fits: `MinUpdateInterval` is a property of the capture session, and Chromium creates both kinds of session through the same `WgcCaptureSession::StartCapture` without setting it [source].

**Precondition.** The property only exists on Windows 11 24H2 (build 26100) and later [doc]. If the PC is on 23H2 or older, this explanation does not apply; check with test 1.A.

### 1.3 Why the tick is ~17.3 ms when 60 fps is asked

The timer delay is `capture_period − last_capture_duration`, which is about 14–15 ms at 60 fps. Three things push the actual tick later [source]:

1. **Rounding up to whole milliseconds.**
   - `MessagePumpForUI::WaitForWork` sleeps in `MsgWaitForMultipleObjectsEx` for `GetSleepTimeoutMs()`.
   - That is `(next_task_time - now).InMillisecondsRoundedUp()` (`base/message_loop/message_pump_win.cc` l.41–57, l.315–335).
   - This adds 0–1 ms.
2. **Waking on the system timer tick.**
   - The wait ends on a system timer tick, which is **1 ms** while Chromium holds the high-resolution timer on AC power. It would be 8 ms on battery (`base/time/time_win.cc` l.122–139).
   - This adds up to about another 1 ms.
3. **No leeway on Windows.** With `kAlignWakeUps` disabled, the run time on Windows is the earliest time, with no added leeway (`base/message_loop/message_pump.cc` l.252–278; `base/task/task_features.cc` l.43).

So every 16.67 ms period lands roughly 0.5–1 ms late. The owner's 17.0–17.5 ms peak matches [derived].

**A Windows 11 hazard to know about.** Since Windows 11, "if a window-owning process becomes fully occluded, minimized, or otherwise invisible or inaudible to the end user, Windows does not guarantee a higher resolution than the default system resolution" ([timeBeginPeriod](https://learn.microsoft.com/en-us/windows/win32/api/timeapi/nf-timeapi-timebeginperiod)) [doc].

- The capture runs in the browser process, which is hidden behind the game while the owner plays.
- If Windows drops it to the 15.6 ms default, ticks would spread out much more widely.
- The owner's histogram shows a clean 1 ms grid, so this did not happen in that test [unverified for the in-game case].

### 1.4 Why one tick in six or seven delivers nothing, and why asking for 72 or 120 still gives 48

**At 60 asked** [derived]:

- Chromium polls about every 17.3 ms (57.8 per second). WGC adds a new frame to the pool about every 20.83 ms (48 per second).
- A poll that lands before the next WGC frame finds the pool empty, so no frame is delivered (§1.1). The next delivered frame then comes 2 ticks (≈34.6 ms) after the last one.
- Expected share of empty ticks: 1 − 48/57.8 ≈ 17%, or one in six.
- The owner measured about 85 gaps of ~34.6 ms against 550 of ~17.3 ms (13%), plus about 86 gaps in other bins. That fits, given that the game's 120 fps does not line up with the 144 Hz refresh.

**At 72 or 120 asked** [derived]:

- Chromium polls faster: `requested_frame_duration_` is 13.9 or 8.33 ms, unless twice the capture duration is longer.
- WGC's output is still capped at 48, so the extra polls simply find the pool empty more often. The delivered average stays at 48.
- This also explains why the earlier "first vsync after the requested interval" model failed. The interval that matters is WGC's fixed 16 ms, not the page's.
- Prediction to check (test 1.C): at 120 asked, gaps cluster near multiples of ~9 ms (about 18 and 27 ms) and still average 20.8 ms.

**Static screen.** With a web page in front and nothing changing, WGC on 24H2+ hands over no frames at all ("returns empty frame when the captured content is unchanged", `desktop_capture_device.cc` l.263–265). Every tick then takes the zero-hertz path, and the rate drops to single digits [source]. That is expected.

**Linux data point (47–51 fps on Helium/Linux).** That path does not use WGC; it uses PipeWire. This research did not establish a cause [unverified]. It may be a coincidence of the same monitor rate, or a similar compositor-side throttle.

### 1.5 Ruled out

| Candidate | Why not |
|---|---|
| Capture CPU/duration budget (`kDefaultMaximumCpuConsumptionPercentage = 50`) | At 60 asked the ticks are at the requested period plus timer rounding, so 2 × duration < 16.7 ms. At 120 asked the budget could slow polling, but the delivered rate is capped upstream anyway. |
| The encoder | The 48 shows up in a capture-only test with no peer connection (owner measurement). |
| Zero-hertz dropping "identical" game frames | On 24H2+ there is no pixel compare (§1.1). Dropped ticks are pool-empty ticks. |
| Cursor | `prefer_cursor_embedded` is true (l.1353), so WGC draws the cursor into the frame. Cursor-only changes add frames; they cannot remove any. |
| Frame pool too small | With 2 buffers and polling faster than production, the pool never fills up. The limit is production. |

### 1.6 What can be done

**The page cannot fix it** [source]:

- `frameRate` (any value), `width`/`height`, `resizeMode`, `displaySurface` (window or monitor), `cursor`: none of these reach `WgcCaptureSession::StartCapture`, which takes only `DesktopCaptureOptions`. There is no frame-rate field in those options in M157.
- **Tab capture** (`displaySurface: "browser"`) uses a different path that does not go through WGC. It cannot capture a game.
- `applyConstraints` after the fact changes only Chromium's timer, not WGC.

**The user or the browser can:**

| Option | Effect | Who | Status |
|---|---|---|---|
| **Set the monitor to 120 Hz (or 60/240 Hz)** while sharing | WGC produces ~60 fps instead of 48 | User, Windows display settings | [derived; test 1.B] |
| Ask for `frameRate: {ideal: 120, max: 120}` (or 90) in getDisplayMedia, then cap the sender with `maxFramerate: 60` | Polling stays faster than WGC's 60 fps, so the full 60 gets through instead of ~57.8 | Page | [derived; test 1.B] |
| G-Sync/VRR, so the panel follows the game at 120 Hz | Possibly the same as 120 Hz | User | [unverified] |
| Firefox as the sharer | Firefox captures screens with DXGI Desktop Duplication, not WGC (earlier research), so this throttle does not apply. Its encoders are software. | User | [unverified for fps] |
| WebRTC CL [512180](https://webrtc-review.googlesource.com/c/src/+/512180) "Use the requested frame rate at WGC startup" | Shortens `MinUpdateInterval` to the requested frame period when it is longer (e.g. a 165 fps request → ~6 ms) | Browser update | Status NEW, Code-Review+1, not merged on 2026-11-16 [source, Gerrit] |
| Chromium CL [8689850](https://chromium-review.googlesource.com/c/chromium/src/+/8689850), restoring `--webrtc-max-cpu-consumption-percentage` | A command-line switch to relax the 50% budget. Only matters above ~120 fps. | User flag, if it lands | Status NEW, not merged [source, Gerrit] |
| Enterprise policy | None found for capture rate | — | [source: nothing in the capture path reads a policy] |

---

## 2. Symptom 2: why OpenH264

### 2.1 The selection path (M157)

1. **The encoder adapter decides hardware or software** [source].
   - `EncoderAdapter::Create` (`third_party/blink/renderer/platform/peerconnection/video_codec_factory.cc` l.112–153) asks whether the **hardware** factory supports the negotiated format.
   - If it does not, the encoder is built from the **software** factory only. For H.264 that is OpenH264.
   - No hardware encoder is created, so nothing ever "falls back" and the name never changes.
2. **The hardware factory's formats come from the GPU's encode profiles** [source].
   - `RTCVideoEncoderFactory`'s formats are built from the Media Foundation encoder's supported profiles (`rtc_video_encoder_factory.cc` l.328–434).
   - For H.264, Media Foundation reports `H264PROFILE_BASELINE`, `MAIN` and `HIGH` for each hardware encoder (`media/gpu/windows/mf_video_encoder_shared_state.cc` l.233–245).
   - `VEAToWebRTCFormat` maps those to the SDP profiles **Baseline (`4200xx`), Main (`4d00xx`) and High (`6400xx`)** (l.108–146). None of these is Constrained Baseline.
3. **Constrained Baseline is only added when a Windows-disabled flag is on** [source].
   - The CBP format (`42e0xx`) is added only by `AddH264ConstrainedBaselineProfileToSupportedFormats` (l.285–313).
   - That function returns early unless `IsH264ConstrainedBaselineProfileAvailableForAcceleratedEncoder()` is true.
   - That function is `base::FeatureList::IsEnabled(kPlatformH264CbpEncoding)` (`webrtc_util.cc` l.127–135).
   - The flag is `FEATURE_DISABLED_BY_DEFAULT` under `IS_WIN` and enabled on Linux, ChromeOS and Android (`webrtc_util.cc` l.29–38). It is the same on `main`.
4. **NVIDIA is skipped for CBP anyway.**
   - If CBP were enabled, `MediaFoundationVideoEncodeAccelerator::ActivateAsyncEncoder` would still skip NVIDIA for it:

     ```cpp
     // Skip NVIDIA GPU due to https://crbug.com/1088650 for constrained
     // baseline profile H.264 encoding, and go to the next instance according
     // to merit value.
     if (codec_ == VideoCodec::kH264 && is_constrained_h264 &&
         vendor == DriverVendor::kNvidia) {
     ```

     (`media/gpu/windows/media_foundation_video_encode_accelerator_win.cc` l.1456–1462 on 8103; present on `main`) [source].
   - crbug.com/1088650 is not publicly viewable (the tracker returns "permission denied"), so the underlying NVIDIA defect is not documented publicly [source].
   - **Enabling `--enable-features=PlatformH264CbpEncoding` would therefore not help on this PC.** The NVIDIA encoder would be skipped and initialisation would fall back to OpenH264 [source, derived].

**The owner's `mediaCapabilities.encodingInfo` results match this exactly:**

| Codec | Profile | Hardware |
|---|---|---|
| H.264 | `42e01f` (CBP) | false |
| H.264 | `4d001f` (Main) | true |
| H.264 | `64001f` (High) | true |
| H.265 | — | true |
| VP8, VP9, AV1 | — | false |

That is: CBP missing, Main and High present, HEVC present (§3.1 of the earlier research), VP9 and AV1 off as the earlier research found.

**General or NVIDIA-specific?**

- **Every GPU on Windows** (Intel, AMD, NVIDIA): CBP encodes in software by default, because of the disabled flag.
- **NVIDIA only:** the second block, which applies even with the flag on.
- **Non-constrained Baseline (`42001f`):** neither block applies [source]. Whether NVIDIA's Media Foundation encoder accepts `eAVEncH264VProfile_Base` was not established [unverified; test 2.A].

**This corrects the earlier research.** It said "Hardware H.264 encoding is on by default through Media Foundation". That is true for Baseline, Main and High, but **not for Constrained Baseline**, which is what most SFUs and Firefox negotiate by default.

### 2.2 Why the SFU picked 42e01f

`preferCodec()` passes every H.264 entry from `RTCRtpSender.getCapabilities("video")` in browser order. Two factors decide which one wins:

1. **The offer contains every H.264 entry.** Chromium's list combines the software formats with the hardware ones:
   - libwebrtc's software list (`modules/video_coding/codecs/h264/h264.cc` l.98–108) is `42001f` and `42e01f` (each in packetization modes 1 and 0) plus `4d001f`.
   - The hardware list adds `640032`, High at the GPU's maximum level [source].
2. **The SFU chooses.** Cloudflare's SFU answered with `42e01f`. Its documentation lists only "H.264" as supported, with no profiles ([limits](https://developers.cloudflare.com/realtime/sfu/limits)) [doc]. Why it prefers CBP is not documented [unverified]. It may simply take CBP, the WebRTC mandatory-to-implement profile.

**Things that had no effect** [source]:

| Candidate | Why it did not matter |
|---|---|
| Starting at 640×360 | The only resolution-based forced fallback in libwebrtc (`video_encoder_software_fallback_wrapper.cc` l.44–80) applies at ≤ 320×240 and is opt-in through a field trial. The NVIDIA Media Foundation minimum is 146×50 (`mf_video_encoder_util.cc` l.573–576). |
| `contentHint: "motion"` | Changes only the content type (camera or display), which selects rate-control details (`media_foundation_video_encode_accelerator_win.cc` l.170–175, l.1694–1705), not the encoder. |
| `maxFramerate` above 60 | Not an input to encoder selection. Media Foundation H.264 allows up to "2K & 172fps" (earlier research). |
| `scalabilityMode` L1T1 | Every hardware profile lists `kL1T1` (`mf_video_encoder_shared_state.cc` l.203–207). |

**Stickiness, for completeness.** If a hardware encoder fails at runtime, `VideoEncoderSoftwareFallbackWrapper` moves to `kFallbackDueToFailure`. It returns to the hardware encoder only after `Release()` and a new `InitEncode()` (l.288–298, l.360–375) [source]. That did not happen here.

### 2.3 Sending Main or High: caveats

**B-frames** [source and doc]:

- Chromium sets `require_low_delay = true` for every WebRTC hardware encoder (`media/video/video_encode_accelerator.h` l.358–360). Media Foundation then gets `CODECAPI_AVLowLatencyMode` (`media_foundation_video_encode_accelerator_win.cc` l.1855–1861).
- Microsoft: in low-latency mode "the encoder is expected to not add any sample delay due to frame reordering … B slices/frames can be present as long as they do not introduce any frame re-ordering" ([CODECAPI_AVLowLatencyMode](https://learn.microsoft.com/en-us/windows/win32/medfound/codecapi-avlowlatencymode)) [doc].
- Chromium explicitly zeroes the B-frame count only for Qualcomm (l.1882–1893) [source].
- Reordered B-frames should therefore not appear. A Main or High stream from NVIDIA should still be checked once at the receiver for stutter or decode errors [unverified].

**Chromium viewers:**

- Main and High are in Chromium's receive capabilities.
- The owner already sees H.264 decoded with `D3D11VideoDecoder`, which handles Main and High [unverified per profile, but standard].
- Use High `640032` or Main `4d001f`. Either avoids both CBP blocks.

**Firefox viewers.** Firefox's H.264 codecs are:

- CreateDefaultH264_0/_1: `42e01f`, packetization modes 0 and 1;
- CreateDefaultH264Baseline_0/_1: `42001f` (`dom/media/webrtc/jsep/JsepCodecDescription.h` l.670–733).

`ParametersMatch` rejects a remote H.264 format whose sub-profile differs from its own (l.1398–1415). **So a Firefox viewer cannot negotiate Main or High** [source, Firefox `main`]. The earlier research's note still applies: Firefox advertises level 3.1, and as a *sender* caps itself to the receiver's level. As a receiver, nothing in this research shows Firefox rejecting a stream above its advertised level [unverified].

**Chromium as a sender and H.264 levels.** The prototype sent 1920×1080 at 60 fps under `42e01f`, which is level 3.1 (nominally 720p30). So Chromium 157 does not cap its send resolution or frame rate to the negotiated H.264 level [owner measurement]. Main `4d001f` is also level 3.1, so the same holds.

**Cloudflare SFU.**

- The SFU forwards RTP. Each viewer's session must negotiate the same payload format as the publisher's track.
- Whether Cloudflare's SFU passes Main or High `profile-level-id` through to subscribers was not documented [unverified; test 2.B].

**Mixed groups:**

| Group | What to send |
|---|---|
| All Chromium viewers | Main or High |
| Includes Firefox viewers | Baseline `42001f`, if test 2.A shows it is hardware on NVIDIA. Otherwise VP8 for the Firefox viewers (software encode on the sharer), or accept CBP over OpenH264. |

**Page code.** Filter by `sdpFmtpLine`:

```js
const caps = RTCRtpSender.getCapabilities("video").codecs;
const h264 = caps.filter(c => c.mimeType === "video/H264" &&
  /profile-level-id=(4d|64)/i.test(c.sdpFmtpLine ?? "") &&      // Main or High
  /packetization-mode=1/.test(c.sdpFmtpLine ?? ""));
const helpers = caps.filter(c => /rtx|red|ulpfec/i.test(c.mimeType));
transceiver.setCodecPreferences([...h264, ...helpers]);
```

For the Firefox-compatible variant, match `profile-level-id=4200` instead of `(4d|64)`. It must not match `42e0`.

---

## 3. Confirming tests (each under two minutes)

### Symptom 1

**1.A Windows build.**

- Run `winver`.
- Build **26100 or higher** (24H2/25H2) means the `MinUpdateInterval` explanation applies. Lower means it does not, and this research must be revisited.

**1.B Refresh rate.**

1. In Settings → Display → Advanced display, set the monitor to **120 Hz**.
2. Rerun the owner's capture-only `MediaStreamTrackProcessor` test (window capture, 15 s) twice: once with `frameRate` 60 and once with 120.

| Asked | Expected average | Expected gaps |
|---|---|---|
| 60 | ~57–58 fps (poll-limited) | Mostly ~17.3 ms, almost no 34 ms gaps |
| 120 | ~60 fps | Mix of ~9 and ~18 ms, average 16.7 ms |

3. Then try 60 Hz: expect ~57–60.

If 120 Hz still gives 48, the WGC explanation is wrong.

**1.C 120 asked at 144 Hz.** At 144 Hz, run the capture-only test with `frameRate` 120.

- **Expected:** average ~48 fps, with gaps clustered around 18 and 27 ms (two or three ~9 ms ticks) rather than 17 and 34.
- This shows the cap is upstream of Chromium's timer.

**1.D Optional cross-check.** Capture the same monitor from Firefox with `frameRate` 60 and read `media-source.framesPerSecond`. Firefox uses DXGI, not WGC, so more than 48 would confirm the cause [unverified].

### Symptom 2

**2.A Baseline on NVIDIA.** In the DevTools console:

```js
await navigator.mediaCapabilities.encodingInfo({type: "webrtc", video: {
  contentType: 'video/H264; profile-level-id=42001f; packetization-mode=1',
  width: 1920, height: 1080, bitrate: 12e6, framerate: 60}})
```

`powerEfficient: true` means `42001f` is hardware-encodable and is the Firefox-compatible choice.

**2.B Main through the SFU.**

1. In `preferCodec()`, keep only entries whose `sdpFmtpLine` matches `profile-level-id=4d` (as in §2.3) and share.
2. **Sender, expected:**
   - `outbound-rtp.encoderImplementation` contains `MediaFoundationVideoEncodeAccelerator` (or reads `ExternalEncoder`), not `OpenH264`.
   - `powerEfficientEncoder` is true.
   - The negotiated fmtp shows `4d001f`.
3. **Viewer (Chromium), expected:** `decoderImplementation` is `ExternalDecoder (D3D11VideoDecoder)` and the picture plays without errors.
4. If the SFU rejects the offer, its H.264 support is CBP-only [unverified until run].

**2.C GPU page.** In `chrome://gpu`, under "Video Acceleration Information", the "Encoding" list should show H.264 Baseline, Main and High. The CBP absence comes from the WebRTC-layer flag, not from the GPU page.

---

## 4. Corrections to `docs/research/capture-quality.md`

| Earlier claim | Correction |
|---|---|
| "Capture runs up to 120 fps if asked" | On Windows 11 24H2+, WGC's default `MinUpdateInterval` (~16 ms, reported) caps delivery at ≤ 60 fps. That becomes refresh/3 on 144–165 Hz monitors. Chromium 157 does not set the property. |
| "Whether Chromium sets [`MinUpdateInterval`] was [unverified]" | It does not (§1.1) [source]. |
| Capture pacing described as a "CPU budget" | It is elapsed wall-clock time from capture start to the end of delivery, including blocking map and conversion (§1.1). |
| "Hardware H.264 encoding is on by default through Media Foundation" | True for Baseline, Main and High. **Constrained Baseline (`42e01f`) is software (OpenH264) on Windows** for all GPUs (`kPlatformH264CbpEncoding` off), and NVIDIA is additionally excluded for CBP (§2.1). |
