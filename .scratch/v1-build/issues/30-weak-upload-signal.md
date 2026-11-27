# 30: Telling a weak upload apart

**What to build:** Switch the step-down back on (`STEP_DOWN` in `src/app/lib/media/sending.ts`), with its note, once something in the sharer's own statistics tells a weak upload apart from Chrome's estimate sitting low on a healthy one.

**Why:** ticket 18 built the step-down (1080p, then 720p60, then 720p30, never ended) and switched it off after the owner's check on Cloudflare. On the owner's 288 Mbps upload, with nothing lost and a round trip of a few milliseconds, Chrome's estimate of the upload (`availableOutgoingBitrate`) sat at 5 to 10 Mbps for minutes. Chrome said `qualityLimitationReason` "bandwidth" for up to a minute at a time, and sent close to its estimate. Under a 10 Mbps cap the statistics read the same. Every step down and every "Your upload can't carry 1080p" was false. Ticket 18's comments hold the readings, second by second; the dumps are the owner's.

Spec: [Encoding and quality](../spec.md#encoding-and-quality). User story 63.

Blocked by: 18

Status: ready-for-human (after 0.1)

- [ ] Why Chrome's estimate sits at 5 to 10 Mbps on a 288 Mbps upload to the media server: the media server's feedback, Chrome's own congestion control, or the path. Compare a share to a second Chrome directly, or with `chrome://webrtc-internals`'s event log
- [ ] A sign, measured on the owner's link and under caps of 10 and 3 Mbps, that holds under the cap and never on the healthy upload over a whole match. Ticket 18's candidates: the estimate's peak over a long window, loss, a growing round trip
- [ ] The step up decided by the same sign, not by 30 seconds without "bandwidth", which stepped up under the cap
- [x] What to do about Chrome's spells below 720 lines in software (OpenH264) on a healthy upload: 15 to 60 seconds at a time, several times a match. `maintain-resolution` above the last step is the candidate; ticket 18 kept resolution first

## Comments

**2026-11-20: triage for the 0.1 release.** Not in 0.1. The step-down is switched off (`STEP_DOWN`), so a weak upload is not stepped down and nothing false is said; the spec and README promise no step-down. After the release, this needs the owner: every reading so far comes from their Windows sharer on their own 288 Mbps upload with the hardware encoder, which is where the false sign appears.

**2026-11-22, from [A share that opens small](../../share-reliability/issues/13-a-share-that-opens-small.md).** The last item is decided: [A screen share keeps its size](53-a-screen-share-keeps-its-size.md) sends every Chromium screen share under "maintain-resolution" above its last step. Under "maintain-framerate" a share opened small and in software on Linux and on the owner's Windows machine, and often stayed that way. Any step-down built here starts from "maintain-resolution": between steps the browser gives up frame rate, not size.

**2026-11-22, built by [A screen share keeps its size](53-a-screen-share-keeps-its-size.md).** The last item is ticked: every Chromium screen share now goes out under "maintain-resolution" above its last step, from `encodingPlan`'s `degradation` (`src/shared/encoding.ts`), and stays "balanced" at its last step. A step-down built here keeps that and sets each step's scale and frame rate itself.
