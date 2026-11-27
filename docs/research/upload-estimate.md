# Why Chrome's upload estimate sits low on a fast, clean line

Researched 2026-11-21 for ticket `share-reliability/02` (the upload estimate sits low),
against the WebRTC and Chromium code on branch-head 8127 (Chrome 158, the stable
release since 2026-11-12, as earlier research on this repo found), WebRTC `main` at
`97e37190` where a file was not fetched from 8127, the IETF drafts and RFCs, and
Cloudflare's Realtime docs and staff posts. graeae's code is cited from `3747279`.

Link prefixes used below:

- **W** = `https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/`
- **Wm** = `https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/`
- **C** = `https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8127/`

Where 8127 and `main` were both fetched, `probe_controller.cc`,
`aimd_rate_control.cc`, `link_capacity_estimator.cc`, `trendline_estimator.cc`,
`alr_detector.cc`, `alr_experiment.cc` and `webrtc_media_engine.cc` are identical.
Everything marked **inferred** is a reading of the code that no source states.

## What the owner saw, in short

From ticket 18's comments and ticket 30:

- On a 288 Mbps upload, with nothing lost and a 1–9 ms round trip to Cloudflare, the
  estimate (`availableOutgoingBitrate`) sat at about 5–6 Mbps while the picture was calm,
  and graeae sent 3–6 Mbps.
- In motion it climbed to 17–19 Mbps over 10–20 s.
- Twice it fell suddenly, from 17.3 to 5.6 and from 20.9 to 4.5. Each time it landed at
  about 0.85 times what had just been sent, and it took 15 s or more to climb back.
- With no cap set (17:48–17:51) it stayed at 5–11 Mbps for minutes. Chrome reported
  `qualityLimitationReason` "bandwidth" for 40–60 s at a time.
- The two-quality share had hidden all this.

## Summary

| Rank | Cause | Confidence | Fits |
|---|---|---|---|
| 1 | Once the estimate falls, Chrome has almost no way to raise it fast. Every probe is capped at **5 Mbps**, because graeae's SDP sets no maximum. `contentHint = "motion"` switches off the periodic probing that screen content gets by default. What is left grows by at most 1.5× what is actually being sent, and only about **45 kbps a second** near the last fall. | Mechanism read from source; how it plays out on the owner's line is inferred | Minutes at 5–11 Mbps; ~5–6 Mbps while calm; slow climbs back |
| 2 | The falls themselves: the delay-based detector decides the line is overused when it is not. With no loss and a few ms of round trip, the trigger is variation in send or arrival times: the sharer's machine, its Wi-Fi or network card, the encoder's bursts, or how the media server stamps arrival times. | Likely; which source it is is unknown | Falls to 0.85× what was just sent, with no loss |
| 3 | A limit from the media server: a REMB, or loss in transport-wide feedback that RTCP receiver reports do not show. | Less likely; not ruled out | Would look like a ceiling, not a fall |

| Fix within the 12 Mbps limit | What it changes | Cost | Risk |
|---|---|---|---|
| **A.** Give the call a maximum in the answer before `setRemoteDescription` (`x-google-max-bitrate` on the video codec) | Probes may go up to that maximum, not 5 Mbps. The probes after a fall and on allocation changes can restore the estimate in a second instead of minutes. | A few lines in the hook that already rewrites the answer (`stereoOpus`) | Probes reach up to 2× 12 Mbps on the upload. If the media server forwards probe padding to watchers, they may freeze the way they did on the 720p quality. Usage is unchanged, since traffic into Cloudflare is free. |
| **B.** Periodic probing while the picture is calm: `contentHint` "detail" or none, or nudging `maxBitrate` down and back up | A probe every 5 s at 2× the estimate while sending little. Needs A to reach past 5 Mbps. | Small | "detail" also changes how the encoder trades resolution for frame rate (ticket 17 chose motion). Nudging `maxBitrate` may reconfigure the encoder. |
| **C.** `x-google-start-bitrate` | Only the first seconds: the first probes go to 3× and 6× the start rate | One line | Low; too high a start hurts a weak upload at the start |
| **D.** `x-google-min-bitrate` | A floor under the estimate | One line | High: on a weak upload it keeps sending into loss and freezes. Not recommended. |
| **E.** Keep the encoder busy (padding, a second quality, a filler track) | Keeps sending near the estimate, so the 1.5× cap and the probing stay high | Medium to large | Two qualities are off because watchers froze on the padded quality; a filler costs the sharer upload and CPU |

