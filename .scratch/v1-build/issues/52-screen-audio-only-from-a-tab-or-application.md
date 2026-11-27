# 52: Screen audio only from a tab or one application

**What to build:** a screen share sends a captured audio track only when it is a tab's or one application's. Any other audio track is stopped, and the share goes out video only.

**Why:** [What window audio picks up on Windows](../../share-reliability/issues/04-window-audio-on-windows.md) found that a window share falls back to the whole system's sound on Windows 10, and on Windows 11 with Chromium 142 to 145. `systemAudio: "exclude"` does not stop that fallback. The whole system's sound holds the Discord voices, so it echoes them back to their owners, and on Windows 10 it echoes the watch party too. The glossary says screen audio is "never the whole system's sound", but the page sends whatever audio the picker hands it.

The owner chose this rule in [Screen audio that is not the tab's or the application's](../../share-reliability/issues/10-screen-audio-not-tab-or-application.md), whose answer gives the reasoning and what was rejected.

Spec: Screen audio, Platforms.

Status: resolved

Blocked by: none

- [x] **The rule, in `src/app/lib/media/capture.ts`.**
  - A pure function that keeps an audio track's label only when it is exactly `Tab audio` or `Application Audio`. These are the strings Chromium names them by (`GetAudioMediaStreamDeviceName`), read on Windows 11 with Chrome 158 and Helium in [Windows evidence run on MONSTRAO](../../share-reliability/issues/09-windows-evidence-run.md).
  - Anything else (`System Audio`, an empty label, a name not yet seen) is not screen audio.
  - Update the file's header, which says "any audio its picker gives is sent".
- [x] **The real media client, `captureScreen` in `src/app/lib/media/browser.ts`.**
  - Every audio track the rule does not keep is stopped and removed from the stream before the capture is returned, so `audio` is `false` and `offer` sends the picture alone.
  - The browser must let go of the capture, so stop the track; leaving it out of the offer is not enough.
  - Replace the comment "Any audio the picker gave is sent, whatever the system".
- [x] **The log.**
  - A tab line when audio is dropped, `capture.audio-dropped` with `kind`. Never the label: the logging rule in `watchTracks` ("never a track's label") stands for audio too.
  - Add it to the list at the top of `src/shared/log.ts`.
- [x] **No new words on the page.** The sharer's "Video only. No one hears this share." and the viewers' "screen · video only" already say what happened. Check that a dropped track reaches them the same way a picker that gave no audio does.
- [x] **Spec (`.scratch/v1-build/spec.md`).**
  - **Screen audio.** Add: a captured audio track is sent only when it is a tab's or one application's; any other is dropped and the share goes out video only, on every platform and browser.
  - **Platforms.** The line "Extra audio a picker offers on Linux or a best-effort platform is passed through, not promised" becomes: extra audio a picker offers on Linux or a best-effort platform is passed through, not promised, when it is a tab's or one application's; any other is dropped.
  - The glossary does not change.
- [x] **`CLAUDE.md`, under "Working in the repo"**, this sentence, as decided in [Where the two-profile loop is written down](../../share-reliability/issues/15-where-the-two-profile-loop-is-written-down.md):

  > Sharing a window of a browser that also holds a watching graeae tab (another profile or the same one) sends that tab's sound back out, and it loops until the watching tab is muted. To share and watch on one Windows machine, use two browsers, as `scripts/owner-checks.sh` does.

- [x] **Tests (on the fakes).**
  - `test/capture.test.ts`: the rule keeps `Tab audio` and `Application Audio` and nothing else (`System Audio`, `""`, `tab audio`).
  - If the fake media client can be handed a capture with an audio label, a screen share whose audio reads `System Audio` goes live video only. Otherwise the pure rule's test is enough; do not grow the fake for this alone.
