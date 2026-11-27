# What window audio picks up on Windows

Type: research
Status: resolved
Blocked by: none
Map: ../map.md

## Question

On Windows, the owner shared a Helium window with its audio from one Helium profile and watched that share from a second Helium profile on the same machine. The watcher's sound was captured back into the share, and it turned into an endless feedback loop. What exactly does Chromium's window (application) audio capture pick up on Windows, and does `restrictOwnAudio` keep it from picking up graeae itself?

Context: the capture request is `screenCapture` in `src/app/lib/media/capture.ts`: `windowAudio: "window"`, `restrictOwnAudio: true`, `systemAudio: "exclude"`, `selfBrowserSurface: "exclude"`, echo cancellation off. One graeae tab both shares and plays what it watches. Earlier research: `docs/research/audio-capture.md` and [Audio capture capabilities](../../v1/issues/01-audio-capture-capabilities.md).

The guess: application audio is Windows' process loopback of the window's process tree, every profile of one Helium runs in that one browser process tree, and `restrictOwnAudio` leaves out only the capturing tab's own sound. So any other graeae tab in the same browser, in any profile, is captured. In ordinary use (one tab) nothing loops, but this might hide a real bug.

Find, from Chromium's source and bug tracker:

- What `windowAudio: "window"` captures on Windows: which process or processes, child processes, all profiles of the browser, the browser's own audio service.
- What `restrictOwnAudio` (and the older `suppressLocalAudioPlayback`) does with tab, window and screen captures: which sound it leaves out, whether it applies to window audio at all, from which Chrome version, and whether Helium (a Chromium fork) would carry it.
- The case that matters for a watch party: a member shares a Helium **window** with sound and, in the same graeae tab, watches a friend's screen share with its sound. Does the friend hear their own screen audio echoed back? State what the source says should happen.
- What the Windows evidence run must do to show each of these, with no person listening (for example by reading the receiving side's audio level, or tone frequencies, from statistics).

Answer with the mechanism, whether the watch-party case echoes, and the checks for the Windows evidence run.

## Answer

Findings: `docs/research/window-audio-windows.md`. From Chromium 158's source (what Helium 0.22.2 builds), Microsoft's docs, the W3C spec and Helium's patches; nothing run on Windows yet.

- **The mechanism.** Sharing a window of the very browser doing the capture, with `restrictOwnAudio`, Chromium (from 145, on by default from 146; commit `7e2fc4e`, crbug 468232149) discards the process loopback and sends the browser's own mix of every tab it plays, in every window and every profile, minus the one tab that started the share. Any other application's window is that process tree only, and graeae is never in it. `restrictOwnAudio` leaves out only the sharing tab, and needs Windows 11 (Blink drops it silently on Windows 10). `suppressLocalAudioPlayback` does nothing for window audio. Helium changes nothing here and runs the source defaults.
- **The owner's two-profile loop is expected, not a graeae bug.** The second profile's graeae tab is another tab of the same browser, so its sound is in the mix. A second graeae tab in the same profile loops the same way, which What two tabs on one device do should know.
- **The watch-party case does not echo on Windows 11 with Chromium 146 or later:** the friend's screen audio plays in the sharing tab, the one tab left out.
- **But a window share echoes on Windows 10**, where it falls back to the whole system's sound (`systemAudio: "exclude"` covers screens only) and `restrictOwnAudio` is dropped; Chromium 142 to 145 on Windows 11 also sends the whole system's sound, minus graeae's tab. Both break the glossary's "never the whole system's sound" and [Screen audio offer](../../v1/issues/07-screen-audio-offer.md)'s "video only" there. Taken up by Screen audio that is not the tab's or the application's.
- **For the Windows evidence run:** both profiles in one Helium process (`member.ts` starts each member as its own process, so it cannot show the loop: use `connectOverCDP` with `--profile-directory`, or two contexts in one launched Helium); window picked by `--auto-select-window-capture-source-by-title`; everything read as tone frequencies through an analyser plus `audioLevel` and `totalAudioEnergy`, output volume low. Checks: the audio track's label reads "Application Audio"; a Helium window share carries other windows' and profile 2's tones but not graeae's tab or Chrome; a Chrome window share carries Chrome's only; `restrictOwnAudio` true against false on a plain page; the watch party (the friend's 523 Hz tone absent); the loop persisting 30 s after its source stops, with graeae's own mute stopping it, a separate user-data-dir not looping and a second same-profile graeae tab looping; optionally Windows 10 echoing.
