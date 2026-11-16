# Capture and encoding quality

Type: research
Status: resolved
Branch: research/capture-quality
Map: ../map.md

## Question

Can a browser capture and send a 1080p 60fps screen share of gameplay from the same Windows machine that is running the game, and what does it take?

Establish, for Chromium-based browsers and Firefox on Windows:

- Whether `getDisplayMedia` delivers 60fps at 1080p, which constraints control it, and what happens with fullscreen and borderless games.
- Which codecs each browser can encode for WebRTC (H.264, VP9, AV1, HEVC), which get hardware encoding, and how codec choice interacts between a Chromium sender and a Firefox viewer.
- The settings that decide screen-share quality: content hints, degradation preference, bitrate caps, scalability modes and simulcast for screen content.
- The bitrate that 1080p60 and 720p60 gameplay realistically needs per codec.
- Known problems: capture frame rate dropping when the GPU is saturated by the game, CPU cost of software encoding while gaming, and the cost of encoding the same share more than once (as a direct browser-to-browser design would).
- Whether 720p 30fps webcams add anything notable on top.

The answer feeds [Media transport choice](08-media-transport-choice.md) and [Platform promises](09-platform-promises.md).

## Answer

Full findings: `docs/research/capture-quality.md` on branch `research/capture-quality` (commit `787fa52`). Claims come from Chrome 158 and Firefox 160 source code, W3C specs, MDN and vendor docs, read on 2026-11-15. Nothing was run on a Windows machine, so every frame-rate and CPU outcome is unverified until [Quality proof](13-quality-proof.md).

- **Chromium on Windows can reach 1080p60 if the app overrides the defaults.** Capture runs at 30fps unless the page asks for 60. Hardware H.264 encoding is on by default. Hardware AV1 encoding is off by default on Windows, and HEVC is hardware-only.
- **Firefox on Windows can only reach it in principle.** It captures at 60fps through an older capture path, encodes every codec in software by default, and has no content hint, no scalability mode and no way to capture screen or game audio. 1080p60 from a Firefox sharer is at risk while a game runs.
- **Firefox and H.264.** A Firefox sender caps H.264 to the receiver's advertised level, and Firefox advertises about 720p30 by default, so Firefox senders should use VP9 or AV1.
- **Settings the app must set.** A motion content hint on Chromium, a "maintain frame rate" degradation preference on both, and an explicit maximum bitrate. Without the bitrate setting a 1080p share is capped at 2.5 Mbps in Chromium and 5 Mbps in Firefox, and without the others the browser treats the share like slides and drops frames to stay sharp.
- **Codecs.** Hardware H.264 for a Chromium sender (HEVC only between Chromium browsers); VP9 or AV1 for a Firefox sender.
- **Bitrates (derived from YouTube's live guidance, not measured).** 8 to 15 Mbps for 1080p60 in H.264, 6 to 12 Mbps in VP9, AV1 or HEVC; 4 to 8 Mbps for 720p60; 1.5 to 2.5 Mbps for a 720p30 webcam.
- **Simulcast and scalable coding** only pay off with a media server.
- **Risks.** Exclusive-fullscreen games reportedly freeze in capture on Windows 11 24H2 and later, so sharers need borderless mode. Capture frame rate drops when the game saturates the GPU. Software encoding costs a lot of CPU while gaming. A direct design encodes once per viewer, needing about 47 Mbps of upload for 5 viewers against about 9.5 Mbps through a media server.

Unverified: software encoding CPU cost at 1080p60, whether hardware AV1 is enabled for some Chromium users, H.264 level behaviour between Chromium and Firefox, capture frame delivery under game load, and encoder support per GPU generation. Section 8 of the findings file lists the browser statistics and pass criteria a prototype can use.