- [x] **On this server, with `scripts/real-media/`**, against `graeae-test` once it is deployed, with a second member watching:
  - A tab share playing a tone reads `Tab audio`, goes out with sound, and the watcher hears it (`audioLevel` above silence).
  - A window or entire screen share: still video only, as the spec's Linux row says, with no `capture.audio-dropped` unless the picker did hand it audio.

The agent does all of this alone. Windows 10 stays unverified, since there is no machine for it. The map's final Windows check gains one line: a tab and a window still carry sound on Chrome and Helium. The owner checks nothing for this ticket alone.

## Comments

### 2026-11-22: built, deployed to graeae-test and checked there

**The rule.** `isScreenAudio(label)` in `capture.ts` keeps a track only when its label is exactly `Tab audio` or `Application Audio`. The file's header now describes everything it holds and says audio is sent only when `isScreenAudio` keeps it.

**The real client.** In `captureScreen`, every audio track the rule does not keep is stopped and removed from the stream before `audio` is worked out. So the capture is video only and `offer` adds no audio transceiver. Each dropped track logs `capture.audio-dropped` at `warn`, with `kind` and never the label. It is listed at the top of `src/shared/log.ts`. `watchTracks` still runs first, so `capture.track` records what the browser handed over, including a track that is then dropped. Ticket 55 reads that line as evidence.

**The page.** No new words. The sharer's note comes from `capture.audio`, and the viewers' caption from the start carrying no `audio` mid. Both follow the stream's audio tracks, so a dropped track takes the same path as a picker that gave none. That was confirmed on real media below.

**Spec and CLAUDE.md.** The Screen audio line and the Platforms sentence are in, word for word as the ticket gave them, and so is the two-profile loop sentence under "Working in the repo". The glossary is unchanged. Ticket 55 already carries the Windows sound check (its check 5), so the map needed no edit.

**Tests.** `test/capture.test.ts` checks that the rule keeps `Tab audio` and `Application Audio` and rejects `System Audio`, `""` and `tab audio`. The fake's picker hands a boolean for audio, not a label, so it was not grown. Typecheck passes. Lint's only errors are in the untracked `.logs/upload-estimate/scripts`. All 465 tests pass in the Workers runtime.

**Review.** Neither axis found a defect. The headers of `capture.ts` and its test were brought up to date, and the comment in `browser.ts` now leaves the rule to `isScreenAudio` instead of restating it.

**On real media.** Deployed to `graeae-test` from `7672403` (version `a356ab7b`). Two throwaway members, Probe A sharing and Probe W watching, joined "First room" from owner's invites. Each ran in a headed Chromium on an Xvfb display (`:97`) through `scripts/real-media/member.ts`. The tab's own `capture.*` log lines were read off its socket with an `eval` wrapper on `WebSocket.send`, and the track labels from `page.js`'s kept captures. No log token was needed.
- **Tab share playing a 440 Hz tone.** The audio track read `Tab audio` and stayed live. `capture.granted` had `audio: true`, and there was no `capture.audio-dropped`. Sent audio level was 0.45. Probe W watched and heard it at 0.10 to 0.19, well above silence.
- **Window share of the tone window.** The picker gave no audio track (Linux has no window audio). `capture.granted` had `audio: false`, and there was no `capture.audio-dropped`. Probe A's page said "Video only. No one hears this share.", and Probe W's said "screen · video only" while decoding at 30 fps.
- **The drop path.** Linux cannot produce `System Audio`, so an `eval` wrapper on `getDisplayMedia` added a Web Audio track to the next window capture. Its label, `MediaStreamAudioDestinationNode`, is not screen audio. The page logged `capture.audio-dropped` (`kind: "screen"`, no label), and the track's `readyState` was `ended`, so it was stopped. `capture.granted` had `audio: false`, the share went out with no audio stream, and both pages showed the same two lines as above.

Not checked: an entire-screen share, since a window share covers the same path, and Windows 10, since there is no machine for it. Afterwards Probe A and Probe W were removed in People, their browser profiles and invite codes were deleted, and the desktop on `:97` was stopped.
