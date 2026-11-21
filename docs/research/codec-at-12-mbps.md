# A better codec at 12 Mbps

Researched 2026-11-21 for the ticket "A better codec at 12 Mbps"
(`.scratch/share-reliability/issues/03-better-codec-at-12-mbps.md`). The sources are Chromium `main`
and `branch-heads/8154` (Chrome stable 159.0.8154.13, from
[chromiumdash](https://chromiumdash.appspot.com/releases?platform=Windows)), libwebrtc `main`,
Firefox `main` (Nightly 163) and `release` (160.0.1), Bugzilla, Cloudflare's Realtime docs, and
NVIDIA, AMD, Intel and Microsoft docs. The graeae figures are from `main` at `3747279`. Some
measurements are the owner's, from the main checkout's notes:
`.scratch/v1/issues/13-quality-proof.md` and the owner's check in
`.scratch/v1-build/issues/17-encoding-rules-and-two-qualities.md`. A local probe ran on
Chromium 158.0.8127.36 (nixpkgs, Linux, headless, no GPU).

Labels: **[source]** is read in the code, **[doc]** is stated in documentation,
**[owner measurement]** is measured on the owner's machines, **[inferred]** is reasoned from the
sources but stated by none of them, **[unverified]** is a gap the Windows evidence run must close.

The question is whether one codec gives a Chromium screen share a better picture at 12 Mbps and
1080p60 than hardware H.264 baseline (`42001f`), while every watcher decodes it, with one codec
per share and no per-watcher fallback.

## Summary

| Condition | H.264 high (main) in hardware | AV1 in hardware | VP9 | Stay on baseline `42001f` |
|---|---|---|---|---|
| Chrome on Windows encodes it in hardware for WebRTC | **Yes** on NVIDIA (owner measurement, RTX 5070 Ti and 5060 Ti); the code path is the same for any Media Foundation encoder | **No.** `WebRtcAV1HWEncode` is off on Windows in M159 and on `main`, so encode is libaom software | **No** on NVIDIA and AMD, which have no VP9 encoder. Intel has one, but Chrome's use of it in WebRTC is unverified | **Yes** (owner measurement) |
| Fallback on a GPU without it | `6400xx` is not in `getCapabilities` and is not power efficient, so the page falls back to baseline | libaom in software, on every Windows GPU | libvpx in software | OpenH264 in software, as today |
| Cloudflare accepts and forwards it on a share of one quality | **Yes** (owner measurement, quality proof), but it labels the track `42e01f` to watchers, which is undocumented | **Unmeasured.** AV1 is in the docs' codec list | **Unmeasured.** VP9 is in the docs' codec list | **Yes** (owner measurement), with the same `42e01f` label |
| Firefox on Windows decodes it | **Yes** (owner measurement). Firefox cannot negotiate high itself; it decodes it because Cloudflare labels it `42e01f`, and only through the Windows decoder, not OpenH264 | **Yes** by default since Firefox 136, but with open bugs | **Yes** | **Yes** |
| Chromium on Linux decodes it | **Likely** [inferred]: it accepts `42e01f` and decodes with FFmpeg; not yet watched | **Yes** (dav1d) | **Yes** | **Yes** |
| A better picture at 12 Mbps 1080p60 | **Modest**, perhaps around 10% bitrate saved; no screen or game measurement exists | **Large**, about 40% bitrate saved (NVIDIA, hardware), but not reachable | Not established for hardware real-time | None (the reference) |
| One codec per share, no per-watcher fallback | Yes | Yes | Yes | Yes |
| **Meets every condition** | **Yes, if the Windows run confirms it** | No (no hardware encode) | No (no hardware encode on NVIDIA) | Yes |

**Recommendation:** offer H.264 high (`6400xx`) alone when the sharer's browser encodes it in
hardware, and baseline `42001f` otherwise. Do it only if the Windows evidence run (section 7)
shows the picture is better, and that Firefox and Linux Chromium watchers decode it. If the run
shows no measurable gain, stay on baseline. AV1 is the codec that would make a real difference,
but Chrome does not encode it in hardware on Windows. Re-check when `WebRtcAV1HWEncode` is
enabled by default there.

## 1. H.264 main and high

### Chrome on Windows encodes them in hardware

- Chromium's Windows encoder, the Media Foundation video encode accelerator, lists each hardware
  H.264 encoder with the profiles **Baseline, Main and High**. It does the same for VP9
  (profile 0) and AV1 (Main); HEVC is behind a flag.
  [source: `mf_video_encoder_shared_state.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/mf_video_encoder_shared_state.cc)
- `GetH264VProfile` maps Chromium's BASELINE, MAIN and HIGH to Media Foundation's
  `eAVEncH264VProfile_Base` (or `ConstrainedBase`), `_Main` and `_High`.
  [source: `mf_video_encoder_util.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/mf_video_encoder_util.cc)
- Blink's WebRTC encoder factory turns them into SDP formats. `H264PROFILE_BASELINE`, `MAIN` and
  `HIGH` become `kProfileBaseline`, `kProfileMain` and `kProfileHigh`, with packetization-mode 1
  and the level from `H264SupportedLevel(width*height, fps)` at the encoder's maximum
  resolution and rate. That gives `42001f`-style, `4d00xx` and `6400xx` values, which is why the
  owner saw `640032` (level 5.0). Constrained baseline (`42e0xx`) is added only when the
  `PlatformH264CbpEncoding` feature is on, and it is off.
  [source: `rtc_video_encoder_factory.cc`, lines 108–146 and 288](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder_factory.cc).
  The earlier research on the `research/capture-rate` branch
  (`docs/research/capture-rate-and-hardware-encode.md`) has the same reading, and also that
  NVIDIA is skipped for CBP (crbug 1088650).
- **The owner's machines** [owner measurement]:
  - On the RTX 5070 Ti, `42001f` alone ran on the "NVIDIA H.264 Encoder MFT" with
    `powerEfficientEncoder` true, and `encodingInfo` called both `42001f` and `640032` power
    efficient (ticket 17, owner's check of 2026-11-17).
  - Offering only main and high gave the NVIDIA encoder at about 2 to 5 ms per frame.
  - The friend's RTX 5060 Ti shared 1080p57–60 in **high profile** at about 5 ms per frame,
    11 to 12 Mbps (quality proof).
- **On a machine without a hardware encoder** [source plus inferred]: libwebrtc's software
  encoder list is `42001f`, `42e01f` and `4d001f` only, "We only support encoding Constrained
  Baseline Profile" ([source: libwebrtc `h264.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/video_coding/codecs/h264/h264.cc)).
  The local probe agrees: Chromium on Linux with no GPU lists `42001f`, `42e01f` and `4d001f`
  to send, and no `64xx`.
  - So **`6400xx` in `RTCRtpSender.getCapabilities('video')` means a platform encoder exists**
    [inferred from the two lists].
  - Main (`4d001f`) is not such a sign. It is in the software list, and OpenH264 would encode
    constrained baseline under that label. **High is the profile to ask for.**
- **The encoder's settings** [source:
  `media_foundation_video_encode_accelerator_win.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc):
  - Chromium sets `CODECAPI_AVLowLatencyMode` (line 1863). Inferred: no B-frames, so High
    gives no B-frame gain.
  - The software bitrate controller (`MediaFoundationUseSoftwareRateCtrl`, enabled) covers
    H.264, VP9, HEVC and AV1.
  - Chromium **never sets `CODECAPI_AVEncH264CABACEnable`**; the file does not mention it.
    Microsoft's page for that property gives no default
    ([doc](https://learn.microsoft.com/en-us/windows/win32/medfound/codecapi-avench264cabacenable)).
  - So **whether NVIDIA's encoder uses CABAC for High under Chromium's settings is not
    documented** [unverified]. The SPS/PPS `entropy_coding_mode_flag` answers it (section 7).

### Cloudflare's media server

- Cloudflare's limits page lists "Video | H.264, H.265, VP8, VP9, AV1", "Endpoint support varies
  by WebRTC implementation"
  ([doc](https://developers.cloudflare.com/realtime/sfu/platform/limits/), modified 2026-11-13).
  The Realtime docs say nothing about how the server picks among offered codecs, or about
  profiles, rewriting fmtp, or keyframes. Cloudflare's own apps (`cloudflare/meet`, formerly
  `orange`, and `partytracks`) set codecs only to force VP8 for end-to-end encryption
  [source: `github.com/cloudflare/meet`]. So everything below comes from the owner's
  measurements and is undocumented.
- **Two qualities** (ticket 17) [owner measurement]:
  - Offered main or high, it answered with VP8.
  - Offered every H.264 profile, it chose `42e01f`, which made the encode OpenH264 software.
  - Offered baseline then VP8, it answered VP8.
  - The 720p quality froze in H.264.
  - This is where the "never main or high" rule in `src/shared/encoding.ts` comes from, and it
    applied **only to two qualities**. Two qualities are now off (`TWO_QUALITIES = false`).
- **One quality** (quality proof) [owner measurement]:
  - High offered alone was accepted.
  - The server **forwards the high bitstream unchanged and tells watchers it is `42e01f`**.
    Chrome and Firefox decoded it at 60 fps with no freezes.
  - It passed 20 Mbps as well.
  - Today's baseline share gets the same label: watchers are told `42e01f` for a `42001f` share
    (ticket 17). So graeae already depends on this relabelling; high does not add it.

### Firefox decodes it, though it cannot ask for it

- Firefox negotiates only two H.264 formats, `0x42E01F` and `0x42001F`.
  `ParametersMatch` requires the same packetization mode and sub-profile, so Firefox cannot
  accept a `4d`/`64` offer itself. It is the same on `release` (161.0 on that branch).
  [source: `JsepCodecDescription.h`, lines 1399–1412](https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webrtc/jsep/JsepCodecDescription.h)
- Mozilla's bug to signal main and high receive support is open (NEW, P2). It says "our
  decoders in most cases support higher profiles. We should signal receive support for the main
  (0x4d001f) and high (0x64001f) profiles"
  ([bug 1951596](https://bugzilla.mozilla.org/show_bug.cgi?id=1951596)).
  - So the decoder can handle high; the obstacle is only in SDP negotiation, and Cloudflare's
    `42e01f` label gets past it.
  - That is why the quality proof saw Firefox (and Zen) decode high.
  - `.scratch/v1-build/spec.md` (around line 262) and the `Codec` comment say "Firefox cannot
    decode main or high". The quality proof and this bug contradict that.
- **Which decoder Firefox uses** [source]:
  - `WebrtcVideoDecoderFactory::Create` tries the platform decoder first
    (`MediaDataCodec::CreateDecoder`): WMF on Windows, FFmpeg or VA-API on Linux. Only after
    that does it try GMP OpenH264.
    ([source: `WebrtcVideoCodecFactory.cpp`, line 166 on](https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webrtc/libwebrtcglue/WebrtcVideoCodecFactory.cpp);
    [`MediaDataCodec.cpp`](https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webrtc/libwebrtcglue/MediaDataCodec.cpp))
  - `media.navigator.mediadatadecoder_h264_enabled` is true on `main` and `release`
    ([source: `StaticPrefList.yaml`](https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml)).
  - OpenH264's decoder supports "Constrained Baseline Profile up to Level 5.2" only
    ([source: OpenH264 README](https://github.com/cisco/openh264/blob/master/README.md)).
  - **So a Firefox watcher decodes a high share only through the platform decoder** [inferred].
    Windows has one built in, except possibly the "N" editions without the Media Feature Pack
    (inferred, not checked). The comment on bug 2052237 in `MediaDataCodec.cpp` says OpenH264
    "isn't a reliable substitute for every WebRTC stream".
  - With baseline, OpenH264 would still decode the share [inferred: NVIDIA's baseline output has
    none of baseline's extra tools, and watchers see `42e01f`].

### Chromium on Linux

- The local probe (Chromium 158, Linux) receives VP8; VP9 profiles 0 to 3; H.264 `42001f`,
  `42e01f`, `4d001f` and `f4001f`; and AV1 profiles 0 and 1. Its receive list has **no plain
  High `64001f`**. libwebrtc adds High 4:4:4 Predictive to the decoder list
  ([source: `h264.cc`, `SupportedH264DecoderCodecs`](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/video_coding/codecs/h264/h264.cc)).
- `decodingInfo` with `type: 'webrtc'` at 1080p60 and 12 Mbps reports `640032` as supported,
  not power efficient [probe].
- Linux Chromium would accept the `42e01f` label and hand the bitstream to its FFmpeg H.264
  decoder, which decodes High [inferred]. It has not been watched in practice [unverified].

### How much better

- **CABAC against CAVLC**: 9–14% bitrate saved on the broadcast test set at 30–38 dB PSNR, with
  more saved at lower rates (Marpe, Schwarz and Wiegand, "Context-based adaptive binary
  arithmetic coding in the H.264/AVC video compression standard", IEEE TCSVT 13(7), 2003,
  [doi:10.1109/TCSVT.2003.815173](https://doi.org/10.1109/TCSVT.2003.815173); author's copy
  [cabac_ieee03.pdf](https://iphome.hhi.de/marpe/download/cabac_ieee03.pdf)). Baseline has only
  CAVLC; Main and High allow CABAC.
- High adds the **8x8 transform** and custom scaling matrices. No source measured their gain in
  hardware real-time encoding.
- **No B-frames either way**, since low-latency mode is on [inferred from line 1863].
- No measurement of hardware H.264 baseline against high on screen content or games was found.
  12 Mbps is a high rate for 1080p60 (YouTube recommends 12 Mbps for AV1 and HEVC and 17 Mbps for
  H.264 at 1080p60; see `research/capture-quality`). At high rates the CABAC gain is at the low
  end [inferred from Marpe et al.].
- Expect a modest gain, visible mostly in fast motion where 12 Mbps runs short, and only if
  NVIDIA's encoder turns CABAC on [inferred].

## 2. AV1

### Chrome on Windows does not encode it in hardware

- `kWebRtcAV1HWEncode` is `FEATURE_DISABLED_BY_DEFAULT` under `BUILDFLAG(IS_WIN)` and enabled
  elsewhere. It is the same on `main` and on the M159 branch
  ([source: `webrtc_features.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/webrtc/webrtc_features.cc)).
  `fieldtrial_testing_config.json` has no `WebRtcAV1HWEncode` entry
  ([source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/testing/variations/fieldtrial_testing_config.json)).
  Inferred: no field trial is testing it, though a live Finch trial cannot be ruled out from the
  source.
- With the feature off, the AV1 profiles the Windows encoder reports go to `disabled_profiles_`.
  WebRTC then uses libaom **in software**, on every Windows machine whatever the GPU
  ([source: `rtc_video_encoder_factory.cc`, lines 516–519](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder_factory.cc)).
  The owner's `encodingInfo` on the RTX 5070 Ti said AV1 was not power efficient
  [owner measurement, ticket 17].
- The AV1 screen-content setting (`eAVScenarioInfo_DisplayRemoting`) is set only for Intel, with
  display content, even when the hardware path is on
  ([source: `media_foundation_video_encode_accelerator_win.cc`, lines 1871–1885](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc)).
- **The hardware exists** [doc]:
  - NVIDIA encodes AV1 on Ada and Blackwell (RTX 40 and 50, including the 5060 Ti and 5070 Ti),
    not on Ampere or older
    ([NVIDIA support matrix](https://developer.nvidia.com/video-encode-decode-support-matrix)).
  - AMD's AMF has an AV1 encoder from AMF 1.4.28 and Adrenalin 22.12.1
    ([AMF docs](https://github.com/GPUOpen-LibrariesAndSDKs/AMF/tree/master/amf/doc)). The docs
    do not name the GPU generation; RDNA3 is inferred.
  - Intel encodes AV1 on Arc (DG2), Meteor Lake, Lunar Lake, Battlemage and later
    ([media-driver features](https://github.com/intel/media-driver/blob/master/docs/media_features.md)).
- A page cannot turn on a Chrome feature. `--enable-features=WebRtcAV1HWEncode` is for testing
  only, never for friends' browsers.
- **What it falls back to**: libaom in software, on every Windows GPU today. Once the feature is
  on, a GPU without AV1 would also use libaom [inferred from the same lines].

### Cloudflare and the watchers

- Cloudflare lists AV1 as supported ([doc](https://developers.cloudflare.com/realtime/sfu/platform/limits/)).
  Whether it accepts AV1 offered alone, and forwards it with the right keyframe and
  dependency-descriptor handling, has not been measured [unverified].
- **Firefox**:
  - AV1 for WebRTC has been on by default since Firefox 136
    ([bug 1944878](https://bugzilla.mozilla.org/show_bug.cgi?id=1944878); first support in
    [bug 1921154](https://bugzilla.mozilla.org/show_bug.cgi?id=1921154)).
  - Firefox signals profile 0, level-idx 9 (level 4.1)
    ([source: `JsepCodecDescription.h`, `CreateDefaultAV1`](https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webrtc/jsep/JsepCodecDescription.h);
    [bug 2063995](https://bugzilla.mozilla.org/show_bug.cgi?id=2063995), 158). Inferred: level
    4.1 covers 1080p60 at 12 Mbps under the AV1 spec's Annex A. That was checked from memory,
    not against the table.
  - Since 157, AV1 is decoded by the platform decoder, with dav1d as the fallback
    ([bug 2062642](https://bugzilla.mozilla.org/show_bug.cgi?id=2062642),
    [bug 2069901](https://bugzilla.mozilla.org/show_bug.cgi?id=2069901)).
  - Open bugs:
    - Freezes on AMD RDNA3/4 VA-API, reported on Linux and said to happen on Windows too
      ([bug 2017189](https://bugzilla.mozilla.org/show_bug.cgi?id=2017189), NEW).
    - Parsing the AV1 fmtp ([bug 2067241](https://bugzilla.mozilla.org/show_bug.cgi?id=2067241),
      REOPENED).
    - A black picture on Android from 2069901
      ([bug 2085863](https://bugzilla.mozilla.org/show_bug.cgi?id=2085863)).
    - Receive stalls with spatial layers, fixed in 158
      ([bug 2071030](https://bugzilla.mozilla.org/show_bug.cgi?id=2071030)).
- **Linux Chromium** receives AV1 profiles 0 and 1 and decodes with dav1d [probe].

### How much better

- **NVIDIA** measured its AV1 encoder against its H.264 encoder on Ada
  ([NVIDIA blog, 2023-01-18](https://developer.nvidia.com/blog/improving-video-quality-and-performance-with-av1-and-nvidia-ada-lovelace-architecture/)):
  - about 1.5–2 dB better PSNR
  - "AV1 achieves 42 dB PSNR at 7 Mbps compared to 11 Mbps for H.264"
  - about 40% bitrate saved at 1080p60, "For a given low latency quality preset on H.264, bit
    rate gains are up to 40%"
  - Method: an average over more than 100 videos. The blog does not state the content type or
    the H.264 profile, and the VMAF gap narrows as the bitrate rises.
- **Chrome** reported that libaom AV1 at speed 10 against libvpx VP9 at speed 7 gave "12% better
  quality at the same bandwidth" for calls and "45% better compression" for screen sharing
  ([Chrome blog, Chrome 113](https://developer.chrome.com/blog/av1)). That is software only,
  with no method given.
- AV1 would be the real gain, but at 1080p60 it would mean software libaom on the sharer's CPU,
  which fails the ticket's hardware condition.

## 3. VP9

- **NVIDIA has no VP9 encoder.** The NVENC table has no VP9 column; VP9 appears only under NVDEC
  ([NVIDIA support matrix](https://developer.nvidia.com/video-encode-decode-support-matrix)).
- **AMD**'s AMF encoders are AVC, HEVC and AV1 only
  ([AMF docs](https://github.com/GPUOpen-LibrariesAndSDKs/AMF/tree/master/amf/doc)).
- **Intel** encodes VP9 on Ice Lake, Tiger Lake, DG1, DG2, Meteor Lake, Panther Lake and later,
  but not on Battlemage or Lunar Lake
  ([media-driver features](https://github.com/intel/media-driver/blob/master/docs/media_features.md)).
  Chromium's Media Foundation encoder lists VP9 profile 0, and its comment says "Only
  eAVEncVP9VProfile_420_8 is supported on Intel graphics"
  ([source: `mf_video_encoder_util.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/windows/mf_video_encoder_util.cc)).
  Whether Chrome's WebRTC uses it on Intel is unverified.
- On the owner's NVIDIA machines, `encodingInfo` called VP9 not power efficient
  [owner measurement, ticket 17]. A Chromium VP9 share at 1080p60 would be libvpx in software
  [inferred].
- **Watchers**: Cloudflare lists VP9 ([doc](https://developers.cloudflare.com/realtime/sfu/platform/limits/)).
  Firefox decodes VP9 (`media.peerconnection.video.vp9_enabled` and
  `media.navigator.mediadatadecoder_vpx_enabled` are true, with libvpx as the fallback)
  [source: `StaticPrefList.yaml`, `WebrtcVideoCodecFactory.cpp`]. Linux Chromium receives VP9
  profiles 0 to 3 [probe]. graeae already uses VP9 for Firefox sharers.
- **How much better**: no primary measurement of VP9 against H.264 for hardware real-time
  encoding was found. VP9 fails the hardware condition on NVIDIA anyway.

## 4. Staying on baseline `42001f`

- It meets every condition today [owner measurement]: hardware encoding on NVIDIA, accepted at
  one quality and at two, watchers told `42e01f`, decoded by Chrome and Firefox.
- It is the reference, so it brings no gain. Its fallback with no hardware encoder is OpenH264
  in software, as today.

## 5. How the page would choose

- **`RTCRtpSender.getCapabilities('video')`** lists what the browser can send, software and
  hardware together, without saying which is which. On Windows Chromium, `6400xx` appears only
  when a platform encoder reports High (section 1) [inferred].
- **`navigator.mediaCapabilities.encodingInfo`** with `type: 'webrtc'` is the explicit hardware
  test. Blink turns the content type's parameters into an `SdpVideoFormat`
  ([source: `media_capabilities.cc`, `ToSdpVideoFormat`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/media_capabilities/media_capabilities.cc)).
  It then calls the encoder factory's
  `QueryCodecSupport(format, scalability_mode, resolution)` and returns `supported` and
  `powerEfficient`
  ([source: `webrtc_encoding_info_handler.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/peerconnection/webrtc_encoding_info_handler.cc)).
  For example:

  ```js
  await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { contentType: 'video/H264;profile-level-id=640c1f;packetization-mode=1',
             width: 1920, height: 1080, bitrate: 12_000_000, framerate: 60 },
  }) // → { supported, smooth, powerEfficient }
  ```

  On the owner's RTX 5070 Ti this said power efficient for `42001f` and `640032`, and not for VP9
  or AV1 [owner measurement].
- **Offer one codec alone.** Cloudflare picks its own favourite when several are offered
  (ticket 17). `codecPreferences()` in `src/app/lib/media/encodings.ts` already offers only the
  first plan codec the browser has, plus rtx, red, ulpfec and flexfec.
  - If high came first in the plan, a Windows sharer with a hardware encoder would offer high
    alone, and any other sharer would fall through to baseline [inferred from the code; no
    change made].
  - Its profile test compares the first four hex digits, so a `"6400"` entry would match the
    `640032` that Chromium advertises.
- **What it means for a watcher who cannot decode**: with one codec per share and no per-watcher
  fallback, that watcher **gets no picture**. Nothing renegotiates, because Cloudflare
  answers each watcher with the codec the sharer sends.
  - With high, the watchers at risk are a Firefox with no platform H.264 decoder (it would fall
    back to OpenH264, which decodes constrained baseline only) and a Chromium built without
    proprietary codecs [inferred].
  - Baseline carries a smaller version of the same risk: every watcher is told `42e01f` either
    way.
- **If the hardware encoder fails at run time** after high is negotiated, libwebrtc would fall
  back to software OpenH264 and send constrained baseline under the high label, which every
  decoder accepts [inferred; not traced in the source].

## 6. Recommendation

1. **Offer H.264 high (`6400xx`) alone when the sharer's browser encodes it in hardware.** Check
   it with `encodingInfo(...).powerEfficient` and `6400` in `getCapabilities`. Otherwise offer
   baseline `42001f`, as today. Keep VP8 last for browsers with no H.264. Firefox sharers stay
   on VP9 or VP8.
   - It is the only candidate that meets every condition.
   - It runs on hardware already proven on both owner machines, and adds no Cloudflare behaviour
     graeae does not already depend on.
   - The `Codec` comment's three reasons against it no longer hold:
     - The VP8 answer happened only at two qualities.
     - Firefox does decode high.
     - Constrained baseline is beside the point.
2. **Make it depend on the Windows evidence run** (section 7). If the run shows no measurable gain
   at 12 Mbps on a game and on desktop content (no lower QP, no better VMAF or PSNR), **stay on
   baseline**: the change would not be worth the risk to watchers who have only OpenH264.
3. **Do not adopt AV1 or VP9 now.** Both fail the hardware condition on Windows NVIDIA. Re-check
   AV1 when `WebRtcAV1HWEncode` turns on by default on Windows. Before adopting it, confirm that
   Cloudflare forwards AV1 offered alone, and that Firefox bugs 2017189 and 2067241 are closed.

## 7. What the Windows evidence run must measure

On the RTX 5070 Ti, then the RTX 5060 Ti, in Chrome stable 159. Watchers: Chrome on Windows,
Firefox on Windows, and Chromium on Linux. All at one quality, 1080p60 and 12 Mbps.

1. **Negotiation, offering high alone** (`profile-level-id=6400xx`, packetization-mode 1):
   - at the sharer: the answered codec and fmtp, `outbound-rtp.encoderImplementation` ("NVIDIA
     H.264 Encoder MFT") and `powerEfficientEncoder`
   - at each watcher: the label in its remote description (expected `42e01f`)
2. **Every watcher decodes**, over at least 5 minutes:
   - `inbound-rtp.framesDecoded`, `framesPerSecond`, `freezeCount`, `keyFramesDecoded`,
     `framesDropped` and `decoderImplementation`
   - in Firefox, whether the platform decoder or OpenH264 is used (`about:support` media
     section, or a log with `MOZ_LOG=PlatformDecoderModule:4`)
   - in Linux Chromium, `chrome://media-internals`
3. **CABAC.** Read `entropy_coding_mode_flag` and `transform_8x8_mode_flag` from the PPS, using
   encoded frames from an Encoded Transform at the sharer or an RTP dump, so that whether NVIDIA's
   encoder uses CABAC under Chromium's settings is settled. If it does not, most of high's
   expected gain is gone.
4. **The same content in both codecs at 12 Mbps.** Use the same game clip (fast motion) and the
   same desktop scroll, once with baseline and once with high:
   - `qpSum / framesEncoded` at the sharer
   - `qualityLimitationReason`, `totalEncodeTime / framesEncoded`, the frame rate sent, and the
     bitrate
   - if possible, a recording at a watcher scored with VMAF or PSNR against the captured source,
     and a side-by-side screenshot of a fast scene
5. **Confirm AV1 and VP9 are software**:
   - `encodingInfo` for `av01.0.08M.08` and `vp09.00.40.08` at 1080p60 and 12 Mbps
     (`powerEfficient`), and `encoderImplementation` when each is offered alone
   - optional, for information only: AV1 with `--enable-features=WebRtcAV1HWEncode`, to see
     whether the NVIDIA AV1 encoder engages and what QP it reaches at 12 Mbps
6. **Cloudflare with AV1 offered alone**: whether it accepts it, and whether Chrome and Firefox
   watchers decode it.
7. **A game at 144 Hz** (capture asked for 120 fps) with high, on the 5060 Ti: whether the
   encode keeps up and the game's frame rate holds.

## Unverified

- Whether NVIDIA's encoder uses CABAC and the 8x8 transform for High under Chromium's Media
  Foundation settings.
- That Linux Chromium decodes a high share labelled `42e01f`, and that Firefox on Windows uses WMF
  rather than OpenH264 for it on every friend's machine.
- How much better high looks than baseline at 12 Mbps on games and screen content. No published
  hardware real-time measurement was found.
- Whether Cloudflare forwards AV1 and VP9 shares.
- Whether Chrome's WebRTC uses Intel's VP9 encoder on Windows.
- Whether a live Finch trial turns on `WebRtcAV1HWEncode` on Windows.
- The AV1 Annex A level figures (level 4.1 at 1080p60 and 12 Mbps), checked from memory.
