# 65: The release checks on Windows

Status: resolved

Blocked by: none. The run waits for `graeae-test` to be deployed at `063611c` or later (tickets 62 to 64), and for the Linux partner below to be started on the Linux machine.

**What to do:** the readings left before v0.1 that need a Windows machine, taken by an agent on MONSTRAO as in [The final Windows check](55-the-final-windows-check.md). They cover [57](57-a-stopped-share-keeps-its-hardware-encoder.md)'s rerun, [Remaining browser checks](../../v1/issues/21-remaining-browser-checks.md) (Brave, Zen, a launcher-started game), steps 3 and 5 of the Linux pass in [Owner's verification](../../v1/issues/25-owners-verification.md), and the screenshots for [32](32-second-critique-pass.md)'s Windows look. Agents take every reading; the owner only looks afterwards.

Not here, because only the owner can: the look on a physical panel (the light pill's edge over white, the light stop red, stage against ground on a dim screen), a real webcam (MONSTRAO has none), "Click for sound" in the owner's everyday Chrome, the Cloudflare dashboard steps on an empty account, and `back-in`, since `/setup` forgets every other device of the owner's.

**The owner's part:**
- [ ] Wait for the session on the Linux machine to say that `graeae-test` runs the new build and that Linux A is in the room.
- [ ] Open an agent on MONSTRAO and paste the prompt below. Fill in the five invites from `.owner/invites/release-win-*` on the Linux machine (`cat` each one; never commit them).
- [ ] Approve what it asks, and say on the Linux machine when it has pushed.

## Prompt for MONSTRAO

> You are on MONSTRAO, my Windows desktop. In the graeae repo, run `git fetch origin` and check out `origin/v1-build`, then `pnpm install`. You take readings for the v0.1 release on `https://graeae-test.cloudflare-item736.workers.dev`. You decide nothing and change nothing in graeae's code.
>
> **Read first.** In `.scratch/share-reliability/issues/09-windows-evidence-run.md`, read the section "Instructions for the MONSTRAO agent": the Rules and the Tools. Then read the same section in `.scratch/v1-build/issues/55-the-final-windows-check.md`, and 57's comments. Their rules hold unchanged: every browser gets its own user-data-dir, no invite goes into a file you push, ask before sharing the entire screen, tones stay quiet and are read from statistics, and no `fixes.js` options. `scripts/real-media/member.ts` (`pnpm real-media`) drives each Chromium member, with `GRAEAE_CHROMIUM=<exe>`. For Zen, use `member.ts --browser firefox` with `GRAEAE_FIREFOX=<zen.exe>` to watch, and your own Puppeteer script over WebDriver BiDi to share. The instance runs build `063611c` (Cloudflare version `f3f2f775`), and its page loads the bundle `index-BeBV-JHN.js`: record the bundle name each browser loads, and every browser's exact version. Sample with `sample 1000` around each check, and save each sharer's `statslines`.
>
> **The members**, all in the room "Windows evidence". Each invite works once:
> - Win Chrome shares, in the installed Chrome: `<invite>`
> - Win Watcher watches, in Chrome: `<invite>`
> - Win Brave, in the installed Brave: `<invite>`
> - Win Zen, in the installed Zen: `<invite>`
> - Win Spare replaces any member whose invite goes wrong: `<invite>`
>
> If Brave or Zen is not installed, ask me before installing it (`winget`). A sixth member, **Linux A**, is in the room from my Linux machine. It shares a tab titled "Linux tone" that plays 440 Hz, and it watches Win Chrome's screen share by itself whenever one is live.
>
> **The checks.** Run them in this order, and write each one up as soon as it is done.
>
> 1. **Linux step 5.** Win Watcher watches Linux A's screen share for 2 minutes. Record its frames decoded per second, the decoder, freezes, and the 440 Hz `audioLevel`. Pass: the picture decodes, and the tone is above silence. If Linux A is not in the room, or not sharing, tell me and go on to check 3. Do check 2 once I say it is back.
> 2. **Linux step 3.** Win Chrome shares a 1600x900 or larger `content.html` game window at 60 fps, playing 523 Hz with its audio on, for 3 minutes. Then wait 30 seconds and stop it. Record the sender's encoder, `hardware`, codec and level, frame rate, bitrate and `capture.label`. The Linux side records what it receives.
> 3. **57's rerun.** Reload Win Chrome once, then do not reload it again until this check is done. Win Chrome shares a tab of `content.html` playing a tone, with its audio on, 32 times in turn. For each share: start it, have Win Watcher watch it, wait 10 seconds, then stop it before the next one starts. For each share, record the sender's encoder and `hardware` on its sending connection, and the number of outbound video streams reading `hardware: true`. At Win Watcher, record the seconds to the first decoded frame and the frames decoded. Pass: every share goes out on `D3D12VideoEncodeAccelerator`, never more than 2 outbound streams read `hardware: true`, and Win Watcher decodes each share within 5 seconds.
> 4. **Brave at 1080p60.** Use a fresh profile, which gives Brave's default settings. Win Brave shares a `content.html` game window of about 1920x1080 at 60 fps, playing 523 Hz with its audio on, for 2 minutes, with Win Watcher watching. Save Brave's `brave://gpu` as text. Record the encoder, `hardware`, codec and `profile-level-id`, frame rate, bitrate, `capture.label`, and at Win Watcher the frames per second and the tone's `audioLevel`. Pass: hardware H.264 high (`6400xx`, any level) at about 60 fps and about 12 Mbps, `Application Audio`, and the tone heard.
> 5. **Zen** watches, at the Firefox level:
>    - `zen-watch`: Win Chrome shares a game window with a tone for 2 minutes, and Win Zen watches it. Record the frames per second, freezes and the tone's level.
>    - `zen-webcam`: Win Zen shares a webcam, using Firefox's fake device (`media.navigator.streams.fake`) for 1 minute, with Win Watcher watching. Record the codec, and the frames per second at the watcher.
>    - `zen-screen`: Win Zen shares a `content.html` window, never the entire screen without asking me. If Zen's picker cannot be chosen by script, ask me for the click. Win Watcher should see it as video only, with no audio track, and Zen should show "Video only. No one hears this share." Take a screenshot of each side.
>
>    Pass: every one works as described.
> 6. **A launcher-started game.** Win Chrome shares an application's window with audio on, where that application was started by a launcher that plays sound of its own. Build a stand-in for this. A launcher process plays 330 Hz, then starts a child process: a separate Chrome with its own user-data-dir and `--app=` set to `content.html?kind=game&title=Launched&fps=60&tone=660`. Win Chrome shares the "Launched" window for 1 minute. At Win Watcher, record which tones arrive, reading 330 and 660 Hz by their levels: mute one source at a time if you need to tell them apart. Pass: 660 Hz only. If Steam is installed, you may also try one real game that starts without any input, but ask me first.
> 7. **32's look, for me to judge later.** With Win Chrome sharing the game window, take screenshots at Win Watcher in dark and light, at 1920x953 and 1366x768: the tile on the stage, the hover pill, the focused picture, fullscreen, and the strip's 96px pictures. Then `reopen` Win Watcher. Say whether "Click for sound" shows, and whether this profile counted the page as clicked (`navigator.userActivation.hasBeenActive`).
>
> **The report.** On a branch `evidence/windows-2026-11-24` from `origin/v1-build` (add `-2` after the date if that branch already exists), add `docs/evidence/windows-2026-11-24.md` holding:
> - the Windows build, the GPU driver, and each browser's version;
> - one section per check, with its readings in a table and pass or fail;
> - a closing list of what could not be done, and why.
>
> Put the readings and screenshots beside it in `docs/evidence/windows-2026-11-24/`, under 50 MB in all. Push the branch, and open no pull request. Then tell me, in one line, that it is pushed.
>
> **Clean up.** Close every browser you started, delete the user-data-dirs you made, and stop any launcher stand-in. Leave the members on `graeae-test`: a session on the other machine removes them.

## Comments

**2026-11-24: done.** The report is `docs/evidence/windows-2026-11-24.md`. `graeae-test` ran `063611c` (version `f3f2f775`). Linux A was Chromium 158.0.8127.36 on NixOS 26.11, run by `scripts/real-media/linux-partner.sh`; its readings are in `.logs/linux-partner-2026-11-24/`. Every member and invite of the run has been removed or cancelled.

| Check | Result |
| --- | --- |
| 1. Linux step 5, Linux A → Win Watcher | Pass: 59.2 fps, D3D11 decoder, 0 freezes, 440 Hz at 0.16 median |
| 2. Linux step 3, Win Chrome → Linux A | Pass: sent in hardware, H.264 `64001f`, 59.9 fps, Application Audio; Linux A got 1920x1080 at 60 fps median, 0 freezes, the 523 Hz tone at 0.030, over 3.5 minutes |
| 3. 57's rerun | Pass: 32 of 32 on `D3D12VideoEncodeAccelerator`, at most 2 `hardware: true` outbound streams, each decoded in 0.97 to 2.22 s, last video mid 64 |
| 4. Brave | Pass: 1.100.58 (Chromium 158), hardware H.264 `64001f`, 59.9 fps, 11.2 Mbps, Application Audio, 60 fps and the tone at the watcher |
| 5. Zen | `zen-watch` and `zen-webcam` pass; `zen-screen` fails (below) |
| 6. Launcher | Pass: only the window's 660 Hz reached the watcher, the launcher's 330 Hz stayed at the noise floor. A real Steam game (Persona 5 Royal, untouched) decoded at 48 fps, but its Application Audio read 0.0000 throughout: the game may have been silent; not settled |
| 7. 32's look | Screenshots taken, for the owner. A reopened tab counted as clicked under automation, so whether a real Chrome shows "Click for sound" stays the owner's |

**Zen's screen share sends nothing.** Zen 1.24.3b (Gecko 160) captured a Chrome window at 1692x995 and 30 fps, and its sending connection connected (srflx to host, UDP) and published. But its VP9 sender encoded 0 frames and sent 0 bytes. The media server refused both of Chrome's pulls with `empty_track_error` ("No track data from remote peer"), so the watcher's tile went back to the empty stage, and the instance logged `media.dropped` "a watch did not go live". The log is `.logs/graeae-test-1795535300000-1795535700000.jsonl` (15:53:09 to 15:53:21). The first rerun failed the same way. Ticket 17 saw a Firefox screen share play in VP9, but no Firefox screen share on Windows has ever been checked, so it is not known whether this is Zen, Firefox on Windows, or a Chrome window captured by Firefox.

**Also seen.** `linux-partner.sh` left its Xvfb running after a TERM; it was stopped by hand. Fixed afterwards: the script set its traps only once the display had started, so a TERM during the display's start ran no cleanup. A TERM 0.5 s in left Xvfb running, the same as here. The traps are now set first, and the cleanup works at any point. A TERM at 0.5, 2 and 8 s left nothing running.
