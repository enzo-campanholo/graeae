# Research: capture and encoding quality for 1080p60 gameplay screen share

**Question.** Can a browser on Windows capture and send a 1080p 60fps screen share of gameplay from the same machine that is running the game, and what does it take? Answered for Chromium-based browsers and Firefox.

**Researched:** 2026-11-15. Versions in scope:

| Browser | Stable on 2026-11-15 | Source read |
|---|---|---|
| Chrome / Chromium | 158.0.8127.x (stable since 2026-11-12, per [chromiumdash](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=3)) | `chromium/src` `main` and `branch-heads/8127` (M158). The key flags and constants checked are identical on both. |
| libwebrtc (used by Chrome and Firefox) | — | `webrtc.googlesource.com/src` `main` |
| Firefox | 160.0 (released 2026-11-10, per [product-details](https://product-details.mozilla.org/1.0/firefox_versions.json)) | `mozilla-central` tip (162 Nightly) and `mozilla-release` tip (160.0.1) for the claims marked "release". |

**Verification labels.** **[source]** means read directly in browser source or a spec on the date above. **[doc]** means taken from official documentation. **[reported]** means a third-party report that was not reproduced. **[unverified]** means not confirmed; a prototype must check it. Nothing here was run on a Windows machine, so every runtime claim still needs the prototype check in [How to measure](#how-to-measure-with-getstats).

This document lays out facts and trade-offs. It does not choose between a direct browser-to-browser design and a media server.

---

## 1. Summary

- **Chromium on Windows can do 1080p60, but only with app-side settings.** Capture runs up to 120 fps if asked: the default is 30 fps, so `frameRate` must be requested [source]. Out of the box, libwebrtc caps any video sender at or above 960×540 to **2.5 Mbps** [source]. That cap is too low for 1080p60 gameplay, so the app **must set `maxBitrate`**. Hardware H.264 encoding is on by default through Media Foundation [source]. Hardware AV1 encoding is **off by default on Windows** [source]. HEVC is hardware-only and only Chrome has it [source].
- **Firefox on Windows can request 60 fps, but 1080p60 is much harder.** Screen capture uses DXGI Desktop Duplication, not WGC [source]. Capture is limited to 50% of one capture thread's time [source]. All WebRTC encoding is **software** by default on desktop: libvpx, libaom, or OpenH264 [source]. Firefox has **no `contentHint`, no `scalabilityMode` and no screen-audio capture** ([MDN BCD](https://github.com/mdn/browser-compat-data)). Its default bitrate cap at 720p–1080p is **5 Mbps** [source]. When **Firefox sends H.264**, it caps itself to the receiver's advertised H.264 level. Firefox's own default advertised level is 3.1, which is about 720p30 [source].
- **Exclusive-fullscreen games are a Windows problem, not a browser one.** On Windows 11 24H2+, both DXGI and WGC capture reportedly freeze on exclusive-fullscreen games [reported]. Borderless or windowed fullscreen is the reliable setup.
- **One sender encodes once per viewer connection.** In a mesh, each viewer costs a full extra 1080p60 encode and extra upload.

---

## 2. Capture: does `getDisplayMedia` give 1080p60?

### 2.1 What the spec allows

Per the [Screen Capture spec](https://w3c.github.io/mediacapture-screen-share/) (Editor's Draft, read 2026-11-15) [doc]:

- **`width`, `height`, `frameRate`:**
  - These are applied *after* the user picks a surface. They never filter the picker.
  - `min` and `exact` are a `TypeError` in `getDisplayMedia()`, but allowed in `applyConstraints()`.
  - Use `ideal` or `max`.
  - The UA may downscale (`resizeMode: "crop-and-scale"`) and decimate frames. It must never upscale or create extra frames, so the output never exceeds the source's rate.
- **`displaySurface`** (`monitor` / `window` / `browser`) is only a picker hint. Read back `track.getSettings().displaySurface` to learn what the user picked.
- **Options** such as `selfBrowserSurface`, `surfaceSwitching`, `monitorTypeSurfaces`, `systemAudio`, `windowAudio` and `controller` are hints the UA may ignore.
- **Gesture:** each call needs a user gesture (transient activation).

### 2.2 Chromium (Chrome / Edge) on Windows, M158

| Fact | Detail | Status |
|---|---|---|
| Default capture rate | `kDefaultScreenCastFrameRate = MediaStreamVideoSource::kDefaultFrameRate` (30). Without a constraint you get 30 fps. | [source] [`media_stream_constraints_util_video_content.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_video_content.cc) |
| Max capture rate | `kMaxScreenCastFrameRate = 120.0` | [source] same file |
| Default capture size | 2880×1800 max. Request `width`/`height` to downscale (e.g., a 1440p monitor to 1080p). | [source] same file |
| Capture pacing | Timer-driven at the requested rate. Each capture period is `max(requested interval, last_capture_duration × 100/50)`, so if a single capture takes over half the frame interval, fps drops below the request (`kDefaultMaximumCpuConsumptionPercentage = 50`). | [source] [`desktop_capture_device.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/media/capture/desktop_capture_device.cc) |
| Screen capturer | WGC for **whole-screen** capture **only on Windows 11 24H2+** (`GetVersion() >= WIN11_24H2`). The code notes the API "returns empty frame when the captured content is unchanged" from build 26100. On older Windows, screen capture uses the DXGI/GDI path inside libwebrtc. | [source] same file |
| Window capturer | WGC window capture is always allowed. `kWebRtcWgcWindowCroppingFallback` (enabled) falls back to a cropping capturer if WGC fails. | [source] same file and [`webrtc_features.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/webrtc/webrtc_features.cc) |
| Zero-hertz | Enabled for WGC window capture and WGC screen capture. Unchanged frames are dropped, so a static scene produces **fewer than 60 fps by design**. Gameplay normally changes every frame. | [source] `desktop_capture_device.cc` |
| Screen audio | Chrome on Windows can capture **whole-system audio when sharing an entire screen**, and tab audio. `windowAudio` (M141) supports only `"exclude"` and `"system"`, so per-window audio is not available. | [doc] MDN BCD `api.MediaDevices.getDisplayMedia.audio_capture_support`, `windowAudio_option` |

Request it like this:

```js
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { frameRate: { ideal: 60, max: 60 }, width: { max: 1920 }, height: { max: 1080 } },
  audio: true,            // Chromium/Windows: system audio for whole-screen shares
  systemAudio: "include",
});
```

Then check `stream.getVideoTracks()[0].getSettings().frameRate`.

### 2.3 Firefox on Windows, 160

| Fact | Detail | Status |
|---|---|---|
| Default capture rate | `media.navigator.video.default_fps = 30` | [source] `modules/libpref/init/all.js` |
| Requested rate | For screen, window and browser engines, `maxFPS` is the constrained frame rate (default 30), capped at **120**. Capture polls on a timer at that rate. | [source] [`MediaEngineRemoteVideoSource.cpp`](https://searchfox.org/firefox-main/source/dom/media/webrtc/MediaEngineRemoteVideoSource.cpp) (`probablyNativeFramerate = 60`, `cap = 120`) |
| Capture CPU budget | `kMaxDesktopCaptureCpuUsage = 50`. Sleep time is the capture duration scaled to keep capture under 50% of the thread, so slow captures lower the fps. | [source] `dom/media/systemservices/video_engine/desktop_capture_impl.{h,cc}` |
| Capturer | `media.webrtc.capture.allow-directx = true`, `media.webrtc.capture.screen.allow-wgc = false`, `media.webrtc.capture.window.allow-wgc = false`, `wgc.allow-zero-hertz = false`. **Firefox on Windows uses DXGI Desktop Duplication for screens and the cropping window capturer for windows, not WGC.** | [source] `StaticPrefList.yaml`, `desktop_capture_impl.cc` |
| Screen audio | **Not supported.** `getDisplayMedia` audio is `version_added: false`. | [doc] MDN BCD |
| `getDisplayMedia` options | `controller`, `systemAudio`, `selfBrowserSurface`, `surfaceSwitching`, `monitorTypeSurfaces` are all unsupported. | [doc] MDN BCD |
| Historic bug | `frameRate` passed in the `getDisplayMedia()` call was ignored, but honored in a later `applyConstraints()`: [bug 1759734](https://bugzilla.mozilla.org/show_bug.cgi?id=1759734), now RESOLVED. | [doc]. Calling `applyConstraints({frameRate: 60})` after capture starts is a cheap safety net. |

The cropping window capturer captures the screen region under the window. Overlapping windows can show through it. That is upstream libwebrtc behaviour and was not tested here [unverified for current Firefox].

### 2.4 Exclusive fullscreen vs borderless; window vs screen

- **Exclusive fullscreen:**
  - On Windows 11 24H2 and later, capture of exclusive-fullscreen apps freezes after the first frame with **both DXGI and WGC** ([OBS issue #14021](https://github.com/obsproject/obs-studio/issues/14021), 2026-10-11).
  - An OBS maintainer reproduced it with Microsoft's own WGC sample and called it "an issue with the Microsoft API itself." The same report links a forum post saying Discord screen share breaks the same way. [reported]
  - Browsers have nothing like OBS's game-hook "Game Capture," so a web app cannot work around it.
  - A third-party app found that sharing a game in fullscreen fails in Chromium while borderless works. It detects the case with `SHQueryUserNotificationState` plus black-frame and no-frame detection, and warns the user ([rafaelcg/pqp PR #946](https://github.com/rafaelcg/pqp/pull/946)). [reported; that PR says it was not run on Windows]
- **Borderless / windowed fullscreen:** goes through DWM composition, so both screen and window capture see it. This is the setup to tell users to use. [reported, consistent with the above]
- **Window vs whole-screen capture:**
  - In Chromium, window capture uses WGC on all supported Windows versions [source]. It follows the window when it is covered or moved. If WGC fails, it falls back to a cropping capturer [source].
  - Whole-screen WGC capture needs Win11 24H2+; older versions use DXGI [source].
  - In Firefox, screen capture uses DXGI and window capture uses the cropping capturer (§2.3).
  - Window capture of a game window works only when the game is borderless or windowed (see above).
- **Capture rate under GPU load:**
  - Each WGC delivery is a DWM copy on the same 3D engine the game is saturating.
  - Third-party projects report WGC delivering fewer frames as game GPU load rises. One example: 144 → ~100 fps at about 50% GPU ([Win32CaptureSample #82](https://github.com/robmikh/Win32CaptureSample/issues/82)). Another reports ~45 fps with a 16.6 ms `MinUpdateInterval` on a 60 Hz screen ([windows-capture #190](https://github.com/NiiightmareXD/windows-capture/issues/190)). [reported]
  - `GraphicsCaptureSession.MinUpdateInterval` exists from Windows SDK 26100 ([Microsoft Learn](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.minupdateinterval)). The page documents no default or semantics.
  - Whether Chromium sets it was **[unverified]**.
  - **Expect delivered fps to drop below 60 when the game is GPU-bound.** Capping the game's frame rate (e.g., vsync, or a cap a little below the monitor rate) leaves headroom. This is a well-known mitigation, but it is not established by a primary source here.

---

## 3. Codecs: what each browser encodes, and on what hardware

### 3.1 Chromium on Windows (M158)

| Codec | WebRTC send | Hardware encode on Windows | Software fallback |
|---|---|---|---|
| **H.264** | Yes | **Yes, by default.** Media Foundation encoder (`kMediaFoundationVideoEncodeAccelerator` enabled; `kWebRtcHWEncoding` enabled). NVIDIA NVENC, AMD VCN/VCE and Intel Quick Sync all expose H.264 MFTs. The level is computed from the GPU's reported max resolution and fps, with `level-asymmetry-allowed=1`. | OpenH264 (`IsOpenH264SoftwareEncoderEnabledForWebRTC`) |
| **VP8** | Yes | No | libvpx |
| **VP9** | Yes | MF VP9 encoder exists. Per Chromium's MF code, "Only eAVEncVP9VProfile_420_8 is supported on Intel graphics"; NVENC has no VP9 encoder ([NVIDIA matrix](https://developer.nvidia.com/video-encode-decode-support-matrix)). In practice, **Intel only**. Whether Chrome picks the HW VP9 encoder over libvpx for WebRTC is **[unverified]**. | libvpx |
| **AV1** | Yes (since M89; faster libaom from M113, [Chrome blog](https://developer.chrome.com/blog/av1)) | **Off by default on Windows:** `kWebRtcAV1HWEncode` is `FEATURE_DISABLED_BY_DEFAULT` under `IS_WIN` (enabled elsewhere). That holds on both `main` and M158. A Finch field trial could turn it on [unverified]. | libaom (software) |
| **H.265/HEVC** | Yes, since **M136** ([intent to ship, 2025-03-03](https://groups.google.com/a/chromium.org/g/blink-dev/c/3h8lL8a377c)). `kWebRtcAllowH265Send/Receive` enabled. | **Hardware only, no software fallback.** The intent estimates "75% Windows" endpoints have HW HEVC support. | None. HEVC is negotiated only if both ends support it. |

Sources: [`rtc_video_encoder_factory.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder_factory.cc), [`webrtc_features.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/webrtc/webrtc_features.cc), [`media_switches.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/media_switches.cc), [`mf_video_encoder_util.{h,cc}`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/mf_video_encoder_util.h), [`media_foundation_video_encode_accelerator_win.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc). All [source].

**Hardware encode details:**

- **Per-codec MF ceilings [source]:**
  - H.264: level 5.2, i.e. "2K & 172fps, or 4K & 64fps".
  - VP9: 180 fps.
  - HEVC/AV1: 2K/4K at 300 fps.
  - Without a driver report, the fallback is 1920×1080 at the default frame rate.
  - 1080p60 is within the HW limits.
- **Temporal-layer limits in the MF encoder [source]:**
  - x86 (32-bit) builds: 1 layer.
  - NVIDIA HEVC: 1.
  - AV1 on non-Intel: 1.
  - Intel VP9: may be limited to 1 by a driver workaround.
  - Others: up to 3.
- **Effect on `scalabilityMode`:** if the app requests a `scalabilityMode` the hardware profile lacks, Chromium may start in software ([BhayanakCast #126](https://github.com/theHimanshuShekhar/BhayanakCast/issues/126) [reported]).
- **Rule for gameplay on hardware:** stick to `L1T1` for HW H.264, or don't set `scalabilityMode` at all.

**GPU encode support by vendor:**

| Vendor | H.264 | HEVC | VP9 | AV1 | Source |
|---|---|---|---|---|---|
| NVIDIA NVENC | All since Maxwell 1 | Maxwell 2+ | **Not supported** | Ada (RTX 40) and later | [NVIDIA support matrix](https://developer.nvidia.com/video-encode-decode-support-matrix) [doc]. GeForce limit: **12 concurrent sessions**. |
| AMD | Yes | Yes | No | RDNA3+ ("Zen5+" per thread) | blink-dev HEVC thread comments [reported]; no AMD primary source read. AMD AV1 level is capped at 6.0 in Chromium's MF code [source]. |
| Intel | Yes | Yes | Yes (MF, profile 0) | Arc / Core Ultra and later | blink-dev HEVC thread [reported]; Chromium MF code [source] for VP9. |

### 3.2 Firefox on Windows (160)

| Codec | WebRTC send | Encoder used by default (desktop) | Notes |
|---|---|---|---|
| VP8 | Yes | libvpx (software) | First in Firefox's default offer order |
| VP9 | Yes (`media.peerconnection.video.vp9_enabled = true`) | libvpx (software) | Second in offer order. Screen-share VP9 is forced to 1 spatial layer. |
| H.264 | Yes | **OpenH264 via GMP (software)**, downloaded from Cisco | A HW platform encoder exists (`media.webrtc.hw.h264.enabled = true`), but `media.webrtc.encoder_creation_strategy = 0` on desktop means "prefer builtin WebRTC encoder (including OpenH264 via GMP)". HW is used only when no builtin encoder exists. |
| AV1 | Yes (`media.webrtc.codec.video.av1.enabled = true`) | libaom (software) | Last in offer order (`av1.experimental_preferred = false`). The platform-encoder path does not support AV1 yet (bug 1980201). |
| HEVC | **No** | — | `kVideoCodecH265` hits `MOZ_CRASH("Unimplemented codec")` in the encoder factory. |

Sources: [`StaticPrefList.yaml`](https://searchfox.org/firefox-main/source/modules/libpref/init/StaticPrefList.yaml), `dom/media/webrtc/libwebrtcglue/WebrtcVideoCodecFactory.cpp`, `WebrtcMediaDataEncoderCodec.cpp`, `MediaDataCodec.cpp`, `dom/media/webrtc/jsapi/DefaultCodecPreferences.cpp`. All read from mozilla-central; the prefs and `SupportsCodec` were also checked against mozilla-release 160. [source]

**So Firefox on Windows encodes every codec in software by default.** A 1080p60 software encode on a machine that is also running a game is the main Firefox risk (§6).

### 3.3 Interop between a Chromium sender and a Firefox viewer, and the reverse

| Codec | Chromium → Firefox | Firefox → Chromium |
|---|---|---|
| H.264 | Works; Chromium can use HW. **Firefox advertises `profile-level-id` with level 3.1** (`media.navigator.video.h264.level = 31`, about 1280×720 at 30 fps). Whether Chromium's libwebrtc limits its *sending* resolution or fps to the receiver's H.264 level is **[unverified]**; test it. | Works, but **Firefox caps its own send to the remote's H.264 level** (see below). Firefox encodes with OpenH264 in software. |
| VP8 | Works (software on both) | Works |
| VP9 | Works (Chromium libvpx, or Intel HW [unverified]) | Works (Firefox libvpx) |
| AV1 | Works (Chromium libaom SW on Windows; Firefox decodes with dav1d) | Works (Firefox libaom SW) |
| HEVC | **Not available**; Firefox has no WebRTC HEVC | **Not available** |

**The Firefox H.264 level cap.** Firefox computes a send frame-rate ceiling from the negotiated H.264 level:

- `levelMaxFps = maxMbps / maxFs` (H.264 Annex A Table A-1).
- When the remote doesn't signal explicit `max-fs`/`max-mbps`, the level's limits fill them in.
- This is in both mozilla-central and mozilla-release 160 (`JsepCodecDescription.h`, `VideoConduit.cpp`) [source].
- At level 3.1, the limits are 3600 macroblocks per frame (1280×720) and 108,000 macroblocks per second, i.e. **720p at 30 fps**.

The consequences:

- Firefox → Firefox over H.264 is capped at 720p30, because Firefox advertises level 3.1.
- Firefox → Chromium over H.264 depends on the level Chromium advertises on the chosen payload type:
  - Chromium's HW H.264 formats carry a level derived from the GPU's maximum, which can be high.
  - Its software (OpenH264) formats come from libwebrtc's defaults, which are commonly level 3.1 [unverified].
  - Which payload type wins is decided in SDP negotiation, which was not examined here [unverified].
- **To send 1080p60 from Firefox, prefer VP9, VP8 or AV1.** Firefox applies no level-based cap for VP8/VP9 unless the remote signals `max-fs`/`max-fr`.
  - AV1 has a level cap from `level-idx`. The AV1 RTP spec default is level 5.1, which allows 1080p60 (Annex A).

**Choosing the codec.** Use `RTCRtpTransceiver.setCodecPreferences()` (both browsers), or the per-encoding `codec` in `setParameters()` (Chrome 119, Firefox 142; [MDN BCD](https://github.com/mdn/browser-compat-data)).

---

## 4. The settings that decide screen-share quality

### 4.1 `contentHint`

**Spec** ([mst-content-hint](https://w3c.github.io/mst-content-hint/)) [doc]:

- `"motion"` is for "webcam video, movies or games": it preserves frame rate over detail and maps to `maintain-framerate`.
- `"detail"` and `"text"` map to `maintain-resolution`.

**Chromium/libwebrtc [source]:**

- The screen-capture source is marked `is_screencast`.
- In `VideoRtpSender::SetSend()` ([`pc/rtp_sender.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/pc/rtp_sender.cc)), `kFluid` (`"motion"`) sets `is_screencast = false`, and `kDetailed`/`kText` set it to `true`.
- In [`webrtc_video_engine.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/media/engine/webrtc_video_engine.cc), screencast content (or `detail`/`text`) means:
  - `content_type = kScreen`
  - `MAINTAIN_RESOLUTION` degradation
  - automatic resize disabled
  - denoising off
- **So a Chromium screen share with no hint is treated as slides: it keeps resolution and drops frames.** For gameplay, set `track.contentHint = "motion"`. That turns it into real-time video: it keeps frame rate, allows downscaling, and switches to the camera-style rate control.

**Firefox: `contentHint` is not supported** (MDN BCD `version_added: false`) [doc]:

- Firefox decides screen-share mode from the track *source* alone (Screen, Window, Application or Browser means `kScreensharing`) [source: `RTCRtpSender.cpp`].
- The default degradation is `MAINTAIN_RESOLUTION` for screensharing and `MAINTAIN_FRAMERATE` otherwise [source: `VideoConduit.cpp`].
- An explicit `degradationPreference` overrides this (see §4.2).

### 4.2 `degradationPreference`

- **Support:** set on `RTCRtpSender.setParameters()` in **Chrome 83+** and **Firefox 138+** [doc, MDN BCD]. `maintain-framerate-and-resolution` is Chrome 144+ and not in Firefox.
- **For gameplay,** set `degradationPreference: "maintain-framerate"` explicitly.
  - In Firefox this is the *only* way to get frame-rate-first behaviour on a screen track, because it lacks `contentHint`.
  - In Chrome it is belt-and-braces alongside `contentHint = "motion"`.
- **Trade-off:** under bandwidth or CPU pressure, `maintain-framerate` lowers resolution (1080p → 720p → …). That matches "smooth motion over sharpness" and the 720p60 floor.

### 4.3 Bitrate caps

**Defaults when the app sets no `maxBitrate` [source]:**

| | ≤320×240 | ≤640×480 | ≤960×540 | larger (720p, 1080p) |
|---|---|---|---|---|
| **libwebrtc / Chromium** ([`encoder_stream_factory.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/video/config/encoder_stream_factory.cc) `GetMaxDefaultVideoBitrateKbps`) | 600 kbps | 1.7 Mbps | 2.0 Mbps | **2.5 Mbps** |

