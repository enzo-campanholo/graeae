# 52: Screen audio only from a tab or one application

**What to build:** a screen share sends a captured audio track only when it is a tab's or one application's. Any other audio track is stopped, and the share goes out video only.

**Why:** [What window audio picks up on Windows](../../share-reliability/issues/04-window-audio-on-windows.md) found that a window share falls back to the whole system's sound on Windows 10, and on Windows 11 with Chromium 142 to 145. `systemAudio: "exclude"` does not stop that fallback. The whole system's sound holds the Discord voices, so it echoes them back to their owners, and on Windows 10 it echoes the watch party too. The glossary says screen audio is "never the whole system's sound", but the page sends whatever audio the picker hands it.

The owner chose this rule in [Screen audio that is not the tab's or the application's](../../share-reliability/issues/10-screen-audio-not-tab-or-application.md), whose answer gives the reasoning and what was rejected.

Spec: Screen audio, Platforms.

**Status:** ready-for-agent

**Blocked by:** none

- [ ] **The rule, in `src/app/lib/media/capture.ts`.**
  - A pure function that keeps an audio track's label only when it is exactly `Tab audio` or `Application Audio`. These are the strings Chromium names them by (`GetAudioMediaStreamDeviceName`), read on Windows 11 with Chrome 158 and Helium in [Windows evidence run on MONSTRAO](../../share-reliability/issues/09-windows-evidence-run.md).
  - Anything else (`System Audio`, an empty label, a name not yet seen) is not screen audio.
  - Update the file's header, which says "any audio its picker gives is sent".
- [ ] **The real media client, `captureScreen` in `src/app/lib/media/browser.ts`.**
  - Every audio track the rule does not keep is stopped and removed from the stream before the capture is returned, so `audio` is `false` and `offer` sends the picture alone.
  - The browser must let go of the capture, so stop the track; leaving it out of the offer is not enough.
  - Replace the comment "Any audio the picker gave is sent, whatever the system".
- [ ] **The log.**
  - A tab line when audio is dropped, `capture.audio-dropped` with `kind`. Never the label: the logging rule in `watchTracks` ("never a track's label") stands for audio too.
  - Add it to the list at the top of `src/shared/log.ts`.
- [ ] **No new words on the page.** The sharer's "Video only. No one hears this share." and the viewers' "screen · video only" already say what happened. Check that a dropped track reaches them the same way a picker that gave no audio does.
- [ ] **Spec (`.scratch/v1-build/spec.md`).**
  - **Screen audio.** Add: a captured audio track is sent only when it is a tab's or one application's; any other is dropped and the share goes out video only, on every platform and browser.
  - **Platforms.** The line "Extra audio a picker offers on Linux or a best-effort platform is passed through, not promised" becomes: extra audio a picker offers on Linux or a best-effort platform is passed through, not promised, when it is a tab's or one application's; any other is dropped.
  - The glossary does not change.
- [ ] **`CLAUDE.md`, under "Working in the repo"**, this sentence, as decided in [Where the two-profile loop is written down](../../share-reliability/issues/15-where-the-two-profile-loop-is-written-down.md):

  > Sharing a window of a browser that also holds a watching graeae tab (another profile or the same one) sends that tab's sound back out, and it loops until the watching tab is muted. To share and watch on one Windows machine, use two browsers, as `scripts/owner-checks.sh` does.

- [ ] **Tests (on the fakes).**
  - `test/capture.test.ts`: the rule keeps `Tab audio` and `Application Audio` and nothing else (`System Audio`, `""`, `tab audio`).
  - If the fake media client can be handed a capture with an audio label, a screen share whose audio reads `System Audio` goes live video only. Otherwise the pure rule's test is enough; do not grow the fake for this alone.
- [ ] **On this server, with `scripts/real-media/`**, against `graeae-test` once it is deployed, with a second member watching:
  - A tab share playing a tone reads `Tab audio`, goes out with sound, and the watcher hears it (`audioLevel` above silence).
  - A window or entire screen share: still video only, as the spec's Linux row says, with no `capture.audio-dropped` unless the picker did hand it audio.

The agent does all of this alone. Windows 10 stays unverified, since there is no machine for it. The map's final Windows check gains one line: a tab and a window still carry sound on Chrome and Helium. The owner checks nothing for this ticket alone.
