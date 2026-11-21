# Why a shared tab falls back to software encoding

Type: research
Status: resolved
Blocked by: none
Map: ../map.md

## Question

On Windows 11 in Chrome or Helium, a screen share of a **tab** went out on Chrome's software H.264 encoder with a poor picture, while a window or the entire screen shared from the same machine went out in hardware with a good one. Why, and what can graeae's page do so that a tab goes out in hardware like a window?

Context: the owner's report and an unchecked guess are in [ticket 39's closing comment](../../v1-build/issues/39-instant-feedback-on-watch.md). The guess is that a tab is captured at its viewport's own size, which can be odd or not a multiple of 16, that Chrome's Media Foundation H.264 encoder refuses such a size, and that Chrome then falls back to OpenH264. A window capture on `graeae-test` came in at 1920×1078, so sizes do vary. The capture request is `screenCapture` in `src/app/lib/media/capture.ts`; the encodings and codec order are `src/shared/encoding.ts` and `src/app/lib/media/encodings.ts`; the sharer's note on software encoding reads `encoderImplementation` in `src/app/lib/media/sending.ts`. Codec today: H.264 baseline (`42001f`), one quality at 1080p60, 12 Mbps, `contentHint` "motion".

Find, from Chromium's source and bug tracker (primary sources only):

- When Chrome on Windows falls back from the hardware H.264 encoder to OpenH264 for a WebRTC sender: frame size rules (odd, not a multiple of 2 or 16, aspect), pixel format or frame storage (a tab's frames from the compositor versus a window's from Windows Graphics Capture), resolution changes mid-share, `contentHint`, `scaleResolutionDownBy`. Whether the fallback is permanent for the sender once taken.
- How a tab capture is sized against graeae's constraints (`width`/`height` max, `frameRate` 120), and what `resizeMode` or other constraints would make every tab capture a size the hardware encoder takes.
- The smallest page-side change that makes a tab capture encode in hardware, and how an agent on Linux (software only) or an agent on Windows would confirm it.

Answer with the likely cause, the candidate fix, and exactly what the Windows evidence run must measure to settle it.

## Answer

Findings: `docs/research/tab-share-encoding.md` on the branch `research/tab-share-encoding` (commit `21412ab`), never merged; read with `git show research/tab-share-encoding:docs/research/tab-share-encoding.md`. Inferred from Chromium's source; only the Windows evidence run confirms it.

- **The odd-size guess is wrong.** Chrome rounds every captured frame down to an even size, tab and window alike; neither Windows hardware encoder (D3D12, then Media Foundation) needs a multiple of 16, only an even size within the GPU's range. graeae's `scaleResolutionDownBy` is 1 at 1080 lines or fewer. A tab's frames are stored as a window's are, and `contentHint` never picks hardware or software.
- **Likely cause: a tab's capture size changes during a share, a window's does not.** A tab follows its viewport (resizing, devtools, fullscreen), and under graeae's max-only constraints the tab capturer also shrinks itself in 90-line steps whenever WebRTC asks for fewer pixels, where a window keeps its size and is scaled in the renderer. Every size change resets the encoder, and a failed reset drops to OpenH264 until the next change; below 360 lines Chrome picks OpenH264 on purpose. Once in software, `maintain-framerate`'s quality scaler and WebRTC's stricter CPU limits for software push the size down further, which for a tab shrinks the capture itself: a trap, small and in software.
- **The page cannot pin a tab's size:** `getDisplayMedia` rejects `min` and `exact`, `applyConstraints` keeps the policy set at the start, and `resizeMode` changes nothing for a tab.
- **Candidate fix, two small parts.** (1) For a share whose `displaySurface` is `"browser"`, send with `degradationPreference: "maintain-resolution"`, so WebRTC never asks the tab capturer for fewer pixels; the cost is that a busy tab drops frame rate rather than resolution. (2) When the sender names a software encoder on a tab share of 360 lines or more, step the encodings to 720p and back with `setParameters`, a few times per share at most, since Chrome tries hardware again at each reset; graeae already detects software encoding and has the 720p step.
- **For the Windows evidence run:** once a second, the sender's `encoderImplementation`, `powerEfficientEncoder`, frame size and rate, `qualityLimitationReason`, `qualityLimitationResolutionChanges`, `targetBitrate`, beside the track's `getSettings()` size and `displaySurface`. Runs of 3 minutes or more sharing a tab playing 1080p video: screen, window, tab as today; the tab while resizing, opening devtools, going fullscreen and switching tabs; the tab with fix 1; with fixes 1 and 2. At the second the encoder turns to OpenH264, see what came just before: a size change (failed reset), a height under 360 (the rule), or nothing (an error the source does not show); whether the size keeps falling in software; which hardware encoder is named (and `chrome://gpu`). Optionally Chrome's verbose log; the lines to look for are in the doc.
- **A Linux agent can check the size behaviour only** (Chrome there always encodes in software): whether a tab capture shrinks in steps, and whether fix 1 stops it.