- For screenshare, the table result is raised to at least 1.2 Mbps (`max(max_bitrate, 1200)`); at 720p and 1080p it stays 2.5 Mbps.
- The table applies whether `is_screencast` is true or false.

| Firefox ([`VideoStreamFactory.cpp`](https://searchfox.org/firefox-main/source/dom/media/webrtc/libwebrtcglue/VideoStreamFactory.cpp)) | min / start / max |
|---|---|
| ≥1920×1200 macroblocks | 1.5 / 2.0 / **10** Mbps |
| ≥1280×720 (includes 1080p) | 1.2 / 1.5 / **5** Mbps |
| ≥800×480 | 0.2 / 0.8 / 2.5 Mbps |

- `media.peerconnection.video.max_bitrate = 0`, meaning no extra pref cap.
- Checked in mozilla-release 160 too.

**What this means:**

- Without `encodings[0].maxBitrate`, Chromium will never go above **2.5 Mbps** and Firefox above **5 Mbps** for a 1080p share. Both are below the realistic needs in §5.
- **The app must set `maxBitrate`.** It is honoured by Chrome 69+ and Firefox 46+ [doc].
- The bandwidth estimator (send-side BWE / transport-cc) still decides the actual rate below that cap.

### 4.4 `scalabilityMode` and simulcast for screen content

**`scalabilityMode`:**

- **Support:** Chrome 111+; **not supported in Firefox** [doc, MDN BCD]. The spec is [WebRTC-SVC](https://w3c.github.io/webrtc-svc/) [doc].
  - VP9 and AV1 support every mode.
  - H.264, H.265 and VP8 support temporal modes only (`L1T2`, `L1T3`).
  - Discovery is through Media Capabilities `encodingInfo({..., scalabilityMode})`.
- **Use for gameplay:**
  - `L1T3` (temporal layers) lets an SFU forward 60/30/15 fps to different viewers from one encode.
  - The cost is some compression efficiency, and possibly losing hardware encoding where the MF encoder limits temporal layers (§3.1).
  - Spatial modes (`L2T3`, `L3T3`) let an SFU forward 1080p or 720p from one encode, but only for VP9/AV1, which are software on Windows except Intel VP9.
  - None of this has any value without an SFU. In a mesh, each viewer already gets its own encode.
- **Screenshare SVC in Firefox:** Firefox forces VP9 screen shares to 1 spatial layer [source].

**Simulcast:**

- **Chromium:** with content type `kScreen`, the "boost leftover bitrate to top layer" logic is skipped. "Conference mode" screenshare uses legacy simulcast screenshare at full resolution [source: `encoder_stream_factory.cc`].
- **Gameplay with `contentHint = "motion"`** is no longer `kScreen`, so ordinary camera-style simulcast applies.
  - Each simulcast layer is a separate encode, so 1080p60 + 720p60 + 360p simulcast costs about 1.5–1.7× the encode work of 1080p60 alone, by pixel-rate arithmetic.
- **Firefox:** simulcast is enabled for VP8, VP9, H.264 and AV1 (`media.webrtc.simulcast.*.enabled = true`) via `SimulcastEncoderAdapter` [source].
- **Relevance:** simulcast, like SVC, only pays off with an SFU.

### 4.5 Recommended settings for a prototype (not a decision)

```js
const [track] = stream.getVideoTracks();
if ("contentHint" in track) track.contentHint = "motion";      // Chromium only
const sender = pc.addTrack(track, stream);
// Codec: see §3.3. setCodecPreferences on the transceiver before negotiating.
const p = sender.getParameters();
p.encodings ??= [{}];                                           // Firefox may return no encodings
p.encodings[0].maxBitrate = 8_000_000;                          // pick from §5
p.encodings[0].maxFramerate = 60;
p.degradationPreference = "maintain-framerate";                 // Chrome 83+, Firefox 138+
await sender.setParameters(p);
```

---

## 5. Realistic bitrates

**No primary source gives figures for low-latency WebRTC gameplay specifically.** The closest primary source is YouTube Live's ingest guidance ([YouTube Help, encoder settings](https://support.google.com/youtube/answer/2853702), read 2026-11-15) [doc]:

| | H.264 min | H.264 recommended | AV1 / HEVC min | AV1 / HEVC recommended |
|---|---|---|---|---|
| 1080p60 | 6 Mbps | 17 Mbps | 4 Mbps | 12 Mbps |
| 720p60 | 3 Mbps | 8 Mbps | 2 Mbps | 6 Mbps |
| 720p30 | 3 Mbps | 8 Mbps | 2 Mbps | 6 Mbps |

YouTube's numbers are for broadcast ingest. That uses B-frames, long lookahead and multi-second buffering. **WebRTC real-time encoders use none of these, so they need the same or more bitrate for the same quality.**

**A working range for a prototype to test** [unverified, derived; not measured]:

| Target | H.264 (HW) | VP9 / AV1 (SW) | HEVC (HW, Chromium↔Chromium only) |
|---|---|---|---|
| 1080p60 gameplay | 8–15 Mbps | 6–12 Mbps | 6–12 Mbps |
| 720p60 gameplay | 4–8 Mbps | 3–6 Mbps | 3–6 Mbps |
| 720p30 webcam | 1.5–2.5 Mbps (libwebrtc's own 720p default cap is 2.5 Mbps) | 1–2 Mbps | — |

**Per-codec efficiency:**

- AV1 and HEVC typically save about 25–35% over H.264 at equal quality, as reflected in YouTube's ratio.
- Chrome's own data for libaom AV1 speed 10 vs VP9 speed 7 is "12% better quality at the same bandwidth" for camera video and "45% better compression" for screen sharing ([Chrome blog](https://developer.chrome.com/blog/av1), Chrome 113) [doc].
- "Screen sharing" there means slides and documents, not gameplay.

**Upload arithmetic against the 20 Mbps floor** (the transport decision lives elsewhere):

- In a full mesh with 5 viewers, a sender who shares a 1080p60 screen at 8 Mbps and a 720p30 webcam at 1.5 Mbps needs about **47.5 Mbps** of upload, more than twice the floor.
- With one upload to a media server, the same sender needs about **9.5 Mbps**.

---

## 6. Known problems

1. **Capture frame rate falls when the GPU is saturated.**
   - Capture on Windows (DWM/WGC or DXGI) needs GPU time on the same engine the game uses.
   - Third-party reports show WGC delivery falling with game GPU load [reported].
   - Chromium and Firefox both also slow capture when a capture takes too long (50% CPU-budget rule) [source].
   - Mitigations to test [unverified]:
     - Cap the game's fps below the monitor refresh.
     - Use borderless mode.
     - Capture at 1080p rather than downscaling a 1440p or 4K desktop.
     - Watch `media-source.framesPerSecond` (§8).
2. **The CPU cost of software encoding while gaming.**
   - Firefox encodes everything in software by default (§3.2).
   - Chromium uses software for VP8, AV1 (on Windows), and VP9 (except possibly Intel).
   - A software 1080p60 encode competes with the game for CPU.
   - libwebrtc then lowers resolution or frame rate and reports `qualityLimitationReason = "cpu"` (Chrome only; Firefox doesn't expose it) [doc].
   - No primary source gives CPU-percentage figures for 1080p60 libvpx, libaom or OpenH264 realtime encoding [unverified]. This is the main thing the prototype must measure.
   - **For Chromium senders, hardware H.264 (or HEVC between Chromium peers) is the practical way to avoid this cost.**
3. **Encoding the same share more than once.**
   - Each `RTCRtpSender` on each `RTCPeerConnection` has its own encoder. A mesh with N viewers therefore runs N independent encodes of the same capture (N × 1080p60).
   - That multiplies CPU (software) or HW-session and GPU encode-engine load (hardware). NVIDIA GeForce allows 12 concurrent NVENC sessions [doc]. For example, 5 viewers × (screen + webcam) is 10 sessions, plus any NVENC use by the game, OBS or GeForce overlay.
   - Uploads multiply too (§5).
   - libwebrtc does not share encoders across peer connections. This is consistent with its per-sender `VideoSendStream` design, but no single document says it outright [unverified as a documented guarantee; verify via `totalEncodeTime` per connection].
4. **The default bitrate caps** (§4.3) silently cap quality at 2.5 Mbps (Chromium) or 5 Mbps (Firefox) unless `maxBitrate` is set.
5. **Screen-share defaults keep sharpness, not motion.** Without `contentHint = "motion"` (Chromium) or `degradationPreference = "maintain-framerate"` (both), the browser keeps resolution and drops frames.
6. **The Firefox H.264 level cap** (§3.3) can silently limit a Firefox H.264 sender to 720p30.
7. **No screen audio in Firefox** (§2.3). A Firefox user can share video but not game audio. In Chromium on Windows, audio works only for whole-screen shares (system audio) and tabs, not individual windows.
8. **Exclusive fullscreen** (§2.4) freezes on Windows 11 24H2+.
9. **Zero-hertz capture** (Chromium WGC): a static frame produces no new frames. That is fine for gameplay but confuses fps measurements on menus or pauses.

---

## 7. Do 720p30 webcams add anything notable?

- **Pixel rate:** 1280×720×30 is about **22%** of 1920×1080×60. One webcam encode is a small addition to one screen encode, but it multiplies per viewer in a mesh, just like the screen.
- **Bitrate:** libwebrtc's default cap at 720p is 2.5 Mbps (Chromium) [source]. Firefox's is 5 Mbps max, 1.5 Mbps start [source]. 1.5–2.5 Mbps is a typical working range [unverified].
- **Hardware sessions:** each webcam encode is another HW encoder session when hardware is used (§6.3).
- **Capture:** camera capture uses a different path (Media Foundation camera capture in Chromium) and doesn't compete with the screen capturer. Nothing notable was found for this question.
- **Settings:** a camera track is real-time video by default (no screencast flags). Its default degradation is `MAINTAIN_FRAMERATE` in Firefox ([source] `VideoConduit.cpp`, which notes this matches Chrome's default).

---

## 8. How to measure with `getStats`

A prototype can check every claim above from the browser's own stats ([webrtc-stats](https://w3c.github.io/webrtc-stats/)). Support is per MDN BCD, 2026-11-15.

| What to verify | Stat | Chrome | Firefox |
|---|---|---|---|
| Capture delivers 60 fps | `media-source.framesPerSecond` (video source) | 80+ | 116+ |
| Encoder outputs 60 fps | `outbound-rtp.framesPerSecond`, `framesEncoded`, `framesSent` | 84+ | 115+ (fps), 55+ |
| Encoded resolution | `outbound-rtp.frameWidth/frameHeight` | 84+ | 101+ |
| Why quality is limited | `outbound-rtp.qualityLimitationReason` (`none`/`cpu`/`bandwidth`/`other`), `qualityLimitationDurations` | 80+ / 93+ | **no** |
| Encoder cost | `outbound-rtp.totalEncodeTime / framesEncoded` (≥16.7 ms per frame means you cannot sustain 60 fps) | 80+ | 102+ |
| Hardware vs software | `outbound-rtp.encoderImplementation`, `powerEfficientEncoder` | yes, **only while the page has capture permission** ("exposing hardware is allowed") | [unverified] |
| Target vs actual bitrate | `outbound-rtp.targetBitrate`; Δ`bytesSent`/Δt | 98+ | no `targetBitrate` |
| Available upload | `candidate-pair.availableOutgoingBitrate` | 58+ | **no** |
| Codec actually negotiated | `outbound-rtp.codecId` → `codec.mimeType`, `sdpFmtpLine` (check the H.264 `profile-level-id`) | yes | yes |
| SVC mode in effect | `outbound-rtp.scalabilityMode` | 110+ | no |
| Viewer smoothness | `inbound-rtp.framesPerSecond`, `framesDropped`, `freezeCount`, `totalFreezesDuration`, `jitterBufferDelay`, `totalDecodeTime` | fps 86+; `freezeCount` **no** | fps 101+; `freezeCount` 142+ |
| Network health | `remote-inbound-rtp.roundTripTime`, `nackCount`, `pliCount`, `retransmittedBytesSent` | yes | yes |

**Pass criteria a prototype could use** (proposed, not from a source):

- **Sender:**
  - `media-source.framesPerSecond` ≥ 58.
  - `outbound-rtp.framesPerSecond` ≥ 58 at 1920×1080.
  - `qualityLimitationReason == "none"` (Chrome).
  - Mean encode time < 10 ms per frame.
  - All of the above over a 5-minute gameplay session with the game at full load.
- **Viewer:**
  - `inbound-rtp.framesPerSecond` ≥ 58.
  - Firefox: `freezeCount` growth ≈ 0. Chrome: watch `framesDropped` and fps dips instead.
- **Combinations:** run the matrix Chromium↔Chromium, Chromium↔Firefox and Firefox↔Firefox, for each candidate codec, with 1, 3 and 5 viewers (mesh).
- **Checks to log:** at every run, log `encoderImplementation`, the codec, and the negotiated `profile-level-id`.

---

## 9. What remains unverified

- Nothing was run on Windows hardware. **All fps and CPU outcomes need a prototype.**
- **Software encode CPU cost:** no primary figures were found for 1080p60 libvpx (VP8/VP9), libaom (AV1) or OpenH264 realtime encoding on typical gaming CPUs.
- **Chromium HW VP9 (Intel):** whether WebRTC picks it over libvpx in practice.
- **Chromium HW AV1:** whether a Finch field trial enables `kWebRtcAV1HWEncode` on Windows for some users.
- **Chromium sending H.264 to Firefox:** whether libwebrtc enforces the receiver's H.264 level (Firefox advertises 3.1).
- **Firefox sending H.264 to Chromium:** which H.264 payload type and level wins in negotiation.
- **Firefox stats:** whether `encoderImplementation`/`powerEfficientEncoder` are exposed.
- **Firefox window capture:** the current behaviour of the cropping window capturer with overlapping windows.
- **Chromium WGC `MinUpdateInterval`:** whether Chromium sets it, and the real WGC delivery rate under game load (third-party reports only).
- **Exclusive fullscreen:** the freeze on Windows 11 24H2+ comes from a third-party report plus an OBS maintainer's repro, not from Microsoft.
- **AMD and Intel encode capability per generation:** taken from comments in a Chromium blink-dev thread, not vendor documentation.
- **The bitrate ranges in §5:** derived from YouTube's ingest guidance plus reasoning, not measured for WebRTC gameplay.
- **Twitch's broadcasting guidelines:** could not be loaded, so they were not used.