`degradationPreference`, `priority`, `networkPriority` and the other
`RTCRtpEncodingParameters` fields do not take part in how the estimate grows
(**inferred**: none of them reach `ProbeController` or `AimdRateControl` in the code
below).

## 1. How Chrome grows its estimate

### Where `availableOutgoingBitrate` comes from

- It is the call's send bandwidth: `rtc_stats_collector.cc` copies
  `call_stats.send_bandwidth_bps` into `available_outgoing_bitrate`
  ([Wm `pc/rtc_stats_collector.cc` 1676–1681](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/pc/rtc_stats_collector.cc#1676)).
- That is `last_bandwidth_bps_`, which `Call` sets to the congestion controller's
  `target_rate` on every update
  ([Wm `call/call.cc` 1035, 1173](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/call/call.cc#1173)).
- So the figure graeae logs is GoogCC's target, the rate the encoder is allowed to use.
  It is not a measurement of the line.

### Delay-based detection (the falls)

- **Grouping.** Chrome groups packets sent within 5 ms and compares their send and
  arrival times from transport-wide feedback
  ([draft-holmer-rmcat-transport-wide-cc-extensions-01](https://datatracker.ietf.org/doc/html/draft-holmer-rmcat-transport-wide-cc-extensions-01);
  the algorithm is described in
  [draft-ietf-rmcat-gcc-02](https://datatracker.ietf.org/doc/html/draft-ietf-rmcat-gcc-02)).
- **The trendline.** `TrendlineEstimator` fits a line through the smoothed delay
  (smoothing 0.9) and multiplies the slope by up to 60 deltas and a gain of 4.
  ([W `trendline_estimator.cc` 37–38, 112–114, 273](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/trendline_estimator.cc#37)).
- **Overuse.** It signals overuse once that value stays above an adaptive threshold for
  more than 10 ms, over more than one sample
  ([286](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/trendline_estimator.cc#286)).
- **The threshold.** It starts at 12.5. It rises at k_up 0.0087 and falls at k_down
  0.039, clamped to 6–600
  ([173–176, 318–322](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/trendline_estimator.cc#173)).
- **Inferred:** on a line where real queuing is near zero, the threshold drifts down
  towards its floor. Small, repeated growth in delay then trips it: a few milliseconds
  of queuing in the sender's own stack, Wi-Fi, a busy machine, or the receiver's arrival
  stamps. Loss plays no part.
- **What happens on overuse.** `AimdRateControl` sets the estimate to **0.85 × the
  acknowledged throughput − 5 kbps**, and holds
  ([W `aimd_rate_control.cc` 35, 271–311](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/remote_bitrate_estimator/aimd_rate_control.cc#271)).
  The cut is from what was actually delivered, not from the estimate. That is the
  "about 0.85 times what had just been sent" in ticket 18.

### Growth after a fall

All of these lines are in
[W `aimd_rate_control.cc`](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/remote_bitrate_estimator/aimd_rate_control.cc#231).

- **The cap.** An increase is never larger than **1.5 × the acknowledged throughput +
  10 kbps** (lines 238–239). The estimate cannot run far ahead of what the encoder
  actually sends.
  - **Inferred:** a calm picture at 3–4 Mbps holds the estimate near 4.5–6 Mbps. That
    is ticket 18's "about 5–6 Mbps while calm".
- **Two speeds.** Growth uses one of two speeds, depending on whether Chrome has an
  estimate of the link's capacity (248–265).
  - **No capacity estimate: multiplicative.** +8% a second (alpha 1.08, lines 346–352).
    For example, 5.6 Mbps × 1.08¹⁵ ≈ 17.8 Mbps, close to ticket 18's climb to 17–19
    over 10–20 s.
  - **A capacity estimate: additive.** The rate per second is one average packet per
    2 × (RTT + 100 ms) (lines 191–206). At 5.6 Mbps and a 5 ms round trip that is
    about 9,300 bits / 0.21 s ≈ **44 kbps a second**, so about 140 s to get from 5.6 to
    12 Mbps.
- **The capacity estimate.** Each overuse updates it from the throughput at that
  moment, with weight 0.05
  ([W `link_capacity_estimator.cc` 38–41](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/link_capacity_estimator.cc#38)).
  Its upper bound is estimate + 3·√(deviation · estimate), with the deviation clamped to
  0.4–2.5 (lines 21–33, 62). That is only about 0.35 Mbps above a 5 Mbps estimate.
  - It is cleared, and growth goes back to multiplicative, only when the throughput
    exceeds that upper bound (AIMD lines 232–233), or falls below the lower bound on an
    overuse (299–302).
  - **Inferred:** after a fall, the encoder has to send more than the estimate it was
    just given before growth speeds up again. In motion it does, because its 12 Mbps
    target is above the estimate and the pacer sends 1.1× it. While calm it does not.
- **Option, off by default.** A field trial,
  `WebRTC-DontIncreaseDelayBasedBweInAlr`, can stop growth entirely while sending
  little (lines 83, 240–246).

### Probing, and why it stops at 5 Mbps

All of these lines are in
[W `probe_controller.cc`](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/probe_controller.cc#40).
Probes are short bursts sent above the current rate (padding, or retransmissions of
recent packets). A successful probe sets the estimate directly, skipping the slow
growth above
([Wm `delay_based_bwe.cc` 237–240](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/modules/congestion_controller/goog_cc/delay_based_bwe.cc#237)).

- **The 5 Mbps ceiling.** The file sets
  `kDefaultMaxProbingBitrate = 5000 kbps`, "Applied only when the application didn't
  specify max bitrate" (lines 40–43). `SetBitrates` uses it whenever the maximum it is
  given is not finite (196–197).
- **Why graeae's maximum is not finite.** It comes from the remote description.
  - Send parameters take `max_bandwidth_bps` from the answer's `b=AS`
    ([Wm `pc/channel.cc` 120](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/pc/channel.cc#120)).
  - With no `b=AS`, the video channel sets the call's maximum to −1. It is replaced only
    by the codec's `x-google-max-bitrate`
    ([W `webrtc_video_engine.cc` 1355–1390](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_video_engine.cc#1355);
    [W `webrtc_media_engine.cc` 101–124](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_media_engine.cc#101)).
  - The transport controller turns −1 into infinity
    ([W `rtp_transport_controller_send.cc` 77–79](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/call/rtp_transport_controller_send.cc#77)).
  - graeae's answer has neither (**inferred** from `src/app/lib/media/browser.ts`, which
    changes only Opus in the answer; check with the measurement in §4).
- **Every probe is clipped to that ceiling.** Probe rates are limited to the maximum,
  or to 2× the allocated bitrate if that is lower (566–576), and clipped (609–613).
  - With graeae's 12 Mbps encoding, that is min(5 Mbps, 24 Mbps) = **5 Mbps** for
    every probe: the first ones, the allocation probes, the periodic ones and the ones
    after a fall.
  - **Inferred:** once the estimate is above 5 Mbps, probing can never raise it. Only
    the AIMD growth above can.
- **First probes.** At 3× and 6× the start rate, then stepping by 2× (87–89). The start
  rate defaults to 300 kbps
  ([Wm `pc/peer_connection_factory.cc` 381–392](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/pc/peer_connection_factory.cc#381)), so 900 kbps and 1.8 Mbps. They stop at 5 Mbps.
- **Probes on an allocation change.** These fire when the encoder's allocation rises
  above its previous value, at 1× and 2× the allocation, limited to 2× the current
  estimate. They fire only when the estimate is below both the maximum and the
  allocation (111–117, 220–261).
- **The probe after a fall.** It probes at 0.85 × the rate before the fall. It fires
  only if:
  - the estimate fell below 0.66 × its value, and recovered within 5 s;
  - at least 5 s have passed since the last such probe;
  - the sender is in ALR (sending well under the estimate) or left it under 3 s ago.

  See lines 44–60 and 385–414.
  - **Inferred:** the owner's falls happened in motion, while sending near the estimate,
    so this probe probably did not fire. If it did, it was capped at 5 Mbps.
- **Periodic probes.** While in ALR, a probe every 5 s at 2× the estimate (96–97,
  442–446). Only if periodic ALR probing is switched on, which it is not by default
  (171).
- **States with no probes.** None are sent while the estimate is held by rising delay,
  by loss, or by a high round trip (579–584).

### Who switches on periodic probing: the content hint

- **What `"motion"` maps to.** Chromium maps `contentHint` "motion" to WebRTC's
  `kFluid`, "detail" to `kDetailed` and "text" to `kText`
  ([C `media_stream_video_webrtc_sink.cc` 57–62](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8127/third_party/blink/renderer/modules/peerconnection/media_stream_video_webrtc_sink.cc#57)).
- **Screencast or not.** `kFluid` sets `is_screencast = false`; `kDetailed` and `kText`
  set it true. With no hint, the source's own flag applies; a screen capture's flag is
  true (**inferred**, not traced in Chromium)
  ([W `pc/rtp_sender.cc` 1646–1661](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/pc/rtp_sender.cc#1646)).
- **Content type.** A screencast is encoded as `ContentType::kScreen`. Anything else is
  `kRealtimeVideo`
  ([W `webrtc_video_engine.cc` 2403–2411](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_video_engine.cc#2403)).
- **Which settings each type reads.** `kScreen` reads the `WebRTC-ProbingScreenshareBwe`
  settings; others read `WebRTC-StrictPacingAndProbing`. When there are settings, the
  stream switches on periodic ALR probing
  ([W `video_send_stream_impl.cc` 175–186, 497–523](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/video/video_send_stream_impl.cc#175)).
- **Screen share is on by default.** `WebRTC-ProbingScreenshareBwe` is "now default-on
  with fixed settings" `1.0,2875,80,40,-60,3`
  ([W `rtc_base/experiments/alr_experiment.cc` 25–26, 50–56](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/rtc_base/experiments/alr_experiment.cc#50)).
  `WebRTC-StrictPacingAndProbing` has no default.
- **So:** a screen share with no hint, or with "detail", gets a probe every 5 s while
  calm. graeae's "motion" share (`src/app/lib/media/browser.ts:86`) does not.
- **The ALR detector.** It uses the screen-share settings whenever they exist, which by
  the default above is always
  ([W `alr_detector.cc` 30–55](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/alr_detector.cc#30)).
  So ALR is detected the same way either way. Only the probing differs (**inferred**).

### Padding

- **A single quality.** It pads only up to `min_transmit_bitrate`, which is 0 unless the
  content is a screencast with `screencast_min_bitrate_kbps` set
  ([W `video_send_stream_impl.cc` 107–170](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/video/video_send_stream_impl.cc#107);
  [W `webrtc_video_engine.cc` 2403–2407](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_video_engine.cc#2403)).
  Whether Chromium sets that option was not found.
- **Several qualities.** It pads up to the lower qualities' targets plus part of the top
  quality's (×1.35 for screen content, line 87).
- **Inferred:** this is why the two-quality share kept the throughput, and with it the
  1.5× cap, higher, and why it hid the problem.

### Other limits on the estimate

- **REMB.** A REMB from the far side is passed to `UpdateReceiverEstimate`
  ([W `goog_cc_network_control.cc` 245–247](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/goog_cc_network_control.cc#245)).
  It caps the target
  ([W `send_side_bandwidth_estimation.cc` 279–280, 296](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/send_side_bandwidth_estimation.cc#279)).
- **Loss-based BWE v2.** It is on by default and counts loss from transport-wide
  feedback by bytes
  ([Wm `loss_based_bwe_v2.cc` 408–410, 473](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/modules/congestion_controller/goog_cc/loss_based_bwe_v2.cc#408)).
  **Inferred:** it could hold the estimate while `packetsLost` in the receiver reports
  stays at 0, if transport feedback reports packets missing that are later recovered.
- **The pacer.** It sends at 1.1× the target with send-side estimation
  ([W `goog_cc_network_control.cc` 55–58](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/goog_cc_network_control.cc#55)).

## 2. What Cloudflare sends back

- **Not documented.** Cloudflare's Realtime docs do not say whether the media server
  sends transport-wide feedback, RFC 8888 feedback or REMB to a publisher, nor whether
  it probes. Neither the
  [limits page](https://developers.cloudflare.com/realtime/sfu/platform/limits/) nor the
  [simulcast page](https://developers.cloudflare.com/realtime/sfu/features/simulcast/) mentions
  congestion feedback from the publisher. The simulcast page's `priorityOrdering` and
  `ridNotAvailable` concern watchers' bandwidth.
- **No ingest limit.** The limits page lists none, only a 30 s media inactivity timeout.
- **Staff post.** In
  ["Cloudflare Calls: millions of cascading trees all the way down"](https://blog.cloudflare.com/cloudflare-calls-anycast-webrtc/),
  Cloudflare staff write: "There is no active bandwidth management". The limit is "the
  bandwidth available between Cloudflare and the client", and NACKs are generated in the
  network. The post does not mention TWCC, REMB or probing.
- **Inferred:** the media server most likely answers the `transport-cc` feedback Chrome
  offers (the estimate behaves like send-side GoogCC: falls of 0.85× and 8%/s climbs).
  It probably sends no REMB cap. The SDP answer and an event log settle both (§4).
- **Usage.** "Traffic published into Cloudflare is free, including when no client
  subscribes to that publication"; only egress is billed
  ([Realtime pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)).
  Probes and padding from the sharer cost no usage. Whatever the media server forwards
  to watchers would.
- **What the 720p padding suggests.** graeae's note on two qualities says "the media
  server pads the 720p quality of an H.264 share while probing for bandwidth", and
  viewers froze (`src/shared/encoding.ts:15–19`). **Inferred:** that padding may have
  been Chrome's own probes and padding on the 720p quality, passed through to watchers.
  If so, fix A, which allows larger probes, carries the same risk on the one quality.

## 3. What the page can do

### A. A maximum in the answer

- **Where.** In the answer, before `setRemoteDescription`
  (`src/app/lib/media/browser.ts:173` and `:225`, beside `stereoOpus`).
- **What to write.** Add `x-google-max-bitrate=<kbps>` to the `a=fmtp` line of the
  video codec graeae sends (H.264 baseline or VP8). Aim around 20000:
  above 12 Mbps plus audio and overhead.
- **What it changes.**
  - It sets the call's maximum
    ([W `webrtc_media_engine.cc` 118–122](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_media_engine.cc#118)).
  - That reaches `ProbeController::SetBitrates`, so probes may go up to
    min(20 Mbps, 2 × allocation).
  - When the maximum rises while probing is complete, Chrome probes at the new maximum
    straight away
    ([W `probe_controller.cc` 208–213](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/modules/congestion_controller/goog_cc/probe_controller.cc#208)).
  - It does not change the encoder's maximum. The codec maximum applies to the encoder
    only when no encoding has its own `maxBitrate`, and graeae's always does
    ([W `webrtc_video_engine.cc` 2436–2457](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_video_engine.cc#2436)).
- **`b=AS` instead.** It also works for the call's maximum (1377–1387). It sets the
  sender's own maximum too (2183, 2441), and it covers the whole m-section.
  `x-google-max-bitrate` is the narrower change.
- **Allowed.** Changing a received answer is permitted: an application "MAY modify the
  received SDP, subject to the same constraints, before calling setRemoteDescription"
  ([RFC 9429 §5.4](https://www.rfc-editor.org/rfc/rfc9429.html#section-5.4), which obsoletes
  RFC 8829). The same section says the SDP from `createOffer` "MUST NOT be changed"
  before `setLocalDescription`, which `stereoOpus` on the offer does today. Out of
  scope here; noted only.
- **Cost.** A few lines, and the existing hook.
- **Risks.**
  - A source TODO says the codec maximum "should probably not affect global call max
    bitrate" (`webrtc_video_engine.cc` 1361–1362), so a later Chrome may stop honouring
    it. `b=AS` would be the fallback.
  - The estimate is clamped to that maximum, which is harmless at 20 Mbps.
  - Probes up to 20–24 Mbps go to Cloudflare. That costs nothing, but on a real weak
    upload it adds short bursts. Probing stops in loss-limited and delay-limited states
    (`probe_controller.cc` 579–584).
  - The open question is whether the media server forwards probe padding to watchers
    (§2). Measure it before shipping.

### B. Periodic probing while the picture is calm

- **The hint.** Drop `contentHint` or set it to "detail". Probing then works the screen
  share way: every 5 s at 2× the estimate while sending little, with pacing factor 1.0.
  - Without A it stops at 5 Mbps, so B only helps together with A.
  - Cost: one line.
  - Risk: a screencast also loses automatic resizing
    (`webrtc_video_engine.cc` 963–966, 2510) and changes how the encoder trades
    resolution for frame rate. graeae sets `degradationPreference` explicitly
    (`browser.ts:247–250`), which limits that, but ticket 17 chose "motion" for games.
    This needs a check with fast content.
- **A field trial instead.** `WebRTC-StrictPacingAndProbing` gives the same probing to
  "motion" content, but a page cannot set field trials.
- **Nudging the allocation.** Lowering `maxBitrate` a little and raising it back makes
  the allocation "rise". That triggers allocation probes at 1×/2× the allocation
  (`probe_controller.cc` 220–261; the previous allocation is stored even when it falls,
  line 267).
  - Needs A.
  - Risk: every `setParameters` reconfigures the encoder, and may cost a keyframe or a
    stutter (**inferred**).

### C. `x-google-start-bitrate`

- **Where.** In the same `a=fmtp` line. It sets the start rate
  ([W `webrtc_media_engine.cc` 110–116](https://webrtc.googlesource.com/src/+/refs/branch-heads/8127/media/engine/webrtc_media_engine.cc#110)),
  and the first probes go to 3× and 6× it.
- **Effect.** It only helps the first seconds of a share. It does nothing for the falls
  in ticket 18.
- **Risk.** Low. Set too high, the first seconds on a weak upload are lossy.

### D. `x-google-min-bitrate`

- **What it does.** Sets a floor under the estimate (`webrtc_media_engine.cc` 103–108).
- **Not recommended.** On a real weak upload, the encoder keeps sending above what the
  line carries, and loss and freezes follow. A small floor (1–2 Mbps) is harmless and
  does not touch this problem.

### E. Keeping the encoder busy

- **No page control for padding.** A page cannot ask for padding.
  `min_transmit_bitrate` is set only for screencasts, through an option the page does
  not reach (§1).
- **Two qualities** padded, but are off because watchers froze on the padded quality.
- **A filler track** costs the sharer's upload and CPU, and no usage, since ingress is
  free (**inferred**).
- **Not first.** A and B do the same job with less.

## 4. Telling the causes apart

### What a Linux agent with `scripts/real-media/` can measure on graeae-test

`scripts/real-media/member.ts` drives a headed Chromium with software encoding. It
takes `--chromium-arg` and has `eval` and `content <kind>`.

1. **The SDP answer.** With `eval`, read `__realMedia.connections[i].remoteDescription.sdp`.
   Look for:
   - `b=AS`, `x-google-max-bitrate`: their absence confirms the 5 Mbps ceiling;
   - `a=rtcp-fb:* transport-cc` and the transport-wide-cc `a=extmap`;
   - `goog-remb`.

   This tells which feedback the media server agreed to.
2. **The event log.** Launch with
   `--chromium-arg=--webrtc-event-logging=<dir>`. The switch exists "for automated
   testing" and writes event logs without opening webrtc-internals
   ([C `content/public/common/content_switches.cc` 851–855](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8127/content/public/common/content_switches.cc#851)).
   - Read it with WebRTC's `rtc_event_log_visualizer`
     ([Wm `rtc_tools/rtc_event_log_visualizer/main.cc`](https://webrtc.googlesource.com/src/+/97e37190541dc77f2c9312edf34474d3257efc78/rtc_tools/rtc_event_log_visualizer/main.cc)),
     which needs a WebRTC checkout to build.
   - Plot the send-side estimate with detector state, ALR state and link capacity, plus
     delay feedback, TWCC loss and any REMB.
   - Each delay-based change is logged with the detector's state, so the cause of a
     fall is visible: overuse, loss or REMB.
3. **A fine sample.** Every 200–500 ms, sample `availableOutgoingBitrate`,
   `targetBitrate`, `bytesSent` and `currentRoundTripTime` with `eval`. `page.js`'s
   `report()` does not include the estimate today.

   Share `content game` and `content document` in turn, then check what the source
   predicts:
   - no rise larger than about 5 Mbps in one step above 5 Mbps (probes capped);
   - while calm, the estimate near 1.5× what is sent;
   - each fall landing at about 0.85× what was just sent;
   - after a fall, growth of about 45 kbps a second near the old level, and 8% a second
     once sending exceeds the estimate.
4. **Probing for motion content.** Relaunch with
   `--chromium-arg=--force-fieldtrials=WebRTC-StrictPacingAndProbing/1.0,2875,80,40,-60,3/`.
   That gives "motion" content the screen-share probing without changing graeae
   (`alr_experiment.cc` allows one of the two trials).
   - Against the first run, it shows whether periodic probes appear and stop at 5 Mbps.
5. **A loopback page.** Two peer connections on one page, no media server, the same
   encodings and the same `contentHint`. It tells Chrome's own behaviour (the 5 Mbps
   ceiling, the 1.5× cap, falls from the sender's machine) apart from anything the media
   server's feedback adds.
6. **Fix A, once a later ticket deploys it to graeae-test** (this research deploys
   nothing):
   - compare the time from a fall back to 12 Mbps;
   - on a second member watching, compare its received bytes and freezes with the
     sharer's sent bytes, to see whether the media server forwards probe padding.

A Linux server on a datacentre line, with the software encoder's steady output, will
probably show the ceiling and the slow growth, but few false overuses (**inferred**).

### What only Windows can show

- **The falls themselves.** Whether they come from the owner's machine:
  - the hardware encoder's bursts and overshoot at 1080p60;
  - a game's CPU and GPU load delaying sends;
  - the Wi-Fi or network card, and the 288 Mbps path itself.

  The event log from the owner's Chrome (the same switch, or webrtc-internals) is the
  only way to see the detector state there.
- **Whether fix A is enough** on that machine: whether falls still happen but recover in
  seconds, or keep happening often enough that the estimate stays low anyway.
- **The 854×480 / OpenH264 spells** in ticket 18, where Chrome left the hardware
  encoder. Ticket 30's question, not this one, but they shape how much the encoder
  sends, and so the 1.5× cap.
- **Fix B's cost to picture quality** on real games with the hardware encoder, if
  "detail" is tried.
