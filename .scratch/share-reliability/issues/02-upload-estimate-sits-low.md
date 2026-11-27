# Why Chrome's upload estimate sits low

Type: research
Status: resolved
Blocked by: none
Map: ../map.md

## Question

On the owner's 288 Mbps upload, with nothing lost and a round trip of a few milliseconds to Cloudflare's media server, Chrome's estimate of the upload (`availableOutgoingBitrate`) sat at 5 to 10 Mbps for minutes. Chrome said `qualityLimitationReason` "bandwidth" for up to a minute at a time and sent close to its estimate, well under the share's 12 Mbps limit. So a healthy sharer often gives every watcher less than the full quality. Why, and what can graeae do about it within 12 Mbps?

Context: the readings, second by second, are in the comments of [v1-build ticket 18](../../v1-build/issues/18-sharers-notes-and-weak-upload.md); the open question is in [v1-build ticket 30](../../v1-build/issues/30-weak-upload-signal.md), which this map takes over for the cause only. The sender is set up in `src/app/lib/media/browser.ts` (`contentHint` "motion", `degradationPreference`, encodings from `src/app/lib/media/encodings.ts`); the media server is Cloudflare Realtime SFU, reached through `src/instance/media/cloudflare.ts`.

Find, from primary sources (Chromium/WebRTC source and bug tracker, Cloudflare Realtime docs and community answers from Cloudflare staff, IETF drafts):

- How Chrome's send-side estimate (Google congestion control with transport-wide feedback) grows, and why it stalls when the encoder does not fill it (application-limited: a screen share whose picture is often still or simple, ALR, padding and probing rules).
- What Cloudflare's media server sends back (transport-wide congestion control feedback, REMB, its own probing and padding) and any documented limits or behaviour that would hold a sender's estimate down.
- What a page can do without raising the 12 Mbps limit: start bitrate, `x-google-start-bitrate`/`x-google-min-bitrate` and whether Chrome still honours them, `contentHint`, `degradationPreference`, keeping the encoder busy, `RTCRtpEncodingParameters` fields. Cost and risk of each.
- What an agent on this Linux server can measure on `graeae-test` with `scripts/real-media/` (software encoding) to tell the causes apart without the owner, and what only Windows can show.

Answer with the likely cause or causes, ranked, the candidate fixes, and the measurements that would settle them.

## Answer

Findings: `docs/research/upload-estimate.md`. From WebRTC's source (branch 8127, Chrome 158); nothing measured yet.

Causes, ranked:

1. **Once the estimate falls, Chrome can barely raise it again** (certain from the code; how it plays out on the owner's line is inferred). With no maximum in the answer (no `b=AS`, no `x-google-max-bitrate`, and graeae's has neither), every probe is capped at a built-in 5 Mbps. `contentHint` "motion" switches off the regular probing screen content gets while calm. Without probes the estimate grows only to 1.5× what is sent (hence 5 to 6 Mbps while calm) and, after a fall, by about 45 kbps a second, some 140 s from 5.6 to 12 Mbps, faster only once motion makes the encoder overshoot.
2. **The falls are probably false congestion signals:** Chrome cuts to 0.85× what was just delivered when it sees delay growing, which matches both falls in ticket 18; with no loss and a few ms round trip, the trigger is timing jitter from the sharer's machine, network card, the encoder's bursts or the media server's arrival times. Which, unknown.
3. **Less likely, the media server:** a REMB cap, or loss in its feedback that the statistics do not show. Cloudflare does not document its feedback.

Two qualities probably hid this by keeping more data flowing.

Fixes within 12 Mbps:

- **A. `x-google-max-bitrate` (about 20000) on the video codec in the received answer**, in the hook that already rewrites Opus: a few lines. Probes up to about 24 Mbps go to the media server, which costs no usage (uploads into Cloudflare are free), but if the media server forwards probe padding, watchers may freeze as they did on the 720p quality: measure first. `b=AS` is the fallback if Chrome stops counting the codec maximum.
- **B. Regular probing while calm** (`contentHint` "detail" or none, or nudging `maxBitrate`): small, only useful with A; "detail" goes against ticket 17's "motion".
- **C. `x-google-start-bitrate`:** one line, low risk, helps the first seconds only.
- **D. `x-google-min-bitrate`:** not recommended; on a real weak upload it sends into loss.
- **E. Keeping the encoder busy** (padding, a second quality, a filler track): more work, and A with B does the job.

`degradationPreference`, `priority` and the other encoding parameters do not change how the estimate grows. Aside: graeae rewrites its own **offer** for Opus stereo before `setLocalDescription`, which RFC 9429 §5.4 forbids; rewriting the received answer, as A does, is allowed.

What can be measured from this server (Measure the upload estimate from this server) and what only Windows shows (where the falls come from on the owner's machine, whether A is enough there, the 854×480 OpenH264 spells, what "detail" costs on real games) are set out in the doc.
