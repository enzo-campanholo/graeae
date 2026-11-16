# Screen audio offer

Type: grilling
Status: resolved
Blocked by: 01
Map: ../map.md

## Question

What does v1 offer for the audio of a shared screen, given what [Audio capture capabilities](01-audio-capture-capabilities.md) found?

Screen audio is wanted but not a must-have. Tab audio is the common case. Sharing one application's audio, or the desktop's audio without Discord, would be very nice.

Decide:

- Which of the three wishes (tab audio, one application's audio, desktop audio minus Discord) v1 delivers, and on which browsers.
- Whether anything beyond the browser is needed to deliver them. If a desktop helper or a virtual audio device is the only way, put the trade-offs to the user: what it adds, what it costs members to install, and what it costs to build and maintain.
- What the app does when the chosen capture would send Discord voices back to the group (warn, block, or leave it to the sharer).

Unblocks [Platform promises](09-platform-promises.md).

## Answer

Settled with the user on 2026-11-16. v1 is browser-only: no desktop helper and no virtual audio device.

**What a sharer can send.** Nothing in v1 ever captures the whole system's sound.

| Shared surface | Chromium on Windows 11 (Chrome 146+) | Chromium on Windows 10 or older Chrome | Firefox |
|---|---|---|---|
| Tab | Tab's audio | Tab's audio | Video only |
| Window | Only that application's audio | Video only | Video only |
| Whole screen | Video only | Video only | Video only |

- **The three wishes.** Tab audio and single-application audio are delivered, on Chromium only. Desktop audio minus Discord is dropped: only a desktop helper could deliver it, and single-application audio already covers the game case it was mostly wanted for.
- **Default.** When the chosen tab or window can carry audio, audio is included by default, with a visible toggle to share silently.
- **Firefox.** A screen share from Firefox is video-only. The share dialog says so and points to a Chromium browser. The virtual-cable workaround is neither documented nor supported. Watching from Firefox has full audio.
- **Windows 10.** Not designed for beyond the table above. The group is assumed to be on Windows 11; the user did not contradict this when asked.
- **graeae's own audio.** The app always excludes the sharing page's own audio from a capture (Chrome 141+), with no setting, so a shared browser window never sends other members' shares back to them.
- **Discord voices.** With no whole-system audio, the only way to echo voices is to deliberately share Discord itself with audio. That is left to the sharer: no detection, no warning, no block.
- **Treatment.** Screen audio is sent in stereo with echo cancellation, noise suppression and automatic gain switched off. Bitrate is left to quality adaptation.

**Passed on.**

- Untested capture cases (exclusive fullscreen games, games started through launchers, Edge) are test items in [Quality proof](13-quality-proof.md). The results change the spec's caveats, not the offer; the fallback is to share silently or through a tab.
- How a viewer hears shares (per-share volume and mute, several shares with audio at once) goes to [Room experience](12-room-experience.md).
- macOS and Linux audio is for [Platform promises](09-platform-promises.md).

**Glossary.** Added **Screen audio**. No ADR was written: leaving the helper out is easy to reverse later.
