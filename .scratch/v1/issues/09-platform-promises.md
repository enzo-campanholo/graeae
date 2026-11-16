# Platform promises

Type: grilling
Status: resolved
Blocked by: 02, 07
Map: ../map.md

## Question

What does v1 promise on each operating system and browser?

The focus is Windows on Chromium-based browsers and Firefox. macOS and Linux have no users today, and the user would like them to be able to share at least a browser tab.

Decide, using [Capture and encoding quality](02-capture-and-encoding-quality.md) and [Screen audio offer](07-screen-audio-offer.md):

- For each of Windows Chromium, Windows Firefox, macOS and Linux: what a member can share, at what quality, with which audio, and what they can watch.
- Where Firefox falls short of Chromium and whether the app says so to the member or quietly degrades.
- Whether watching from a phone is promised, best effort, or unsupported. Sharing from a phone is already out of scope.

## Answer

Settled with the user on 2026-11-16.

**Three levels of promise.**

- **Supported**: the targets in the map hold, and a failure is a bug.
- **Limited**: it works with named gaps, and the gaps are not bugs.
- **Best effort**: never blocked, never tested, no fix promised, not mentioned in the app.

| Platform | Level | Watching | Sharing |
|---|---|---|---|
| Windows 11, current stable Chrome, Helium, Vivaldi or Brave | Supported | Everything, with screen audio | Screen at 1080p60 (720p60 floor), webcam at 720p30, audio as in [Screen audio offer](07-screen-audio-offer.md) |
| Windows 11, current stable Firefox | Limited | Everything, with screen audio, equal to Chromium | Webcam fully promised. Screen works, video only, no quality promise |
| macOS and Linux, current stable Chromium | Limited | Everything, with screen audio | A tab with its audio; a window or whole screen as video only; a webcam. No quality promise |
| Everything else | Best effort | | |

"Everything else" covers Windows 10, Edge, Opera and other Chromium browsers, Firefox and Safari on macOS and Linux, and any phone browser.

- **Supported browsers.** The list is what the group runs (the owner uses Helium; others use Vivaldi and Brave) plus Chrome as the reference the research used. Helium, Vivaldi and Brave are unverified. [Quality proof](13-quality-proof.md) tests each; one that fails drops to Limited with its gap named, without affecting the others.
- **Firefox sharer.** The app aims for the same 1080p60 but the spec promises only that the share works, because Firefox encodes in software while the game runs. [Quality proof](13-quality-proof.md) measures what it delivers.
- **One codec per share.** Because Firefox viewers are promised parity, every share uses a codec both browsers decode: H.264 from Chromium sharers, never HEVC, even when every viewer is on Chromium. There is no per-viewer codec choice.
- **Telling the member.** A gap is shown only when it matters and only to the member affected. A Firefox sharer sees one line in the share dialog: video only, possibly less smooth, a Chromium browser does better. No banner on arrival, no badge for viewers.
- **No blocking.** The app never checks the operating system and never blocks a browser. A member on a best-effort platform gets whatever their browser's picker offers. Extra audio a picker offers on macOS or Linux is passed through, not promised.
- **macOS and Linux testing.** The owner has both machines and runs one manual check on each in Chromium before v1 is called done. The spec lists the checks. The README names the best-effort platforms as untested.
- **Phones.** Watching is best effort: a phone browser can be a remembered device and open a room, but v1 designs no phone layout. Sharing from a phone stays out of scope.
- **Exclusive-fullscreen games.** A named caveat on the Supported level, not a bug: sharers are told to use borderless mode, in the share dialog and the README. Dropped if [Quality proof](13-quality-proof.md) shows no freeze.

**Passed on.**

- To [Quality proof](13-quality-proof.md): test Helium, Vivaldi and Brave in place of Edge; measure a Firefox sharer; check the exclusive-fullscreen freeze.
- To [Room experience](12-room-experience.md): the Firefox line and the borderless tip in the share dialog; no phone layout.
- To spec assembly: the manual check list for macOS and Linux.

**Glossary.** No change: the three levels are spec wording, not domain terms. No ADR: every promise here is easy to change later.
