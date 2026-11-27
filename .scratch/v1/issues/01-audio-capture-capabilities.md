# Audio capture capabilities

Type: research
Status: resolved
Branch: research/audio-capture
Map: ../map.md

## Question

What audio can a web page capture alongside a screen share today, and what can it leave out?

The group talks in a Discord voice channel while sharing. The wishes, from most to least common:

1. Share a browser tab with its audio.
2. Share a game or another single application with only that application's audio.
3. Share the whole desktop's audio with Discord's audio excluded, so viewers do not hear each other twice.

Establish, for Chromium-based browsers and Firefox on Windows first, then macOS and Linux:

- Which capture surfaces (tab, window, whole screen) can carry audio, and which audio each one carries.
- Whether any browser API can capture one application's audio or exclude one application's audio. Cover the current state of `systemAudio`, `windowAudio`, `restrictOwnAudio`, `suppressLocalAudioPlayback` and anything newer, with the browser versions that ship them.
- What Firefox supports for audio in `getDisplayMedia`.
- What a native helper on Windows could add (for example the process loopback capture API with include and exclude modes), and the realistic ways to get helper-captured audio into the page or the call.
- Workarounds that need no code from us, such as virtual audio devices, and how much setup they cost a non-technical friend.

The answer feeds [Screen audio offer](07-screen-audio-offer.md) and [Platform promises](09-platform-promises.md).

## Answer

Full findings: `docs/research/audio-capture.md`, read on 2026-11-15. Nothing was tested on a real machine: "works" means the shipped source code says so. Section 7 of the findings file lists the quick tests that would settle each unverified point.

| Wish | Windows Chromium | Windows Firefox |
|---|---|---|
| 1. A tab with its audio | Works, since Chrome 74 | No. Firefox has no audio in screen capture at all, and tab sharing is Nightly-only |
| 2. One application with only its audio | Works on Windows 11 with Chrome 146 or later (stable since 2026-03-10): the page asks for window audio and the sharer picks the game's window. Windows 10 only gets whole-system audio | No |
| 3. Desktop audio without Discord | No browser API can do it | No |

- **Echo of graeae itself.** Chrome 141 and later on Windows 11 can leave the sharing page's own audio out of a capture. That stops a sharer's graeae page from sending the other members' streams back to them.
- **Firefox's only route** to any screen audio is a virtual audio cable such as VB-CABLE: free, but an administrator install and a reboot.
- **What a desktop helper would add:** wish 3 only, by capturing system audio while excluding Discord's processes. Chrome already does wish 2 by itself. Only one application can be excluded per capture, so the browser's playback of other members' streams would need separate handling.
- **Getting helper audio into the call.** A local WebSocket now triggers Chrome's local-network permission prompt. A local WebRTC connection, or the helper joining the call as its own participant, avoids it. A home-made virtual audio device needs a signed kernel driver.
- **Installing a helper.** An unsigned program shows the "Windows protected your PC" warning. Microsoft's low-cost signing service is closed to individuals in Brazil, so the choice is a paid certificate or unsigned.
- **Workaround without code.** Chrome's system audio captures only the default output device, so sending Discord to a different device could leave it out. Untested, and too fiddly for a non-technical member.
- **macOS and Linux.** Chrome on macOS 14.2 and later gets screen audio and single-application audio. Chrome on Linux gets tab audio only. Firefox and Safari get nothing.

Unverified: Edge's behaviour for window audio, games started through launchers or in exclusive fullscreen, whether Google can switch these features off remotely, which Discord process plays voice, the date of the WebSocket prompt, and how Windows and antivirus treat an unsigned helper.
