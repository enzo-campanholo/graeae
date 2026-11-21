# Why a shared tab goes out on software H.264, and what the page can do

Researched 2026-11-21 against Chromium main at `afcb797d`
([afcb797daa921994df0138a531569fb815886110](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110)),
WebRTC main at `97e37190`
([97e37190541dc77f2c9312edf34474d3257efc78](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78)),
the W3C [Screen Capture](https://w3c.github.io/mediacapture-screen-share/) editor's draft, and
graeae's code at `3747279`. Helium is built from Chromium; this note assumes its
capture and encoding code is Chromium's (inferred, not checked). Line numbers are links into
those exact revisions.

Question: [share-reliability ticket 01](../../.scratch/share-reliability/issues/01-tab-share-software-encoding.md)
(in the main checkout, not committed). On Windows 11, a **tab** screen share went out on
OpenH264 with a poor picture, while a window or the entire screen went out in hardware.

Marking: **stated** means the cited source says or does it. **Inferred** means I put it
together from several sources, or from what the code does not do, and it still needs
checking on Windows.

## Summary

- **The ticket's guess is wrong.** A tab capture is never odd-sized. Chrome's compositor
  capturer rounds every I420 or NV12 frame size down to even. Neither Windows hardware H.264
  encoder needs a multiple of 16: both ask for an alignment of 2 and refuse only odd sizes,
  and sizes outside the GPU's minimum and maximum. With graeae's encodings,
  `scaleResolutionDownBy` is 1 for any capture of 1080 lines or fewer, so the encoded size is
  the capture size, which is even. (§1, §3)
- **A tab and a window are stored the same way.** Both arrive in the renderer as CPU-memory
  frames, not GPU textures: window capture through Windows Graphics Capture uses shared
  memory unless a feature that is off by default is on, and a tab is requested as I420, which
  viz allocates in shared memory. (§3, the tab half inferred)
- **What differs is how often a tab's size changes.** A window capture keeps its size; when
  WebRTC wants fewer pixels, the renderer scales the frames. A tab capture follows the tab's
  viewport, and under graeae's constraints the compositor capturer itself also shrinks the
  capture in 90-line steps whenever WebRTC asks for fewer pixels. Chrome's HiDPI scaler can
  change it in quarter steps too. (§4)
- **Every size change re-creates or resizes the hardware encoder, and any failure there drops
  the share to OpenH264 until the next size change.** A change below 360 lines drops it to
  OpenH264 on purpose. Once on OpenH264, WebRTC's quality scaler and its stricter CPU limits,
  under graeae's `maintain-framerate`, push the resolution down further, and for a tab that
  shrinks the capture itself. (§2, §5)
- **Likely cause (inferred):** a tab share's frame size changes much more often than a
  window's. Each change is a fresh chance for the hardware encoder to fail its reset or for
  the size to fall under 360 lines. After the first fall, `maintain-framerate` keeps the
  share small and on OpenH264.
- **The page cannot pin a tab's capture size.** `getDisplayMedia` rejects `min` and `exact`.
  `applyConstraints` keeps the resolution policy chosen at `getDisplayMedia`, and with graeae's
  max-only constraints that policy lets the capture size change at any time. (§6)
- **Candidate page-side fix:** for a share whose `displaySurface` is `"browser"`, send with
  `degradationPreference: "maintain-resolution"`, so WebRTC never asks the tab capturer for
  fewer pixels. Add a recovery as well: when the sender reports a software encoder while the
  capture is at least 360 lines, change the encoded size once, through a `setParameters` round
  trip such as graeae's existing 720p step and back. WebRTC then re-initialises the encoder,
  and Chrome tries the hardware encoder again on every re-initialisation. (§7)
- **The Windows run** must put the encoder's name and the frame size side by side, once a
  second, for a tab, a window and the screen, with and without the fix. That shows which
  trigger fires. (§8)

## 1. How Chrome picks the hardware or the software H.264 encoder

**Stated:**

- A sender's video encoder is Chrome's `RTCVideoEncoder`, which drives a hardware video
  encode accelerator (VEA), with WebRTC's software encoder as its fallback.
  `EncoderAdapter` makes the hardware factory primary and the software factory the fallback,
  inside a `SimulcastEncoderAdapter`
  ([video_codec_factory.cc:99–160](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/video_codec_factory.cc#99)).
  That adapter wraps each primary and fallback pair in WebRTC's
  `VideoEncoderSoftwareFallbackWrapper`
  ([simulcast_encoder_adapter.cc:976–983](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/media/engine/simulcast_encoder_adapter.cc#976)).
- On Windows the accelerator is tried as D3D12 first, then Media Foundation
  ([gpu_video_encode_accelerator_factory.cc:229–234](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/gpu_video_encode_accelerator_factory.cc#229)).
  `kD3D12VideoEncodeAccelerator` is enabled by default
  ([media_switches.cc:1588](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/base/media_switches.cc#1588)).
  They report themselves as `D3D12VideoEncodeAccelerator`
  ([d3d12_video_encode_accelerator.cc:503](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/d3d12_video_encode_accelerator.cc#503))
  and `MediaFoundationVideoEncodeAccelerator (<vendor>)`
  ([media_foundation_video_encode_accelerator_win.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc)).
  `RTCVideoEncoder` copies that name into the encoder info that `getStats` reads
  ([rtc_video_encoder.cc:3103](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#3103)),
  and reports `ExternalEncoder` before the first initialisation
  ([:2597](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2597)).
  OpenH264 reports `OpenH264` and `is_hardware_accelerated = false`
  ([h264_encoder_impl.cc:851–861](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/modules/video_coding/codecs/h264/h264_encoder_impl.cc#851)).

`RTCVideoEncoder::InitEncode` hands the share to OpenH264 when any of these holds (stated):

| Trigger | Where |
|---|---|
| The encoded height is under 360 lines (270 for AV1), with `kForceSoftwareForRtcLowResolutions` on. It is on by default everywhere except Android. Chrome logs `Fallback to SW due to low resolution being less than …` | [rtc_video_encoder.cc:681–706](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#681), [:2795](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2795), [media_switches.cc:610](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/base/media_switches.cc#610) |
| An H.264 width or height is odd ("hardware H.264 encoder only supports even sized frames") | [rtc_video_encoder.cc:2803–2808](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2803) |
| The size is outside the accelerator's supported minimum and maximum | [rtc_video_encoder.cc:2876–2900](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2876) |
| The accelerator fails to initialise | the fallback wrapper's `InitEncode`, [video_encoder_software_fallback_wrapper.cc:321–370](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/api/video_codecs/video_encoder_software_fallback_wrapper.cc#321) (logs `[VESFW] Hardware encoder initialization failed`) |
| The accelerator reports **any** error while encoding | `NotifyErrorStatus` sets the status to `WEBRTC_VIDEO_CODEC_FALLBACK_SOFTWARE`, and the next `Encode` returns it ([rtc_video_encoder.cc:2006–2030](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2006)). The wrapper then switches to OpenH264 ([video_encoder_software_fallback_wrapper.cc:403–411](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/api/video_codecs/video_encoder_software_fallback_wrapper.cc#403)) |

The accelerators' own size rules (stated):

- **Media Foundation:**
  - refuses odd sizes, and sizes outside the GPU's minimum and maximum
    ([media_foundation_video_encode_accelerator_win.cc:1150–1185](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#1150));
  - asks WebRTC for an alignment of 2, citing crbug.com/1275453
    ([:608–613](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#608));
  - fails an input frame whose visible rectangle has an odd origin or size
    ([:865–870](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#865)).
- The H.264 minimums are tiny: AMD 128×128, Intel 18×18, NVIDIA 146×50, Qualcomm 96×96
  ([mf_video_encoder_util.cc, `GetMinResolution`](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/mf_video_encoder_util.cc)).
- **D3D12:**
  - checks the minimum and maximum that the D3D12 video API reports
    ([d3d12_video_encode_accelerator.cc:602–610](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/d3d12_video_encode_accelerator.cc#602),
    [d3d12_video_encode_delegate.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/d3d12_video_encode_delegate.cc));
  - asks for an alignment of 2
    ([:747](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/d3d12_video_encode_accelerator.cc#747));
  - needs an even visible origin
    ([:363](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/d3d12_video_encode_accelerator.cc#363)).

No source rule needs a multiple of 16. Nor does any rule depend on the aspect ratio, beyond
the minimum and maximum.

**Not established:** whether D3D12 offers H.264 *constrained baseline*, graeae's `42001f`, on
the owner's GPU, or whether Media Foundation is used instead. The `getStats` encoder name in
§8 answers it.

## 2. Is the fallback permanent?

**No, not for the sender as a whole. But it is sticky while the frame size holds.** Stated:

- WebRTC's `VideoStreamEncoder` reconfigures the encoder whenever a frame arrives at a new
  size
  ([video_stream_encoder.cc:1921–1958](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/video/video_stream_encoder.cc#1921)).
  A width or height change requires an encoder reset
  ([:141–200](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/video/video_stream_encoder.cc#141)),
  which is `Release` then `InitEncode`
  ([:1366–1384](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/video/video_stream_encoder.cc#1366)).
- On every `InitEncode` the fallback wrapper tries the hardware encoder first, and uses
  OpenH264 only if that fails
  ([video_encoder_software_fallback_wrapper.cc:321–370](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/api/video_codecs/video_encoder_software_fallback_wrapper.cc#321)).
- `RTCVideoEncoder::InitEncode` drops an encoder that is in error and clears its error flag
  ([rtc_video_encoder.cc:2786–2811](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2786)).
- A fallback taken *while encoding* lasts until the next `Release`/`InitEncode`
  ([video_encoder_software_fallback_wrapper.cc:403–411](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/api/video_codecs/video_encoder_software_fallback_wrapper.cc#403)),
  that is, until the frame size or the encoder settings next change.

So a share that drops to OpenH264 at a steady size stays there for the rest of the share,
and a share whose size keeps changing gets a fresh try at hardware on each change. It also
gets a fresh chance to fail.

**How a size change reaches the accelerator** (stated):

- With `kKeepEncoderInstanceOnRelease`, enabled by default
  ([rtc_video_encoder.cc:411](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#411)),
  an accelerator that supports frame size change keeps its instance across `Release`
  ([:3016](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#3016),
  [:3100–3102](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#3100)).
  On the next `InitEncode` it is drained and resized in place
  ([:2636–2730](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2636)).
- Media Foundation supports this unless a GPU workaround turns it off
  ([media_foundation_video_encode_accelerator_win.cc:644](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#644)).
  Its `UpdateFrameSize` raises an error, "Can't change frame size when there are pending input
  frames" or "Unsupported frame size"
  ([:1190–1212](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#1190)),
  and that error becomes the software fallback of §1.
- D3D12 does not set `supports_frame_size_change`, so each size change re-creates it (inferred
  from its absence in
  [d3d12_video_encode_accelerator.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/d3d12_video_encode_accelerator.cc)).

## 3. Frame size, pixel format and storage: a tab against a window

**Size (stated):**

- The compositor capturer rounds I420 and NV12 output sizes down to even
  (`AdjustSizeForPixelFormat`,
  [frame_sink_video_capturer_impl.cc:1642](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/components/viz/service/frame_sinks/video_capture/frame_sink_video_capturer_impl.cc#1642)).
- The desktop capturer used for a window or a screen does the same
  ([desktop_capture_device.cc:682–755](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/media/capture/desktop_capture_device.cc#682)).
- The constraint code rounds the maximum to even (`SuggestConstraints`,
  [video_capture_types.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/capture/video_capture_types.cc)).

A 1920×953 viewport is therefore captured at 1920×952, and the ticket's 1920×1078 window was
already even.

**Size of the encoded frames (stated, then inferred):**

- graeae sets `scaleResolutionDownBy` to `max(1, captureHeight / 1080)`
  ([encodings.ts:71](../../src/app/lib/media/encodings.ts)). That is 1 for any capture of 1080
  lines or fewer, so WebRTC encodes the capture size.
- Before the encoder is first initialised, `RTCVideoEncoder` reports an alignment of 1
  ([rtc_video_encoder.cc:2594](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#2594)).
  A fractional scale could then give an odd size at the first `InitEncode`. With a factor of 1
  this does not arise (inferred).

**Storage (stated for the window, inferred for the tab):**

- A native window or screen on Windows goes to `DesktopCaptureDevice` (Windows Graphics
  Capture for windows) with shared-memory buffers
  ([in_process_video_capture_device_launcher.cc:280–400](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/renderer_host/media/in_process_video_capture_device_launcher.cc#280)).
  The texture path is behind `kWebRtcAllowWgcUsingTexture`, which is disabled by default
  ([webrtc_features.cc:27](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/webrtc/webrtc_features.cc#27)).
- A tab goes to the compositor capturer. Blink requests `PIXEL_FORMAT_I420` for any screen
  capture
  ([media_stream_constraints_util_video_content.cc:218](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_video_content.cc#218)).
  The capture device asks viz for NV12 only when the request's format is unknown
  (`GetDesiredVideoPixelFormat`,
  [frame_sink_video_capture_device.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/media/capture/frame_sink_video_capture_device.cc)),
  and viz serves I420 from a shared-memory pool
  ([frame_sink_video_capturer_impl.cc, `GetVideoFramePoolForFormat`](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/components/viz/service/frame_sinks/video_capture/frame_sink_video_capturer_impl.cc)).
  So on current main, tab frames are also CPU memory (inferred). A 2022 change added
  zero-copy tab capture, requesting the unknown format
  ([530686499dab](https://chromium.googlesource.com/chromium/src/+/530686499dab)); main no
  longer requests it, so it was undone or reworked later (inferred; the history was not read).
- On the encoder side the two are treated alike. `contentHint = "motion"`
  ([browser.ts:86](../../src/app/lib/media/browser.ts)) maps to WebRTC's `kFluid`
  ([media_stream_video_webrtc_sink.cc:49–62](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/peerconnection/media_stream_video_webrtc_sink.cc#49)).
  `kFluid` sets `is_screencast = false`
  ([rtp_sender.cc:1673–1684](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/pc/rtp_sender.cc#1673)),
  so the encoder runs in realtime mode, not screen-share mode. Outside screen-share mode,
  `IsZeroCopyEnabled` follows the renderer switch
  ([rtc_video_encoder.cc:653](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#653)).
  On Windows, with `kMediaFoundationD3D11VideoCapture` enabled by default
  ([media_switches.cc:1631](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/base/media_switches.cc#1631)),
  the browser passes that switch to every renderer
  ([render_process_host_impl.cc:4201–4205](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/renderer_host/render_process_host_impl.cc#4201)).
  Both a tab and a window are therefore encoded as NV12 GPU-memory-buffer input, with CPU
  frames copied in. Nothing here tells a tab from a window (inferred).

`contentHint` itself does not choose hardware or software: no fallback condition in §1 reads
it. **`contentHint` and storage are ruled out as the tab-only cause, as far as source shows.**

## 4. How a tab capture is sized under graeae's constraints

graeae asks for `width: {max: 1920}, height: {max: 1080}, frameRate: {ideal: 120, max: 120}`
([capture.ts:50–51](../../src/app/lib/media/capture.ts)). Stated:

- **Policy.** Blink chooses a fixed policy only when both minimums are above 1 and both
  maximums are below the limit
  ([media_stream_constraints_util_video_content.cc:151–176](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_video_content.cc#151)).
  Otherwise it uses the stream type's default, which is `ANY_WITHIN_LIMIT` for
  `getDisplayMedia`, while the extension-only tab capture gets `FIXED_RESOLUTION`
  ([:347–350](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_video_content.cc#347)).
  Max-only constraints therefore give `ANY_WITHIN_LIMIT`. Its suggested minimum is 2×2
  (`SuggestConstraints`,
  [video_capture_types.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/capture/video_capture_types.cc)).
- **The capture follows the viewport.**
  - Under `ANY_WITHIN_LIMIT` Chrome leaves the tab's own size alone
    ([web_contents_frame_tracker.cc:224–251](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/media/capture/web_contents_frame_tracker.cc#224)).
  - The capture size is the viewport, scaled to fit within 1920×1080
    (`ComputeBoundedCaptureSize`,
    [capture_resolution_chooser.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/capture/content/capture_resolution_chooser.cc)).
  - Anything that changes the tab's viewport changes the capture size: resizing the window,
    opening devtools, a page going fullscreen, or Chrome's own bar on a shared tab (that last
    one is inferred, and not tested).
- **The capturer shrinks itself on WebRTC's request.**
  - Blink sends the capturer WebRTC's target pixel count as `max_pixels`
    ([webrtc_video_track_source.cc:204–208](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/webrtc_video_track_source.cc#204)).
  - The tab capturer's oracle obeys it, picking a smaller size from the resolution chooser
    ([video_capture_oracle.cc:336–368](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/capture/content/video_capture_oracle.cc#336)).
    The chooser's steps are snapped to 90-line heights, each at least 15% smaller in area
    (`kSnappedHeightStep`, `kMinAreaDecreasePercent`,
    [capture_resolution_chooser.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/capture/content/capture_resolution_chooser.cc)).
  - The oracle also runs its own size throttling on `resource_utilization` feedback
    ([:370–402](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/capture/content/video_capture_oracle.cc#370)).
    Whether any consumer sends that for a WebRTC track was not found; the blink source above
    sends only pixels and frame rate.
- **The window capturer does not.** `DesktopCaptureDevice` never sets a target frame area
  ([desktop_capture_device.cc:863–911](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/media/capture/desktop_capture_device.cc#863)).
  A window keeps its captured size, and WebRTC's adapter scales its frames in the renderer
  instead (inferred from the absence).
- **HiDPI.** When HiDPI tab capture is on, `WebContentsAutoScaler` changes the tab's capture
  scale in quarter steps from 1.0 to 2.0. It steps down when utilisation is above 0.8 or the
  content is over `max_pixels`, and up when both are well under
  ([web_contents_auto_scaler.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/content/browser/media/capture/web_contents_auto_scaler.cc)).
  This too can change the capture size mid-share (inferred).

So, under graeae's constraints, a tab capture can take any even size from 2×2 up to the
viewport's fit inside 1920×1080, and it changes size during a share. That includes sizes
under 360 lines. A window capture keeps one size.

**`resizeMode`** is stated in the spec
([`resizeMode`](https://w3c.github.io/mediacapture-screen-share/#def-constraint-resizeMode))
as whether the user agent may downscale the source. In Chromium it decides whether the
renderer's track adapter rescales. It does not change the capturer's resolution policy
(Rescale selection is separate from `SelectResolutionPolicyFromCandidates`,
[media_stream_constraints_util_video_content.cc](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/media_stream_constraints_util_video_content.cc)).
**No `resizeMode` value pins a tab's capture size** (inferred from that separation).

## 5. How a size change becomes a software share

These are inferred, combining the stated pieces of §1, §2 and §4:

1. **A failed reset.** Each tab size change makes WebRTC reset the encoder. Media Foundation
   is resized in place, after a drain, and errors if the drain leaves input behind or the size
   is refused. D3D12 is re-created. Any error, or any failed init, drops the share to OpenH264,
   and it stays there while the size holds. A window resets once at the start and never again,
   so it rarely meets this.
2. **The low-resolution rule.** When WebRTC wants fewer pixels, the tab capturer snaps down,
   possibly in several 90-line steps. Below 360 lines, Chrome picks OpenH264 by design. A
   window goes through the same WebRTC adaptation. It is a share-wide risk, not tab-only, but
   the tab's own shrinking makes it likelier.
3. **The trap.** On OpenH264 the CPU limits tighten. A hardware encoder gets 150–200% before
   it counts as overused, and a software one does not
   ([video_stream_encoder_resource_manager.cc:650–664](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/video/adaptation/video_stream_encoder_resource_manager.cc#650),
   stated). OpenH264 also brings a QP quality scaler, 24 to 37
   ([h264_encoder_impl.cc:81–82, 855–856](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/modules/video_coding/codecs/h264/h264_encoder_impl.cc#81),
   stated). Under `maintain-framerate`, WebRTC's answer to both is fewer pixels
   ([video_stream_adapter.cc:120–137, 386–400](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/call/adaptation/video_stream_adapter.cc#120),
   stated). graeae sends `maintain-framerate` until its last step
   ([sending.ts:311–312](../../src/app/lib/media/sending.ts)). For a tab, fewer pixels means
   a smaller capture, which can fall under 360 lines, where Chrome keeps OpenH264. A share at
   1080p60 and 12 Mbps on OpenH264 is also heavy for the CPU. Both fit the owner's "poor
   picture".

graeae does not count a CPU limit as the upload's: `readingOf` marks a share limited only on
`qualityLimitationReason === "bandwidth"`
([sending.ts](../../src/app/lib/media/sending.ts)). So graeae's own steps would not explain a
shrink; WebRTC's adaptation would.

## 6. What the page cannot do

Stated:

- `getDisplayMedia` rejects a `min` or `exact` on a display property with a `TypeError`.
  The spec says so
  ([`getDisplayMedia`](https://w3c.github.io/mediacapture-screen-share/#dom-mediadevices-getdisplaymedia)),
  and so does Chromium ("min constraints are not supported", and likewise for exact,
  [user_media_request.cc:459–470](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/user_media_request.cc#459)).
  So a page's `getDisplayMedia` always gets `ANY_WITHIN_LIMIT` (§4).
- The spec leaves `applyConstraints` alone, so `min` and `exact` are allowed there
  ([Screen Capture, "Constrainable Properties"](https://w3c.github.io/mediacapture-screen-share/#constrainable-properties)).
  But Chromium only restarts the capturer when the requested *format* changes
  ([apply_constraints_processor.cc:237–264](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/apply_constraints_processor.cc#237)).
  It also restarts only when the source has a single track
  ([:192–208](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/apply_constraints_processor.cc#192)).
  The restart copies the old capture parameters and changes only the format
  ([media_stream_video_capturer_source.cc:172–187](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/modules/mediastream/media_stream_video_capturer_source.cc#172)),
  so **the resolution policy chosen at `getDisplayMedia` survives `applyConstraints`**.
  `width: {min: W, max: W}` therefore cannot turn a tab into `FIXED_RESOLUTION`. It only
  lowers the maximum, or rescales in the renderer.
- The spec says the user agent SHOULD downscale by the source's pixel ratio by default, and
  MUST NOT upscale ("Downscaling and Frame Decimation", same document). So no constraint
  makes a small tab capture large.

## 7. Candidate page-side fix

This is the smallest change that addresses both §5.1 and §5.3 without a new capture path. It
is a candidate, not a proven fix: §8 decides it.

1. **Prevent the shrinking:** for a share whose track reports `displaySurface: "browser"`,
   send with `degradationPreference: "maintain-resolution"`. WebRTC then drops every pixel
   restriction
   ([video_stream_adapter.cc:130–132](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/call/adaptation/video_stream_adapter.cc#130),
   stated). Under load it lowers the frame rate instead. So `max_pixels` stays unlimited, the
   tab capturer has nothing to snap down to, and OpenH264's quality scaler cannot push the
   size under 360 lines (inferred from §4 and §5).
   - Cost: a busy machine or upload loses frame rate on a tab, not resolution. That is the
     opposite of graeae's choice for other shares.
   - graeae's own 720p and 720p30 steps still apply, through `scaleResolutionDownBy` and
     `maxFramerate`.
   - The change belongs in `degradationPreference`
     ([sending.ts:311](../../src/app/lib/media/sending.ts)) and needs the surface passed in.
2. **Recover once fallen:** when a reading reports `software` on a tab share whose capture
   is at least 360 lines, step the encodings to 720p and back to full with `setParameters`.
   Each changes the encoded size, so WebRTC resets the encoder, and the fallback wrapper and
   `RTCVideoEncoder` try hardware again on each reset (§2, stated). graeae already reads
   `software` ([sending.ts:342–344](../../src/app/lib/media/sending.ts)) and already has the
   step ([sending.ts, `stepEncodings`](../../src/app/lib/media/sending.ts)). Cap it at a few
   tries per share, so a GPU that truly refuses does not flicker.

Rejected:

- `applyConstraints` with a fixed size (§6).
- `resizeMode` (§4).
- Rounding sizes to 16 (§1).
- Changing `contentHint` (§3). `"detail"` or `"text"` would also switch the encoder to
  screen-share mode, which is a quality change of its own, and nothing shows it affects
  hardware use.

## 8. What the Windows run must measure

Run it on the Windows 11 machine that showed the fault, in Chrome, and in Helium if it is
still in use.

**Once a second during each share,** log from the sender's `getStats()` `outbound-rtp`
video entry:

- `encoderImplementation`
- `powerEfficientEncoder`
- `frameWidth` and `frameHeight`
- `framesPerSecond`
- `qualityLimitationReason`
- `qualityLimitationResolutionChanges`
- `targetBitrate`

Log beside them the track's `getSettings()` width, height and `displaySurface`, and the
`media-source` entry's `width`, `height` and `framesPerSecond`. These stats are defined in
[webrtc-stats](https://w3c.github.io/webrtc-stats/#dom-rtcoutboundrtpstreamstats-encoderimplementation).
graeae's `capture.track` line logs the settings only once, at the start
([browser.ts:387–388](../../src/app/lib/media/browser.ts)).

**Runs**, each for at least 3 minutes, sharing a tab that plays 1080p video:

1. The screen, then a window, then a tab, as the app is today. This is the baseline.
2. The tab again. Mid-share: resize its window, open and close devtools, make the video
   fullscreen and back, and switch to another tab and back.
3. The tab with fix 1 (`maintain-resolution`) only.
4. The tab with fixes 1 and 2.

**Read off:**

- **Which hardware encoder** is named while it is in hardware: `D3D12VideoEncodeAccelerator`
  or `MediaFoundationVideoEncodeAccelerator (...)`. Also record `chrome://gpu`'s "Video
  Acceleration Information" for H.264 encode.
- **When the encoder turns to OpenH264, what happened in the same second or the one before:**
  - The capture size changed. That is §5.1.
  - `frameHeight` fell under 360. That is §5.2.
  - Nothing changed. Then the cause is something this note did not find: an error while
    encoding at a steady size.
- **Whether the size, once on OpenH264, keeps falling.** Watch for `qualityLimitationReason`
  `cpu` or `bandwidth`, and `qualityLimitationResolutionChanges` rising. That is §5.3.
- **Whether a window ever changes `frameWidth`/`frameHeight`.** It should not, unless WebRTC
  adapts. A tab should change more often.
- **With fix 1,** whether the tab's capture size holds steady and the encoder stays in
  hardware. **With fix 2,** whether a step-and-back returns the encoder name to hardware.
- **Optionally, logs.** Start the browser with `--enable-logging --v=1` and grep its log for:
  - `Fallback to SW due to low resolution`
    ([rtc_video_encoder.cc:706](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#706))
  - `[VESFW]`
    ([video_encoder_software_fallback_wrapper.cc:356](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/api/video_codecs/video_encoder_software_fallback_wrapper.cc#356))
  - `Can't change frame size`, and `Unsupported frame size`
    ([media_foundation_video_encode_accelerator_win.cc:1200–1209](https://chromium.googlesource.com/chromium/src/+/afcb797daa921994df0138a531569fb815886110/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#1200)).

  The first of these that appears names the trigger.

**A Linux agent** can check only the size half. Chrome on Linux without a hardware encoder
always reports OpenH264. On the fakes, or on a test instance, it can confirm:

- that a tab share's `frameWidth`/`frameHeight` and `getSettings()` size change under load
  with `maintain-framerate`, and hold with `maintain-resolution`;
- that a step-and-back makes WebRTC reconfigure (`frameHeight` goes 720 and back).

Whether hardware comes back needs Windows.
