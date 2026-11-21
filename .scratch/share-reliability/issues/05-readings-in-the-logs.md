# Readings in the logs

Type: task
Status: resolved
Blocked by: none
Map: ../map.md

## Question

Not a decision: the work that lets later decisions rest on evidence from real evenings without the owner taking readings. Done by an agent alone.

Each tab's `stats` log line (built in `src/shared/log.ts`, read in `src/app/lib/media/stats.ts`) today carries direction, kind, mid, bitrate, packets lost, jitter, round trip and `limitedBy`. Add, on the sharer's side: the encoder's name (`encoderImplementation`), whether it is hardware (`powerEfficientEncoder`), the frame size and frame rate sent, the capture's surface and its size at each reading (`getSettings()`, not only at the start), `qualityLimitationResolutionChanges`, `targetBitrate`, Chrome's upload estimate (`availableOutgoingBitrate`), the codec, and key frames sent. On the watcher's side: the decoder's name where Chrome gives it, the frame size and frame rate received, freezes (`freezeCount`, `totalFreezesDuration`), key-frame requests (`pliCount`, `firCount`, `nackCount`), and the audio level of screen audio. Keep the line small: only fields that answer something this map asks. Keep `log.ts`'s rules on what is never logged.

Done when: the change is on `v1-build` with `pnpm test`, `pnpm typecheck` and `pnpm lint` passing; `graeae-test` runs it; and an agent has pulled one short `scripts/real-media/` share and watch (CLAUDE.md, Logs; the token by `request_secret`) and checked the new fields arrive. Record the version deployed, the fields and a sample line in the answer.

## Answer

**Done, 2026-11-21.** On `v1-build`: `cb2ffde` (the fields) and `74cb885` (one renamed). `pnpm test` (452 tests, 60 browser specs), `pnpm typecheck` and `pnpm lint` pass. Deployed to `graeae-test` as version `bc6e9898` (build `74cb885`), which it still runs. The secrets were left as they were. No migration.

**The fields.** Each `stats` line (`src/app/lib/media/stats.ts`, documented at the top of `src/shared/log.ts`) keeps what it had: `direction`, `kind`, `mid`, `rid`, `bitrate`, `fps`, `width`, `height`, `packetsLost`, `jitter`, `rtt`, `layer`, `limitedBy`, `framesDropped`, `freezes`. It adds, only where they apply:

- **A picture sent:** `encoder` (`encoderImplementation`), `hardware` (`powerEfficientEncoder`), `codec` (the mime subtype with H.264's profile-level-id, such as `H264 42001f`), `targetBitrate`, `estimate` (the pair in use's `availableOutgoingBitrate`; it rides on the picture sent only, since it belongs to the connection), `keyFrames` (`keyFramesEncoded`), `resolutionChanges` (`qualityLimitationResolutionChanges`), and `capture`: the track's `surface`, `width` and `height` from `getSettings()` at that reading. `browser.ts` matches a track to its stream through `media-source`'s `trackIdentifier`. The frame size and rate sent were already `width`, `height` and `fps`.
- **A picture received:** `decoder` (`decoderImplementation`), `freezeSeconds` (`totalFreezesDuration`), `pli`, `fir` and `nack`. Chromium names the decoder **only to a tab that is capturing too**, so it appears when the watcher shares something as well, and not otherwise.
- **A sound received:** `audioLevel`. It cannot be called `level`: the tab's log sets `level` on every line for how bad the line is, and the instance takes it off. The first deploy (`c48e61a7`, build `cb2ffde`) named it `level` and lost it that way; `74cb885` renamed it.

Each stream line grows to about 500 bytes, and the number of lines stays the same. The daily estimate in `log.ts` stays far under the free plan's 0.5 GB.

**Checked on `graeae-test`.** An owner device was made with `/setup` through `curl`. That forgot every earlier owner device on `graeae-test`, as ticket 49's run did; the owner gets back in with `/setup#<secret>`, as the owner checks do anyway. Two throwaway members joined "First room" from the owner's invites: "Probe A" and "Probe B", each a headed Chromium 157 on one Xvfb display, driven by `scripts/real-media/member.ts`. In two runs, Probe A shared a tab playing a 440 Hz tone (`--pick tab:ToneTab`) and Probe B watched it, all through Cloudflare's media server. In the second run Probe B also shared a fake webcam, so that Chromium would name its decoder. The logs were pulled with the owner's token into `.logs/graeae-test-1795274598822-1795277273180.jsonl` (first run, 171 events) and `.logs/graeae-test-1795277732369-1795277999005.jsonl` (second run, 174 events). No invite code is in either. Every new field arrives. The two members were removed in People and their browser profiles deleted. The other members and their pending invite were not touched.

Sample lines from the second run, with the tags removed:

```json
{"direction":"out","kind":"video","mid":"0","bitrate":112072,"fps":44,"width":522,"height":268,"packetsLost":0,"jitter":0.001088,"rtt":0.001938,"limitedBy":"bandwidth","encoder":"OpenH264","hardware":false,"codec":"H264 42001f","targetBitrate":5317000,"estimate":5615384,"keyFrames":2,"resolutionChanges":0,"capture":{"surface":"browser","width":522,"height":268}}
{"direction":"in","kind":"video","mid":"1","bitrate":96617,"fps":42,"width":522,"height":268,"layer":"720p","packetsLost":0,"jitter":0.001,"rtt":0.002,"framesDropped":0,"freezes":0,"freezeSeconds":0,"decoder":"FFmpeg","pli":1,"fir":0,"nack":0}
{"direction":"in","kind":"audio","mid":"2","bitrate":64395,"packetsLost":0,"jitter":0.001,"rtt":0.002,"audioLevel":0.449}
```

**What the readings already show** (software encoding on this server, so these are not Windows evidence):

- **Chrome's upload estimate held at 5.5 to 6.1 Mbps in both runs**, with nothing lost and a round trip of about 2 ms. That fits the 5 Mbps probe cap that [Why Chrome's upload estimate sits low](02-upload-estimate-sits-low.md) found. In the second run Chrome said `limitedBy` "bandwidth" while sending 0.11 Mbps against a 5.3 Mbps target. [Measure the upload estimate from this server](11-measure-upload-estimate.md) can now read all of this from the logs.
- **One tab came out at two sizes.** The same 1280x720 tone window was captured at 1920x990 in the first run and 522x268 in the second, both with `resolutionChanges` 0. So the capture's own size, not the encoder, set the picture sent. This fits [Why a shared tab falls back to software encoding](01-tab-share-software-encoding.md)'s finding that a tab's capture size moves by itself. The Windows run should read `capture` next to `width` and `height` sent.
