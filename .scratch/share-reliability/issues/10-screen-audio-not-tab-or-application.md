# Screen audio that is not the tab's or the application's

Type: grilling
Status: resolved
Blocked by: 09
Map: ../map.md

## Question

What should a screen share do when the browser hands it audio that is neither a tab's nor one application's?

[What window audio picks up on Windows](04-window-audio-on-windows.md) found that a window share falls back to the whole system's sound on Windows 10, and on Windows 11 with Chromium 142 to 145 (minus graeae's tab there). The whole system's sound holds the Discord voices, so it echoes them back to their owners. The glossary says screen audio is "never the whole system's sound", and [Screen audio offer](../../v1/issues/07-screen-audio-offer.md) decided such shares are video only. Windows 10 is not a supported platform, but it is never blocked.

The candidate, the smallest one: the page sends a captured audio track only when it is a tab's or one application's (Chromium names them in the track's label, "Application Audio" for a window, per the research) and drops any other, so the share goes out video only, as decided. Settle whether that is the rule, whether the label is reliable enough to read (the Windows evidence run checks the labels), and whether the sharer is told anything (the map's Notes: a warning is the last resort).

## Comments

**2026-11-22, from [Windows evidence run on MONSTRAO](09-windows-evidence-run.md).** Unblocked. On Windows 11 26H2 with Chrome 158 and Helium (Chromium 158), the audio track's label read "Tab audio" for a tab and "Application Audio" for a window, every time. An entire screen share came with no audio track at all in either. The whole system's sound was never seen: Windows 10 was not available, and Chromium 142 to 145 was not run, so the label such a track carries is still unread: the research expects "System Audio" from Chromium's source (`git show origin/research/window-audio-windows:docs/research/window-audio-windows.md`, §4 and its check 7).

## Answer

Decided with the owner on 2026-11-22. Build ticket: [Screen audio only from a tab or one application](../../v1-build/issues/52-screen-audio-only-from-a-tab-or-application.md) (v1-build 52, `ready-for-agent`, nothing for the owner).

**What the code and the evidence showed.**
- `capture.ts` already asks for `systemAudio: "exclude"` and `windowAudio: "window"`. Neither stops the Windows 10 and Chromium 142 to 145 fallback, so `browser.ts` sends whatever audio the picker hands it ("Any audio the picker gave is sent").
- The spec says the same thing: "Extra audio a picker offers on Linux or a best-effort platform is passed through, not promised". That contradicts the glossary's "never the whole system's sound", since Windows 10 and older Chromium are best effort.
- On Windows 11 with Chrome 158 and Helium, the label read exactly `Tab audio` for a tab and `Application Audio` for a window, every time, and an entire screen came with no audio track. `System Audio` was never seen; Chromium's source expects it.

**The rule: keep only the two known labels.**
- A captured audio track is sent only when its label is exactly `Tab audio` or `Application Audio`, on every platform and browser.
- Any other audio track is stopped at once, so the browser lets go of the capture, and the share goes out video only, as [Screen audio offer](../../v1/issues/07-screen-audio-offer.md) decided.
- Rejected: dropping only `System Audio`. It keeps sound if Chromium renames a label, but lets through whole-system sound under any name not yet seen. With the strict list, a renamed label makes shares video only, which the sharer sees on their own preview and the logs record. It does not fail silently.

**The sharer is told nothing new.** Their preview's "Video only. No one hears this share." line, and the viewers' "screen · video only" caption, already say what happened. The cases this affects are best-effort platforms, and a warning is the last resort.

**Spec.** The best-effort line changes to: audio a picker offers that is not a tab's or one application's is dropped, on any platform; extra tab or application audio on Linux or a best-effort platform is passed through, not promised. The glossary already says "never the whole system's sound" and does not change. No ADR: the rule is a few lines and easy to reverse.

**Verification.** On the fakes, and with `scripts/real-media/` on this server: a Linux tab share still reads `Tab audio` and goes out with sound. Windows 10 stays unverified, since there is no machine for it. The map's final Windows check gains one line: a tab and a window still carry sound on Chrome and Helium.
