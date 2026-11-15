# Research: audio capture alongside a screen share

Status: findings for planning. Nothing here is a decision.
Researched: 2026-11-15. Chrome Stable that day was 157 (158 ships 2026-11-17); Firefox release has no screen-share audio at all (see §3).

**Question.** What audio can a web page capture alongside a screen share today, and what can it leave out? Measured against three wishes, from most to least common:

1. Share a browser tab with its audio.
2. Share a game or other single application with only that application's audio.
3. Share the whole desktop's audio without Discord's audio, so viewers do not hear each other twice.

**How this was checked.** Chromium claims were read straight from Chromium source on each release branch (`refs/branch-heads/<n>`, branch numbers from [chromiumdash](https://chromiumdash.appspot.com/fetch_milestones?only_branched=true)), not from blog posts. Default-on in source is what ships unless Google overrides it server-side ("Finch"). That cannot be seen from outside, so a field-trial override stays possible. Browser support tables come from [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) at commit `3e04f2c` (2026-11-16). Where BCD and Chromium source disagree, source wins; the disagreements are noted. Nothing was tested on a real machine. Every "works" below means "the shipped code says so", not "we saw it work".

---

## 0. Answer in one table

Windows, browser only, no install:

| Wish | Chrome / Edge on Windows 11 | Chrome / Edge on Windows 10 | Firefox (any OS) |
|---|---|---|---|
| 1. Tab plus its audio | **Yes**, since Chrome 74 | **Yes** | **No.** No audio of any kind, and tab sharing is Nightly-only |
| 2. One app's audio only | **Yes, Chrome ≥ 146**: page passes `windowAudio: "window"` and the user picks the app's *window* (§2.3) | **No.** Falls back to whole-system audio | **No** |
| 3. Desktop minus Discord | **No API.** The closest is `restrictOwnAudio`, which removes the *browser's own* audio (§2.4), not Discord's | **No** | **No** |

Edge is Chromium. Assume it matches Chrome, but Edge-specific behaviour is **unverified** (§2.6).

---

## 1. Which surfaces carry which audio

| Surface | Chromium, Windows | Chromium, macOS | Chromium, Linux | Firefox |
|---|---|---|---|---|
| Tab | That tab's audio only | Tab audio | Tab audio | No tab surface outside Nightly; no audio |
| Window | Default (`windowAudio` unset or `"system"`): whole-system audio. With `"window"`: that app's process tree, on Win 11 and Chrome ≥ 146 | `"window"`: app audio on macOS ≥ 14.2 and Chrome ≥ 150. Otherwise system audio | None | No audio |
| Whole screen | All system audio (default output device) | System audio on macOS ≥ 14.2, Chrome ≥ 142 (likely 141 via server rollout) | None by default; system audio only behind `chrome://flags/#pulseaudio-loopback-for-screen-share` | No audio |

Sources:

- BCD `getDisplayMedia.audio_capture_support`: Chrome 74. "On Windows and ChromeOS, the entire system audio can be captured when sharing an entire screen. On Linux and macOS, only the audio of a tab can be captured." The macOS half of that note is out of date; see the macOS rows below.
- Chromium `DesktopMediaPickerController::IsSystemAudioCaptureSupported` ([157 source](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8103/chrome/browser/media/webrtc/desktop_media_picker_controller.cc)): returns `true` on Windows. On macOS it requires `IsMacCatapSystemLoopbackCaptureSupported()` (macOS ≥ 14.2, [media_switches.cc](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8103/media/base/media_switches.cc)). On Linux it requires the `PulseaudioLoopbackForScreenShare` feature, which is `FEATURE_DISABLED_BY_DEFAULT` and is exposed in `about_flags.cc` as `pulseaudio-loopback-for-screen-share`.
- macOS screen audio history. In 140 and 141 the controller also required `MacCatapLoopbackAudioForScreenShare`, which was `FEATURE_DISABLED_BY_DEFAULT` in source. It became `FEATURE_ENABLED_BY_DEFAULT` from branch 142 (7444), and by 150 the check was removed entirely. A third-party test ([addpipe, 2026-02-19](https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/)) saw the toggle appear in 141 on macOS 15, which fits a server-side rollout one release before the source default. 141 is therefore **plausible but unverified**; 142 is confirmed in source.
- **Windows "system audio" is the default output device only.** For a plain `loopback` device, `WASAPIAudioInputStream::SetCaptureDevice` calls `GetDefaultAudioEndpoint(eRender, eConsole)` ([audio_low_latency_input_win.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/audio/win/audio_low_latency_input_win.cc)). Audio sent to another output device is not captured, unless `restrictOwnAudio` switches capture to process loopback; see §2.4. The workaround in §5.3 is built on this.
- Firefox: see §3.

---

## 2. Chromium API surface: each option, what it does, where it ships

Every option below is a `getDisplayMedia()` option or audio constraint. None is behind an origin trial. Status is read from `third_party/blink/renderer/platform/runtime_enabled_features.json5` on each branch.

| Option | What it does | Chrome | Firefox / Safari |
|---|---|---|---|
| `audio: true` | Asks for audio; the user still has to tick a box in the picker | 74 | ignored / ignored |
| `systemAudio: "include" \| "exclude"` | Hint: offer system audio next to *screens* or not. Default `include` | 105 ([Chrome docs](https://developer.chrome.com/docs/web-platform/screen-sharing-controls#systemAudio)) | no / no |
| `suppressLocalAudioPlayback` (constraint) | Captured audio stops playing locally. For tabs it mutes the tab. For screen or system audio Chrome uses device `loopbackWithMute` and warns that local output is muted | 109 (BCD) | no / no |
| `windowAudio: "exclude" \| "system" \| "window"` | Hint: what audio to offer next to *windows* | Option stable in 141 ([I2S](https://www.mail-archive.com/blink-dev@chromium.org/msg14415.html), [release notes](https://developer.chrome.com/release-notes/141)). `"window"` really delivers app audio from **146** on Windows 11 and **150** on macOS ≥ 14.2 (§2.3) | no / no |
| `restrictOwnAudio` (constraint) | Removes the capturing *page's* own playback from captured system audio | 141 (BCD; the [I2S](https://www.mail-archive.com/blink-dev@chromium.org/msg14230.html) planned 140). Only works on Windows 11 and macOS ≥ 14.2 (§2.4) | no / no |
| `audioSelection: "preferred"` (newest) | Hint that the page wants audio. In Chrome it pre-ticks the audio checkbox | Stable in **152** (2026-08-25); [spec](https://w3c.github.io/mediacapture-screen-share/#dom-displaymediastreamoptions-audioselection) | no / no |

### 2.1 Defaults that matter

- `windowAudio` defaults to `"system"` in Blink ([user_media_request.cc, 157](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8103/third_party/blink/renderer/modules/mediastream/user_media_request.cc), comment "Default is kSystem"). Unless the page asks for `"window"`, sharing a game window on Windows offers *whole-system* audio.
- BCD's notes are stale or wrong here. They say Chrome supports only `exclude` and `system`, and the Edge entry says "removed in 143". The 157 source parses `"window"` and maps it to application audio, which is in the picker since branch 143 (7499). Treat the BCD rows for `windowAudio` as unreliable.

### 2.2 How Chrome's picker resolves a window share

From `GetWindowCaptureAudioType` in [desktop_media_picker_views.cc (157)](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8103/chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc):

- `"exclude"` → no audio.
- `"window"` → *application* audio if `media::IsApplicationLoopbackCaptureSupported()`. Otherwise system audio if the OS supports it. Otherwise none.
- `"system"` → system audio if supported.

The checkbox label for application audio is `IDS_DESKTOP_MEDIA_PICKER_ALSO_SHARE_APPLICATION_AUDIO`.

### 2.3 Per-application audio (wish 2) in Chromium

- **Windows.** `IsApplicationLoopbackCaptureSupported()` = feature `ApplicationAudioCaptureWin` **and** `IsWindowsProcessLoopbackCaptureSupported()`, which is `base::win::GetVersion() >= WIN11` ([media_switches.cc, 157](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8103/media/base/media_switches.cc)).
  - Feature history, read per branch: it lived in `media/audio/audio_features.cc` as `FEATURE_DISABLED_BY_DEFAULT` for **142–145** (branches 7444, 7499, 7559, 7632). It moved to `media_switches.cc` as `FEATURE_ENABLED_BY_DEFAULT` from **146** (branch 7680, stable 2026-03-10).
  - So: Chrome 142–145 needed a flag; Chrome ≥ 146 on Windows 11 has it on by default. Windows 10 never gets it and falls back to system audio.
- **How it captures.** `ProcessIdToApplicationLoopbackDeviceId(GetAppMainProcessId(window))` builds the device id `applicationLoopback:<pid>`. That id opens WASAPI process loopback with `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE` ([desktop_capture_devices_util.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/media/webrtc/desktop_capture_devices_util.cc), [audio_low_latency_input_win.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/audio/win/audio_low_latency_input_win.cc)).
  - It captures the window owner's *process tree*.
  - **Unverified:** whether this catches games whose audio comes from a process outside the window owner's tree, for example some launchers or anti-cheat wrappers. Also unverified: games in exclusive fullscreen; that is a video problem, but it decides whether the user can pick the window at all.
- **macOS.** `ApplicationAudioCaptureMac` was `FEATURE_DISABLED_BY_DEFAULT` in 145–149 and is `FEATURE_ENABLED_BY_DEFAULT` from **150** (branch 7871, stable 2026-06-30). It needs macOS ≥ 14.2 (Core Audio taps) and matches by bundle id plus pid ([application_loopback_device_helper.h](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/audio/application_loopback_device_helper.h)).
- **Linux.** Not supported. Source comment: "Linux/ChromeOS don't support this yet."

### 2.4 Excluding audio (wish 3) in Chromium: `restrictOwnAudio`

- **What it removes.** The capturing *document's* own audio, nothing else ([spec](https://w3c.github.io/mediacapture-screen-share/#dom-mediatrackconstraintset-restrictownaudio), [I2S](https://www.mail-archive.com/blink-dev@chromium.org/msg14230.html)).
- **How Windows does it.** For screen or system audio it switches to device `loopbackWithoutChrome`. That is WASAPI process loopback with `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE` on Chrome's own pid, which drops *all* of Chrome. Chrome's audio service then mixes the other tabs' audio back in (`services/audio/loopback_mixin.h`: "all output streams except those belonging to `group_id`").
  - Windows picker string: "Due to an API limitation on Windows we must share all output audio devices when restrict_own_audio is used". Process loopback is not tied to one output device.
- **Where it works.** `IsRestrictOwnAudioSupported()` is true only on Windows 11 and macOS ≥ 14.2. It is false on Linux and Windows 10.
- **What it means for graeae.**
  - It cannot exclude the Discord desktop app. No web API names another application to exclude, and the spec has no such option.
  - It **does** solve a problem graeae will certainly have. A sharer's graeae page also *plays* the other friends' shared streams. Without `restrictOwnAudio`, sharing the screen with system audio sends those streams back out, so viewers hear themselves.
  - If a friend ran Discord *in a browser tab* in the same browser, `restrictOwnAudio` would not remove it: other tabs are mixed back in.
- If both `restrictOwnAudio` and `suppressLocalAudioPlayback` are set, Chrome uses only `restrictOwnAudio` (picker source comment).

### 2.5 Things no browser API can do today

- Name an arbitrary application to include or exclude. The page can only state preferences; the user picks in the browser's picker.
- Capture system audio *without* video. Chrome rejects audio-only `getDisplayMedia` because video is required by spec.
- Make a game's audio available with no picker interaction. The user must tick the audio checkbox every time; `audioSelection: "preferred"` only pre-ticks it.

### 2.6 Edge

Edge mirrors Chrome for every option in BCD except `windowAudio`, where the BCD data contradicts itself. Edge may turn Chromium features on or off on its own. **Unverified:** whether Edge ≥ 146 on Windows 11 offers application audio for `windowAudio: "window"`. One Windows 11 test before promising it would settle this.

---

## 3. Firefox

- **No audio in `getDisplayMedia` on any OS.** BCD `audio_capture_support`: Firefox `false`, and every audio option above is `false`. The tracking bug [1541425 "Implement audio capture for getDisplayMedia"](https://bugzilla.mozilla.org/show_bug.cgi?id=1541425) is `NEW`, `P3`/`S3`, assigned to nobody, last changed 2026-10-14. Mozilla's 2019 triage there calls the feature a spec "MAY" and low priority.
- **Tab sharing is Nightly-only.** `media.getusermedia.browser.enabled` is `@IS_NIGHTLY_BUILD@` in [StaticPrefList.yaml](https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml). Release Firefox offers windows and screens only. Wish 1 does not work in Firefox, even for video.
- **What does work:** `getUserMedia({audio: {deviceId}})` on any input device, including a virtual cable's output (§5). That is Firefox's only route to shared audio. Turn off `echoCancellation`, `noiseSuppression` and `autoGainControl`, and ask for 2 channels; otherwise game or music audio is processed as speech. This applies in Chrome too.

---

## 4. What a native Windows helper could add

### 4.1 The capture API

Windows process loopback: `ActivateAudioInterfaceAsync` with `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` and a `PROCESS_LOOPBACK_MODE` ([enum docs](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-process_loopback_mode), [sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)):

- `INCLUDE_TARGET_PROCESS_TREE`: only that process and its children. This is wish 2, and Chrome ≥ 146 already does it.
- `EXCLUDE_TARGET_PROCESS_TREE`: everything *except* that process tree. This is wish 3. It is the one thing a helper adds over Chrome.
- Minimum OS: "Windows 10 Build 20348". Chromium limits its own use to Windows 11.
- Not tied to one output device. "If the process … does not have any audio rendering streams, then the capturing process receives silence."

**Limitation for wish 3.** One activation takes one target tree. "Everything except Discord" therefore still contains the browser's playback of the other friends' streams, which brings back the echo from §2.4. Ways around it, all **unverified**:

- Two exclude streams cannot be combined into one.
- The helper could capture with include mode per wanted app and mix them.
- graeae could play remote audio through a separate output device, using `setSinkId`.

**Also unverified:** which Discord process renders voice. Discord on Windows is Electron launched through `Update.exe`. Excluding the tree of the main `Discord.exe` probably covers it, but the helper would have to find that process by name.

### 4.2 Getting helper audio into the call

| Route | How it works | Costs and risks |
|---|---|---|
| **a. Local WebSocket bridge** | Helper serves PCM on `ws://127.0.0.1`; page plays it through an `AudioWorklet` into `MediaStreamAudioDestinationNode`, then adds the track to the call | Since **Chrome 147** (2026-04-07), WebSocket connections from a public site to loopback need the **Local Network Access permission prompt** (LNA launched for fetch in 142; [Chrome blog](https://developer.chrome.com/blog/local-network-access); WebSocket expansion is chromestatus 5152728072060928 per [this tracker](https://github.com/getsentry/browser-updates-radar/issues/29), **not read from the primary source**). One more prompt for friends. Firefox has no LNA prompt (**unverified** for 2026). Page has to handle jitter and buffering. Works in Firefox too |
| **b. Local WebRTC peer** | Helper is a WebRTC peer on localhost (libwebrtc / Pion / webrtc-rs); page receives a real audio track and forwards it | WebRTC is **not** gated by LNA yet ([crbug 421223919](https://crbug.com/421223919)). Needs a signalling channel (that again is WebSocket or fetch, so LNA applies) and a WebRTC stack inside the helper |
| **c. Helper joins the call itself** | Helper publishes its own audio track directly to the other friends, paired with the page by a room code or deep link | No localhost, so no LNA. Viewers must sync two streams from one sharer (lip-sync **unverified**). The helper has to implement graeae's signalling and auth |
| **d. Virtual audio device written by the helper** | Helper creates a capture endpoint; page reads it with `getUserMedia` | Needs a **kernel-mode audio driver**. No documented user-mode API for creating endpoints was found (**unverified** whether one exists). Drivers need Microsoft attestation signing. In practice this means telling friends to install VB-CABLE (§5) and having the helper play into it |
| **e. Browser extension plus native messaging** | Extension talks to the helper over stdio | Helper still has to be installed, plus a registry key ([Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)). Host-to-extension messages are capped at **1 MB**; audio would travel as JSON chunks. Extensions alone (`tabCapture`) add nothing beyond tab audio. Adds a store listing or sideloading for each browser |

### 4.3 What installing a helper costs a non-technical friend

- **SmartScreen warning.** An unsigned `.exe` triggers "Windows protected your PC". The friend has to click "More info → Run anyway".
- **Code signing from Brazil.** Microsoft Artifact Signing (formerly Trusted Signing) Public Trust is not available: individuals must be in the US or Canada, and Brazil is not on the organisation list ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). What is left is a paid OV certificate from a CA, or unsigned.
- **Firewall prompt.** Possible for routes (a) and (b) if the helper listens on a socket. Binding only to 127.0.0.1 usually avoids it (**unverified**).
- **Antivirus.** False positives on small unsigned tools that capture audio are plausible (**unverified**).

---

## 5. Workarounds that need no project code

### 5.1 VB-CABLE

[VB-CABLE](https://vb-audio.com/Cable/) is donationware, Windows XP to 11 (including Arm64), and has a macOS build. Install: unzip, "Run Setup Program in administrator mode. Reboot after installation." The site gives no install time; the expected 5–10 minutes is an estimate. Needs admin rights.

### 5.2 Wish 2 without Chrome 146, or on Firefox

1. Route the game's output to "CABLE Input" in Windows' per-app output setting: Windows 11 Settings → System → Sound → Volume mixer → app → Output device; Windows 10: "App volume and device preferences". This is described by third-party guides only; **no Microsoft page found**.
2. graeae captures "CABLE Output" with `getUserMedia`.
3. The friend no longer hears the game unless they enable "Listen to this device" on CABLE Output. That adds latency; how much is **unverified**.

Works in Firefox. Cost: driver install, reboot, and 2–3 settings screens per game.

### 5.3 Wish 3 by splitting output devices (Chrome system audio)

Chrome's plain system audio is the **default output device only** (§1).

1. Make the cable (or a second physical output) the Windows *default* device.
2. Point Discord's output (Discord → Voice & Video → Output Device) and graeae's own playback (`setSinkId`) at the headset.
3. Hear the default device through "Listen to this device" → headset.

Chrome then captures game and desktop, but not Discord or graeae.

- **Do not combine with `restrictOwnAudio`**: on Windows 11 it switches to process loopback over *all* devices and brings Discord back.
- This whole recipe is **untested**, and it is fragile for a non-technical friend: four settings across Windows, Discord and graeae. Mixing Firefox's `getUserMedia` capture of the cable into a screen share is the same idea.

### 5.4 Other tools (not researched in depth)

Voicemeeter (also VB-Audio) and OBS's "Application Audio Capture" source (it uses the same process-loopback API) would also work. Both cost more to set up than VB-CABLE. **Unverified** beyond that.

---

## 6. macOS and Linux summary

- **macOS, Chrome:**
  - Tab audio: yes.
  - Screen or system audio: macOS ≥ 14.2, Chrome ≥ 142 (141 plausible).
  - Single-app audio through a window share: Chrome ≥ 150.
  - `restrictOwnAudio`: yes.
  - Each needs the macOS system-audio permission. The picker has a permission pane: `audio_capture_permission_checker_mac`.
- **macOS, Safari and Firefox:** no screen-share audio (BCD).
- **Linux, Chrome:** tab audio only. System audio behind `chrome://flags/#pulseaudio-loopback-for-screen-share`, off by default. No app audio, no `restrictOwnAudio`.
- **Linux, Firefox:** nothing.

The "share at least a browser tab" wish works on macOS and Linux only in Chromium-based browsers.

---

## 7. Unverified, and what would settle it

1. Edge's behaviour for `windowAudio: "window"` and `restrictOwnAudio`. *One test on Edge, Windows 11.*
2. Whether Chrome's application audio catches games launched through launchers or anti-cheat wrappers, and whether exclusive-fullscreen games can be picked at all. *Test 2–3 of the group's actual games.*
3. Whether Google's server-side config disables `ApplicationAudioCaptureWin` for some users despite the source default. *Can't see from outside; a test confirms it for one machine.*
4. macOS system audio in Chrome 141, where it was probably a server-side rollout.
5. Which Discord process renders voice, for a helper's exclude mode.
6. Chrome Local Network Access for WebSockets (147). Read through a third-party tracker, not chromestatus directly.
7. Whether Windows can create a virtual audio endpoint from user mode without a driver.
8. The §5.3 device-split recipe end to end, and the latency of "Listen to this device".
9. SmartScreen, firewall and antivirus behaviour for an unsigned helper.

## Sources (primary unless marked)

- Chromium source, release branches 7204–8154 and main, fetched 2026-11-15 from chromium.googlesource.com: `media/base/media_switches.cc`, `media/audio/audio_features.cc`, `media/audio/win/audio_low_latency_input_win.cc`, `media/audio/audio_device_description.cc`, `media/audio/application_loopback_device_helper.h`, `services/audio/loopback_mixin.h`, `chrome/browser/media/webrtc/desktop_media_picker_controller.cc`, `chrome/browser/media/webrtc/desktop_capture_devices_util.cc`, `chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc`, `chrome/browser/about_flags.cc`, `third_party/blink/renderer/modules/mediastream/user_media_request.cc`, `third_party/blink/renderer/platform/runtime_enabled_features.json5`.
- Chrome release dates: chromiumdash `fetch_milestone_schedule`.
- [W3C Screen Capture editor's draft](https://w3c.github.io/mediacapture-screen-share/).
- [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia); mdn/browser-compat-data `api/MediaDevices.json`, `api/MediaStreamTrack.json` @ `3e04f2c`.
- blink-dev intents to ship: [restrictOwnAudio](https://www.mail-archive.com/blink-dev@chromium.org/msg14230.html), [windowAudio](https://www.mail-archive.com/blink-dev@chromium.org/msg14415.html); [Chrome 141 release notes](https://developer.chrome.com/release-notes/141); [Chrome screen-sharing controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls).
- [Chrome Local Network Access blog](https://developer.chrome.com/blog/local-network-access); WebSocket expansion via [getsentry/browser-updates-radar#29](https://github.com/getsentry/browser-updates-radar/issues/29) (secondary).
- [Bugzilla 1541425](https://bugzilla.mozilla.org/show_bug.cgi?id=1541425); Firefox [StaticPrefList.yaml](https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml).
- Microsoft: [PROCESS_LOOPBACK_MODE](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-process_loopback_mode), [ApplicationLoopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/), [Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging); [VB-CABLE](https://vb-audio.com/Cable/).
- Secondary, used only as a lead: [addpipe macOS test](https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/).
