# A better codec at 12 Mbps

Type: research
Status: resolved
Blocked by: none
Map: ../map.md

## Question

Is there a codec that gives a Chromium screen share a better picture at the same 12 Mbps and 1080p60 than today's hardware H.264 baseline (`42001f`), while every watcher, Firefox included, decodes it, with one codec per share and no per-watcher fallback?

Context: the reasons for baseline today are in the comment on `Codec` in `src/shared/encoding.ts`: Chrome on Windows encodes constrained baseline in software; the media server answered main or high with VP8 **on a share sent at two qualities**, and two qualities are now off, so a share sends one quality; Firefox was said not to decode main or high. Earlier research is in `docs/research/capture-quality.md` and in [Capture and encoding quality](../../v1/issues/02-capture-and-encoding-quality.md). The owner's machines have an RTX 5070 Ti and an RTX 5060 Ti.

Find, from primary sources:

- Whether Chrome on Windows encodes H.264 main or high in hardware for WebRTC, and whether Cloudflare's media server accepts and forwards it on a share of one quality.
- Whether Chrome on Windows encodes AV1 (and VP9) in hardware for WebRTC on current NVIDIA and other common GPUs, from which version, and what it falls back to on a GPU without it; whether Cloudflare's media server forwards AV1.
- Whether current Firefox on Windows decodes each candidate in WebRTC, and Chromium on Linux.
- How much better each looks at the same bitrate for screen content and games, from published measurements.
- How the page would choose: one codec per share by what the sharer's browser can encode in hardware (`RTCRtpSender.getCapabilities`, `MediaCapabilities.encodingInfo` with `webrtc`), and what that means for a watcher who cannot decode it.

Answer with each candidate's yes or no on every condition above, a recommendation (including "stay on baseline"), and what the Windows evidence run must measure to confirm it.

## Answer

Findings: `docs/research/codec-at-12-mbps.md`.

- **H.264 high (`6400xx`) in hardware is the only candidate that meets every condition**, pending the Windows evidence run. Chrome on Windows encodes it in hardware (owner's quality proof on both GPUs; Chromium's Media Foundation encoder lists baseline, main and high); Cloudflare forwarded it on a share of one quality (quality proof); Firefox on Windows decodes it through its Windows decoder (Mozilla, bug 1951596, and the quality proof), so the "Firefox cannot decode main or high" basis in `src/shared/encoding.ts` is wrong; the "never main or high" rule otherwise came from two qualities, now off. Gain: modest, CABAC saving about 9 to 14% of bitrate on broadcast material, unmeasured on games and screens.
- **AV1: no.** Chrome's hardware AV1 encoding for WebRTC (`WebRtcAV1HWEncode`) is off on Windows in Chrome 159 and on `main`, so it encodes in software. Revisit when Chrome turns it on.
- **VP9: no.** NVIDIA and AMD have no VP9 encoder.
- **Recommendation:** put high first in the codec list, offered only when `getCapabilities` lists `6400` and `encodingInfo` (`type: "webrtc"`) says `powerEfficient`; otherwise baseline as today, VP8 last. `codecPreferences()` already offers only the first codec the browser has, so the change is small. High, not main: main is listed even without hardware. Adopt only if the Windows run shows a measurable gain, and CABAC is actually on.
- **For the Windows evidence run:** with high offered alone at one quality, 1080p60, 12 Mbps on each GPU: the answer's codec and fmtp, `encoderImplementation` and `powerEfficientEncoder`; at Chrome, Firefox (Windows decoder or OpenH264) and Linux Chromium watchers, 5 minutes of `framesDecoded`, `framesPerSecond`, `freezeCount`, `keyFramesDecoded`, `framesDropped`; CABAC and 8×8 transform flags from the PPS; baseline against high on the same game clip and desktop scroll (`qpSum / framesEncoded`, encode time, a fast-scene screenshot, VMAF or PSNR if possible); a 144 Hz game holding its frame rate with high on.
