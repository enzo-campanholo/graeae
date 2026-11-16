# 15: Screen share with screen audio

**What to build:** A member presses "Share screen", picks a tab, window or screen in the browser's picker, and the screen share is live with the sound of that tab or application where the browser can capture it. Other members watch it like any share. This ticket sends one quality; ticket 17 sets the encoding rules.

Spec: [Screen audio](../spec.md#screen-audio), [Shares](../spec.md#shares), [The room's screen](../spec.md#the-rooms-screen). User stories 47 to 53 and 60.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 13, 14

**Status:** ready-for-agent

- [ ] "Share screen" goes straight to the browser's picker: 3 clicks, 4 the first time on a device
- [ ] The first time on a device a short notice comes first, once: a tab or a game's window sends sound, a whole screen is video only. No borderless-mode tip
- [ ] On Firefox the notice instead says: video only, possibly less smooth, a Chromium browser does better
- [ ] graeae asks the picker to have its audio checkbox ticked and has no audio toggle of its own before the picker
- [ ] Screen audio is sent in stereo with echo cancellation, noise suppression and automatic gain off
- [ ] The sharing page's own audio is always excluded from the capture
- [ ] The whole system's sound is never requested
- [ ] A screen share is one unit: its video track and, when there is one, its audio track, recorded and closed together
- [ ] The sharer's own live share has an audio on and off control
- [ ] A share that ended up with no audio shows the sharer one line saying so; viewers see "video only"
- [ ] The share ends when the sharer presses stop, uses the browser's own "stop sharing" bar, closes the shared tab or window, or leaves
- [ ] One screen share per member; a second attempt is refused until ticket 19 adds hand-over
- [ ] The screen icon appears on the member's row, and a name click watches screen and webcam together
- [ ] The app never checks the operating system and never blocks a browser; extra audio a picker offers elsewhere is passed through
- [ ] Seam 1 and Seam 2 tests on the fakes
- [ ] What graeae asks the browser to capture is decided by one pure rule, taking the browser family as an input, and tests assert on its result for Chromium and for Firefox
- [ ] The fake media client lets a Seam 2 test set the browser family and what the picker returned (tab, window or screen; with or without audio)
- [ ] The collapsed rail keeps the "Share screen" button
