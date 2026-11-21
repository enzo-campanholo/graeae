# What window audio picks up on Windows

Researched 2026-11-21 for [What window audio picks up on Windows](../../.scratch/share-reliability/issues/04-window-audio-on-windows.md) (map: share reliability). Chromium source is read at the Chrome 158 release branch, `refs/branch-heads/8127`, which is what Helium 0.22.2 (released 2026-11-20) builds: its [`chromium_version.txt`](https://github.com/imputnet/helium/blob/0.22.2/chromium_version.txt) says `158.0.8127.36`. Older branches were read to date each change. Nothing here was run on Windows. "Does" means "the 158 source says so". Inferences are marked **inferred**.

The request under study is `screenCapture` in `src/app/lib/media/capture.ts`: `windowAudio: "window"`, `restrictOwnAudio: true`, `systemAudio: "exclude"`, `selfBrowserSurface: "exclude"`, `audioSelection: "preferred"`, with echo cancellation, noise suppression and gain control off.

---

## 0. Answer

- **Sharing a Helium window takes Helium's sound, not the window's.** Helium sees that the window belongs to its own browser process. Because `restrictOwnAudio` is set, it then shares the mix of every tab the browser is playing, in every window and every profile, except the tab that is sharing. Windows' process loopback still runs on the browser's process tree, but its audio is thrown away. Only the browser's own mix is sent. The guess in the ticket gets the outcome right but not the mechanism. The exclusion is the browser's internal mix leaving out one tab; it is not Windows leaving out a process.
- **Sharing any other application's window** (a game, Chrome while graeae runs in Helium) takes that application's process tree through Windows process loopback. graeae's own playback is in Helium's process tree, so it is never in that capture. `restrictOwnAudio` changes nothing in that case.
- **What `restrictOwnAudio` leaves out:** the sound of the one tab that called `getDisplayMedia`, and nothing else: no other tab, profile or window. On Windows it works only on Windows 11. The browser-window case dates from Chromium 145 and is on by default from 146.
- **The watch-party case does not echo.** A member shares a Helium window with sound and watches a friend's screen share with sound in the same graeae tab. The friend's screen audio plays in that tab, and that tab is the one left out. This holds on Windows 11 with Chromium 146 or later; Helium 0.22 qualifies.
- **The owner's loop is the expected behaviour, not a bug in graeae's request.** The second profile's graeae tab is another tab of the same browser process, so its playback is part of the shared window's audio. The same happens with a second graeae tab in the same profile ([ticket 08](../../.scratch/share-reliability/issues/08-two-tabs-on-one-device.md)). It also happens with any other tab of that Helium that plays a graeae share. **Inferred:** with no echo cancellation and the watcher at full volume, the loop gain is about 1, so it does not die away.
- **A gap the ticket did not ask about: Windows 10, and Chrome before 146.** There a window share with sound falls back to system audio, with or without `restrictOwnAudio` (§4). On Windows 10, Blink drops `restrictOwnAudio` too, so the watch-party case echoes there. This contradicts Screen audio offer ([v1 ticket 07](../../.scratch/v1/issues/07-screen-audio-offer.md)), which lists "Window: video only" for Windows 10 and older Chrome. It also contradicts the glossary's "never the whole system's sound".

---

## 1. What `windowAudio: "window"` captures on Windows

### 1.1 From the picker to a device id

1. The picker offers *application* audio for a window when the page asks for `"window"` and `media::IsApplicationLoopbackCaptureSupported()` is true. Otherwise it falls back to *system* audio if the OS has it ([`GetWindowCaptureAudioType`](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=345)).
2. `IsApplicationLoopbackCaptureSupported()` on Windows is feature `ApplicationAudioCaptureWin` **and** Windows 11 ([media_switches.cc l.1855](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/base/media_switches.cc;l=1855), [l.2052](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/base/media_switches.cc;l=2052): `GetVersion() >= WIN11`). The feature is `FEATURE_ENABLED_BY_DEFAULT` ([l.1602](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/base/media_switches.cc;l=1602)), on by default since 146 (earlier research, `research/audio-capture` §2.3).
3. When the member accepts, the window's audio type is stored with the chosen source ([Accept, l.1318](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=1318)). `GetAudioDeviceId` then sends application audio to `GetApplicationAudioDeviceIdAsync` ([desktop_capture_devices_util.cc l.511](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util.cc;l=511)).
4. On Windows that function resolves the window to a process with `GetAppMainProcessId(window)` and builds the device id in `ProcessIdToApplicationLoopbackDeviceId` ([l.450](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util.cc;l=450)):

   ```cpp
   if (restrict_own_audio && base::GetCurrentProcId() == process_id) {
     return media::CreateRestrictOwnAudioBrowserLoopbackDeviceId();
   }
   return media::CreateApplicationLoopbackDeviceId(process_id);
   ```

   This code runs in the browser process, so `GetCurrentProcId()` is the browser's own pid.

### 1.2 Which process: `GetAppMainProcessId`

[desktop_capture_devices_util_win.cc l.165](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util_win.cc;l=165): it takes the window's owning process from `GetWindowThreadProcessId`. A UWP app uses its `Windows.UI.Core.CoreWindow` child instead. Otherwise `GetGenericAppRootProcessId` ([l.127](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util_win.cc;l=127)) walks up the parents for as long as each parent runs the same executable. It returns "the oldest ancestor process that shares the same executable image".

- **A Helium window** is owned by the Helium browser process. Its parent is whatever started Helium (Explorer, Playwright's Node), a different executable, so the walk stops there. The result is the browser process: the one running graeae. **Inferred** from the code; a Chromium top-level window is created by the browser process.
- **Every profile of one Helium is one browser process.** Profiles are subdirectories of one user data directory ([docs/user_data_dir.md](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:docs/user_data_dir.md;l=10)). Only one browser process can run per user data directory: a second launch hands its arguments to the running one ([process_singleton.h](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/process_singleton.h;l=39)). Windows of every profile, guest and Incognito windows included, therefore resolve to the same pid. That pid is the one running the sharing graeae tab.

### 1.3 Another application's window: Windows process loopback

For `applicationLoopback:<pid>` the capture is WASAPI process loopback. Its target is that pid, with `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE` ([audio_low_latency_input_win.cc l.246](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/audio/win/audio_low_latency_input_win.cc;l=246), table at [l.1714](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/audio/win/audio_low_latency_input_win.cc;l=1714)). Microsoft: "Render streams from the specified process and its child processes are included" ([PROCESS_LOOPBACK_MODE](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-process_loopback_mode)). `TargetProcessId` is "the ID of the process for which the render streams, and the render streams of its child processes, will be included or excluded" ([AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params)). The capture is opened through [`ActivateAudioInterfaceAsync`](https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-activateaudiointerfaceasync) with `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`. Process loopback is not tied to one output device.

So sharing a game's window takes the game's process and its children. Sharing a **Chrome** window from graeae in Helium takes Chrome's browser process tree. That tree includes Chrome's out-of-process audio service, a child utility process ([`kAudioServiceOutOfProcess`](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:content/public/common/content_features.cc;l=148) is on by default on Windows; launched by [`ServiceProcessHost`](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:content/browser/audio/audio_service.cc;l=118)). So it holds every tab of every profile of that Chrome. Helium's graeae tab is in neither tree, so it is never captured.

### 1.4 A Helium window: the browser's own mix

When the shared window is the sharing browser's own and `restrictOwnAudio` is on, the device id is `restrictOwnAudioBrowserLoopback:<browser pid>`. It is described as "loopback of a whole chromium instance when restrictOwnAudio is enabled" ([audio_device_description.h l.61](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/audio/audio_device_description.h;l=61)). The helper header adds: "used in the cases where the browser is capturing its own audio, but is not allowed to capture audio from the tab that performs the capture" ([application_loopback_device_helper.h l.71](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/audio/application_loopback_device_helper.h;l=71)).

Two things happen with that id:

1. **Windows still captures the browser's process tree.** The id counts as an application loopback device, so WASAPI opens process loopback in include-tree mode on the browser pid (§1.3 code paths).
2. **The audio service throws that capture away and sends its own mix.** Every input stream is created with `MaybeCreateRestrictOwnAudioLoopbackMixin`, bound to the requesting tab's `group_id` ([stream_factory.cc l.145](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:services/audio/stream_factory.cc;l=145)). For this device id it sets `include_primary_source = false` ([loopback_mixin.cc l.42](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:services/audio/loopback_mixin.cc;l=42)):

   > This device id means that all audio from the browser should be captured, except the audio originating from the current tab. We achieve this by configuring LoopbackMixin to not include the primary source, which leaves only the audio from the other tabs.

   The mixed-in signal is "all output streams except those belonging to `group_id` group" ([loopback_mixin.h l.51](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:services/audio/loopback_mixin.h;l=51); the matcher is [`ExcludingGroupIdMatcher`](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:services/audio/loopback_coordinator.cc;l=32)).

The commit that added it, [7e2fc4e](https://github.com/chromium/chromium/commit/7e2fc4e98179a30628a147f9bb3ade09494b7368) (2025-12-16, [crbug 468232149](https://issues.chromium.org/issues/468232149) "Support restrictOwnAudio when sharing audio from a chrome window"), says it in a sentence:

> When this device ID is used, we capture the audio from that window to ensure that the proper OS notifications are shown. Then we discard that audio and instead return the mixed audio from all chrome tabs except the one which requested the audio stream.

**Which tabs are "all chrome tabs".**

- A `group_id` is "Unique id identifying all streams belonging to the WebContents" ([forwarding_audio_stream_factory.h l.157](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:content/browser/media/forwarding_audio_stream_factory.h;l=157)): one per tab, frames included.
- Every output stream joins the loopback coordinator under its tab's group ([output_stream.cc l.226](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:services/audio/output_stream.cc;l=226)). There is one coordinator per audio service, and one audio service per browser process (the static remote in [audio_service.cc](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:content/browser/audio/audio_service.cc;l=118)).
- The mix therefore holds every playing tab of every window and every profile of that Helium, minus the one sharing tab. **It is not limited to the tabs in the shared window.**

**Tab mute does not take a tab out of the mix (inferred).** Helium turns on tab muting from the tab strip ([tabs.patch](https://github.com/imputnet/helium/blob/0.22.2/patches/helium/ui/tabs.patch), `kEnableTabMuting`). A muted tab's output is only kept from the speakers: "local audio output should be muted; either by having audio diverted … or a fake AudioOutputStream" ([output_controller.h l.347](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:services/audio/output_controller.h;l=347)). The loopback reads the same output controllers as "snoopers", so a tab muted in the tab strip should still be shared. A media element that is muted or at volume 0 renders silence, so its tab adds nothing.

### 1.5 Dating it

Read per release branch:

| Chromium | Branch | What changed |
|---|---|---|
| 140 | 7339 | Blink `RestrictOwnAudio` is `experimental` |
| 141 | 7390 | `RestrictOwnAudio` is `stable` ([json5](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:third_party/blink/renderer/platform/runtime_enabled_features.json5;l=5617)). The Windows screen path removes *all* of Chrome: `RestrictOwnAudioAddChromiumBack` is `FEATURE_DISABLED_BY_DEFAULT` |
| 142 | 7444 | `RestrictOwnAudioAddChromiumBack` is enabled by default ([e0d7d72](https://github.com/chromium/chromium/commit/e0d7d72a3bc0187a6ce3faadde48066521a92949), "keeping the feature flag as a kill switch"; [crbug 437005988](https://issues.chromium.org/issues/437005988)): other tabs come back |
| 145 | 7632 | The browser-window case (§1.4) lands "behind the same flags as regular application audio capture", which is still off by default in 145 |
| 146 | 7680 | `ApplicationAudioCaptureWin` is enabled by default, so §1.4 is live by default |
| 158 | 8127 | Unchanged; this is Helium 0.22.2 |

## 2. What `restrictOwnAudio` and `suppressLocalAudioPlayback` do

**The spec.** "The user agent MUST attempt to remove any audio from the audio being captured that was produced by the document that performed getDisplayMedia." If processing cannot, the user agent "SHOULD remove the audio by excluding the document's audio from being captured" ([Screen Capture ED, restrictOwnAudio](https://w3c.github.io/mediacapture-screen-share/#dom-mediatrackconstraintset-restrictownaudio)). It names only the capturing document. The spec offers no way to name other documents of the same browser.

**What Blink sends.** The constraint is read only as `ideal`, and only when `media::IsRestrictOwnAudioSupported()` ([user_media_request.cc l.516](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:third_party/blink/renderer/modules/mediastream/user_media_request.cc;l=516)). That is Windows 11 only on Windows ([media_switches.cc l.1924](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/base/media_switches.cc;l=1924)). graeae's bare `restrictOwnAudio: true` is an ideal value, so it is sent on Windows 11 and silently dropped on Windows 10.

| Surface the member picks | `restrictOwnAudio: true` | `suppressLocalAudioPlayback: true` |
|---|---|---|
| Tab | Ignored: the device id is the tab's capture id, and tab capture carries only that tab ([l.511](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util.cc;l=511)). graeae's own tab cannot be picked (`selfBrowserSurface: "exclude"`) | Mutes the captured tab on the member's speakers (`disable_local_echo`) |
| Window of the sharing browser, app audio (Win 11) | Every tab of the browser except the sharing tab (§1.4) | Ignored |
| Window of another application, app audio (Win 11) | No effect: that process tree only | Ignored: the app-audio path passes only `restrict_own_audio` |
| Window, system-audio fallback (Win 10, or Chromium < 146) | Win 11: `loopbackWithoutChrome` (everything except Chrome's audio-service tree) plus the mix of other tabs (142+). Win 10: dropped by Blink, so plain `loopback` | `loopbackWithMute` |
| Screen | Same as the row above. graeae never gets here: `systemAudio: "exclude"` stops the picker offering audio beside a screen ([l.404](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=404)) | `loopbackWithMute` |

Sources: [`GetAudioDeviceId`](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util.cc;l=511) and [`ProcessIdToApplicationLoopbackDeviceId`](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util.cc;l=450). `loopbackWithoutChrome` excludes the process tree of the *audio service's own* pid ([`GetTargetProcessId`, l.246](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/audio/win/audio_low_latency_input_win.cc;l=246): `GetCurrentProcessId()`, labelled "Chrome audio PID" in the table at l.1714). The picker uses only `restrictOwnAudio` when both are set ([l.461](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=461)). On Windows the system-audio checkbox then reads "share all output audio", because "Due to an API limitation on Windows we must share all output audio devices when restrict_own_audio is used" ([l.330](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=330)).

**Helium carries it unchanged.** Helium 0.22.2 and helium-windows 0.22.2.1 were searched for any patch under `media/`, `services/audio/`, `content/browser/media/`, `chrome/browser/media/` or Blink's `mediastream`. The only hits:

- `kEnableTabMuting` turned on ([tabs.patch](https://github.com/imputnet/helium/blob/0.22.2/patches/helium/ui/tabs.patch));
- `kLiveCaption` turned off ([remove-uneeded-ui.patch](https://github.com/imputnet/helium/blob/0.22.2/patches/ungoogled-chromium/remove-uneeded-ui.patch));
- WebRTC log upload disabled;
- a Web Audio fingerprinting jitter ([noise/audio.patch](https://github.com/imputnet/helium/blob/0.22.2/patches/helium/core/noise/audio.patch), §5).

`domain_substitution.list` lists `desktop_capture_devices_util_win.cc` and `audio_low_latency_input_win.cc`, but domain substitution rewrites only domain names in strings. Helium also does not fetch field trials ([disable-fetching-field-trials.patch](https://github.com/imputnet/helium/blob/0.22.2/patches/bromite/disable-fetching-field-trials.patch)), so the source defaults above are what Helium runs. **Inferred.** Chrome itself can still flip `ApplicationAudioCaptureWin` or the `RestrictOwnAudioAddChromiumBack` kill switch from Google's servers.

## 3. The watch-party case

The setup: member A shares a Helium **window** with sound, from graeae tab G. In G, A also watches friend B's screen share with sound.

- G plays B's screen audio from its `<video>` element ([`WatchedPicture.svelte`](../../src/app/lib/components/room/WatchedPicture.svelte)), so that sound is in G's `group_id`.
- G called `getDisplayMedia` with `restrictOwnAudio: true`, and the window belongs to Helium's own process. The device is therefore `restrictOwnAudioBrowserLoopback`, and the mix leaves out G's group (§1.4).
- A's share carries the shared window's tabs and every other playing tab of that Helium. It does not carry B's screen audio. **B does not hear an echo.**
- A's own preview in G is a muted element ([`SharePreview.svelte`](../../src/app/lib/components/room/SharePreview.svelte)) and is in G's group anyway.

| Variation | What the source says happens |
|---|---|
| A shares a game or other non-browser window | No echo: the capture is the game's process tree only (§1.3) |
| A shares a Chrome window while graeae runs in Helium | No echo from G. Chrome's own tabs are all shared |
| A has a second graeae tab, in any profile of the same Helium, playing B's share | **Echo**: that tab is another group. The same mechanism as the owner's loop |
| A is on Windows 10, or on Chromium 145 or older | Window audio falls back to system audio (§4). On Windows 10 `restrictOwnAudio` is dropped, so **B hears the echo** |
| A shares a tab | No echo: a tab capture carries only that tab, and G cannot be picked |

The owner's loop is the third row with no B at all. Profile 1's G shares a Helium window. Profile 2's graeae tab watches that share, so its playback is in the mix and goes back out in the same share. Profile 2 then plays it again. **Inferred:** the playback runs at element volume `gain(100) = 1` ([hearing.ts](../../src/app/lib/hearing.ts)), with no echo cancellation on capture and no gain control. Opus is close to unity gain, so each pass returns at about the same level, and the loop holds instead of fading.

## 4. Windows 10, and Chromium before 146

These are not part of the question, but they change the watch-party answer.

- On Windows 10, `IsApplicationLoopbackCaptureSupported()` is false, so `"window"` falls back to `kSystem` whenever `IsSystemLoopbackCaptureSupported()` is true. It always is on Windows ([media_switches.cc l.1988](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:media/base/media_switches.cc;l=1988)).
- `systemAudio: "exclude"` does not stop this: it governs the screen list only ([`AudioRequestedForType`, l.404](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=404)).
- `restrictOwnAudio` is dropped on Windows 10 (§2), so the device is plain `loopback`: everything on the default output device. G's playback of B is on that device, so B hears an echo. Discord's voices would be shared too.
- On Windows 11 with Chromium 142–145, the fallback is `loopbackWithoutChrome` plus the other tabs. That is whole-system audio minus G, so there is no echo from G, but it is still the whole system's sound.
- graeae never checks the operating system (capture.ts header). Decision 07's table ("Window: video only" for Windows 10 and older Chrome) therefore does not match what ships. Windows 10 is outside the supported level in the [README](../../README.md), but a member on it gets whole-system audio and an echo, not "video only". Deciding what to do about it belongs to the map.

## 5. Checks for the Windows evidence run, with nobody listening

The checks have to run on MONSTRAO (Windows 11, real audio device) against `graeae-test`. Everything is read from numbers: tone frequencies in the spectrum of a received or captured track, and `audioLevel` / `totalAudioEnergy` from WebRTC statistics. `scripts/real-media/page.js` already collects those statistics for inbound and outbound media. `scripts/real-media/content.html` already plays a tone of any frequency (`tone=<Hz>`, 2 Hz beat, gain 0.25 ± 0.2) once clicked.

### 5.1 Setup the checks depend on

- **Record versions.** Windows build (`[Environment]::OSVersion`, needs ≥ 22000 for Windows 11), Helium's `chrome://version` (expect Chromium 158.0.8127.x), and Chrome's.
- **Both profiles must be in one Helium browser process.** `scripts/real-media/member.ts` launches each member with `launchPersistentContext` on its own profile directory. That makes **one browser process per member**, which does not reproduce the owner's case (§1.2). Two ways to get one process:
  - **Faithful:** start Helium by hand with `--user-data-dir=<dir> --remote-debugging-port=9222`. Then run `helium.exe --user-data-dir=<dir> --profile-directory="Profile 2" <room address>`, which the running process takes over ([process_singleton.h](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/process_singleton.h;l=39)). Drive both with Playwright's `chromium.connectOverCDP`.
  - **Simpler:** `chromium.launch({ executablePath: helium })` with two `browser.newContext()`. **Inferred** to be equivalent: both contexts share the one browser process and audio service, and each tab is its own group whatever its profile.
  - **Confirm** with `Get-CimInstance Win32_Process -Filter "Name='helium.exe'"`. Exactly one process should have no `--type=` in its command line. The `--utility-sub-type=audio.mojom.AudioService` process's `ParentProcessId` should be that one.
- **Picking without a person.** Use `--auto-select-window-capture-source-by-title=<substring>` ([chrome_switches.h l.160](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/common/chrome_switches.h;l=160)); it matches windows only. `--auto-select-desktop-capture-source` can match a tab of the same title instead. The auto-selection goes through the real dialog's `Accept()`, which uses the audio checkbox ([l.1318](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=1318)). graeae's `audioSelection: "preferred"` pre-ticks it ([l.533](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/ui/views/desktop_capture/desktop_media_picker_views.cc;l=533)). The test switch `--system-audio-capture-default_checked` (underscore as spelled in [l.738](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/common/chrome_switches.h;l=738)) does the same. Read the real window titles from `Get-Process | Select-Object Id,MainWindowTitle` rather than guessing Helium's title suffix.
- **Sound must play.** Keep Playwright's `--mute-audio` default off, as member.ts does. Leave the Windows output device on and unmuted at a low volume: the loop test can get loud. Whether the endpoint's volume or mute affects process loopback is not documented by Microsoft (**unverified**). It cannot affect §1.4, whose mix is read inside the audio service.
- **Measuring a tone.** In any page holding a track:

  ```js
  const ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 16384;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(an); // never to ctx.destination
  const bins = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(bins);
  const db = (hz) => bins[Math.round(hz / (ctx.sampleRate / an.fftSize))];
  ```

  - Call a tone **present** when its bin is at least 20 dB above the median of all bins.
  - Call it **absent** when it is less than 6 dB above the median.
  - Take five readings a second apart.
  - Do not connect the analyser to `destination`: in the sharing tab, that would add sound to the tab being measured.
  - For a received share, use the track of graeae's `<video>` element, and keep the element playing (graeae does).
  - Helium's audio jitter changes read-back values by at most ±0.01% ([noise/audio.patch](https://github.com/imputnet/helium/blob/0.22.2/patches/helium/core/noise/audio.patch)), far below these margins. It can also be turned off with `--disable-features=HeliumNoiseAudio`.
- **The observer.** A watcher in a separate browser process: Chrome on MONSTRAO, or a `pnpm real-media` member on the Linux server. It measures the received share with the analyser and reads inbound `audioLevel` and `totalAudioEnergy`.
- **Tones.** Use frequencies far apart and not harmonics of each other: 440, 550, 660, 770, 880, 990 Hz.

### 5.2 The checks

Each check names the expected result from the source. A different result is the finding.

1. **Window audio is application audio.**
   - Share a Helium window from graeae with sound.
   - In the sharing tab, read the captured audio track's `label` and `getSettings()`. Expected: label `Application Audio` ([`GetAudioMediaStreamDeviceName`, l.336](https://source.chromium.org/chromium/chromium/src/+/refs/branch-heads/8127:chrome/browser/media/webrtc/desktop_capture_devices_util.cc;l=336)); `System Audio` would mean the fallback of §4.
   - Record whether `getSettings().restrictOwnAudio` is `true`. **Unverified** that Chromium reports it.
2. **What a Helium window carries.**
   - Profile 1 has graeae tab G and window W playing 440 Hz; W is the shared window. Profile 1 also has a second window playing 550. Profile 2 has a window playing 660.
   - G itself plays 880 (`eval` an oscillator into G's `destination`). Chrome, a separate browser, plays 990.
   - Measure the captured track in G, before encoding, and at the observer.
   - **Expected:** 440, 550 and 660 present; 880 and 990 absent.
3. **What another application's window carries.**
   - Same sources as check 2. From G, share the Chrome window instead.
   - **Expected:** 990 present; 440, 550, 660 and 880 absent.
4. **`restrictOwnAudio` itself.** With no graeae and no network:
   - From a `content.html` page in Helium playing 770, call `getDisplayMedia` from `eval` with `audio: { restrictOwnAudio: true }` and `windowAudio: "window"`, auto-selecting a Helium window that plays 440. Measure the page's own captured track.
   - **Expected:** 440 present, 770 absent. Repeat with `restrictOwnAudio: false`: **expected** 440 and 770 present. This also isolates graeae's request from the app.
5. **The watch-party case.**
   - B (the observer's process) shares a tab or window playing 523 Hz with sound.
   - A (Helium profile 1, tab G) watches B's screen share with sound. Check that it is really playing: in G, the `<video>` element is not `muted`, its `volume` is 1, and inbound `audioLevel` is above 0.
   - A shares Helium window W playing 440. B watches A's share and measures it.
   - **Expected:** 440 present, 523 absent, with B's inbound `totalAudioEnergy` steady once A's tone is steady.
   - Repeat with A sharing a non-browser window. **Expected:** the same.
6. **The two-profile loop (the owner's case).**
   - Profile 1's G shares Helium window W; W plays a 440 Hz tone for 5 s, then the agent closes it.
   - Profile 2's graeae tab watches that share with sound at full volume. The observer watches it too.
   - **Expected:** at the observer, 440 stays present for at least 30 s after the source stops, and inbound `totalAudioEnergy` keeps rising at about the rate it had while the tone played. Record the level each second to show whether it holds, grows or fades.
   - Controls, each started fresh:
     - (a) Profile 2 mutes the share with graeae's own mute. **Expected:** no loop; 440 gone within a second of stopping.
     - (b) Profile 2's tab muted from Helium's tab strip instead. **Expected (inferred, §1.4):** the loop persists.
     - (c) Profile 2 in a second Helium with its own `--user-data-dir`, a separate browser process. **Expected:** no loop.
     - (d) A second graeae tab in profile 1 instead of profile 2. **Expected:** loop, as in the main check.
7. **Optional: Windows 10.** Only if a Windows 10 machine or VM is at hand: repeat checks 1 and 5. **Expected:** label `System Audio`, and in check 5, 523 present at B (an echo).

The report should give, for each check, the frequencies present and absent with their dB above the median, the label and settings read, the versions, and the process check.

## 6. Unverified

- That the `MediaStreamTrack.label` of a display audio track is the device name above. Checks 2–6 do not depend on it.
- That a muted tab (tab strip) is still in the mix. Inferred from `OutputController`; check 6b settles it.
- Whether Windows' endpoint volume or mute changes a process-loopback capture of another application. Not stated by Microsoft; check 3 at a low but non-zero volume avoids depending on it.
- Whether Google's server config changes either feature for some Chrome users. Helium does not fetch field trials, so this does not apply to Helium.
- The loop's gain being about 1: inferred from unity element volume and unprocessed capture. Check 6 measures it.

## Sources

- Chromium source at `refs/branch-heads/8127` (Chrome 158), read 2026-11-21, linked inline. Earlier branches 7339–8154 were read for §1.5. Commits [7e2fc4e](https://github.com/chromium/chromium/commit/7e2fc4e98179a30628a147f9bb3ade09494b7368), [1df5251](https://github.com/chromium/chromium/commit/1df525135908533f52f95bd68a9a78e81deabc40), [e0d7d72](https://github.com/chromium/chromium/commit/e0d7d72a3bc0187a6ce3faadde48066521a92949) and [3175cfc](https://github.com/chromium/chromium/commit/3175cfc2eb08b30f30cac087311d267cf2caf1b6) were read on the chromium/chromium mirror.
- Chromium bugs [468232149](https://issues.chromium.org/issues/468232149) (Chrome window with restrictOwnAudio) and [437005988](https://issues.chromium.org/issues/437005988) (add Chrome audio back to the loopback); titles and linked changes only.
- [W3C Screen Capture, editor's draft](https://w3c.github.io/mediacapture-screen-share/): `restrictOwnAudio`, `suppressLocalAudioPlayback`, `WindowAudioPreferenceEnum`.
- Microsoft: [PROCESS_LOOPBACK_MODE](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-process_loopback_mode), [AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params), [ActivateAudioInterfaceAsync](https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-activateaudiointerfaceasync).
- Helium [0.22.2](https://github.com/imputnet/helium/tree/0.22.2) and helium-windows [0.22.2.1](https://github.com/imputnet/helium-windows/tree/0.22.2.1): `chromium_version.txt`, `patches/`, `flags.gn`, `flags.windows.gn`, `domain_substitution.list`.
- Earlier research: `docs/research/audio-capture.md` on `research/audio-capture`; [Audio capture capabilities](../../.scratch/v1/issues/01-audio-capture-capabilities.md); [Screen audio offer](../../.scratch/v1/issues/07-screen-audio-offer.md).
