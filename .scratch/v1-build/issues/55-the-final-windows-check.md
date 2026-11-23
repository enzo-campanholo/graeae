# 55: The final Windows check

**What to do:** once [Screen audio only from a tab or one application](52-screen-audio-only-from-a-tab-or-application.md), [A screen share keeps its size](53-a-screen-share-keeps-its-size.md) and [A screen share sends H.264 high](54-a-screen-share-sends-h264-high.md) are on `graeae-test`, an agent on the owner's Windows desktop (MONSTRAO) checks what this Linux server cannot, on the real GPU, from a prompt the owner pastes. If it passes, the owner's wizard gets two small edits, and the owner runs it once for 0.1.

**Why:** this server encodes in software only and has no window audio, so each of the three tickets leaves its Windows lines here:
- A tab and a window still carry sound in Chrome and Helium (52).
- A fresh share of a game window and a fresh share of a tab open at about 1080 lines in hardware and stay there (53).
- A fresh share of a game window goes out as `64001f` in hardware (54).
- The owner looks at a real game and says the picture is no worse (54).

The split was decided in [The final Windows check](../../share-reliability/issues/16-the-final-windows-check.md). Agents take every reading. The owner's eye goes into the wizard's existing `t32-game` check, which already asks whether a real game shared from Chrome looks "smooth, sharp, colours true". The owner adds nothing else.

**Status:** ready-for-human (until 54 is fixed again and on `graeae-test`, and the owner says MONSTRAO is free)

**Blocked by:** 54

- [ ] **Before the run, a session here:**
  - Checks that `graeae-test` runs a build holding 52, 53 and 54 (the version in its footer or `wrangler deployments list`), and deploys `v1-build` if not.
  - Makes five invites into the room "Windows evidence", which already exists: Win Chrome, Win Watcher, Win Firefox, Helium Share and Win Spare. The invites go to the owner in chat, never into a file.
  - Gives the owner the paste below with the five links filled in.
- [ ] **The owner** opens an agent on MONSTRAO, pastes the message, approves what it asks, and says when it is done.
- [ ] **After the run, a session here:**
  - Reads the report on `evidence/windows-<date>` and writes the readings into this ticket as a comment.
  - **If every line passes:** makes the two edits to `scripts/owner-checks.sh` below, removes the five members in People, and resolves this ticket.
  - **If a line fails:** comments the readings on the build ticket that owns it (52, 53 or 54) and sets that ticket to `needs-triage`. The wizard is not edited, and the owner is not asked to run it, until the fix is in and this run has passed again.
- [ ] **The wizard's two edits**, made only after the run passes:
  - In `t32-game`, one line saying the share now goes out as H.264 high at full size, so a soft or blocky picture in fast motion is a fail. Keep the id `t32-game`, since nothing was recorded for it.
  - In `webrtc_help`, the hardware encoder is named `D3D12VideoEncodeAccelerator` (the Windows evidence run), and the help also reads the `outbound-rtp` entry's codec: `64001f` for a screen share from Chrome or Brave, `42001f` for a webcam.
- [ ] **If the owner fails `t32-game`:** the owner had nothing to compare against, so a session here first reads that share's `stats` lines (profile, size, encoder, QP) with the log token (CLAUDE.md, Logs). High is turned off only if those lines point at it. No A/B switch is added for the owner.

The owner's part: paste the message once, and later run the wizard once. Nothing else.

## Prompt for MONSTRAO

The owner pastes this, with the five invite links the session here gives them:

> You are on MONSTRAO, my Windows desktop. In the graeae repo, `git fetch origin` and check out `v1-build` at its latest. Read `.scratch/v1-build/issues/55-the-final-windows-check.md`, the section "Instructions for the MONSTRAO agent", and carry it out alone; ask me only for what it says only I can do. The invites, one per member, each usable once: Win Chrome `<link>`, Win Watcher `<link>`, Win Firefox `<link>`, Helium Share `<link>`, Win Spare `<link>`.

### Instructions for the MONSTRAO agent

You check that three changes behave on Windows as they were built to. You decide nothing and change nothing in graeae's code. Read first:
- 52, 53 and 54 in this folder;
- the earlier run, `.scratch/share-reliability/issues/09-windows-evidence-run.md`. Its "Instructions for the MONSTRAO agent" set out the tools, and its rules hold here unchanged: own user-data-dirs, no invite in a pushed file, ask before sharing the entire screen, quiet tones read from statistics.

**What is different this time.** No `fixes.js` override: no `--codec`, `--degradation`, `--start-bitrate` or `--max-bitrate`. graeae's own code is what is checked. The instance is `https://graeae-test.cloudflare-item736.workers.dev`. Record the build shown in its footer.

**The members.**
- Win Chrome shares in the installed Chrome. Win Watcher watches in Chrome.
- Win Firefox watches in the installed Firefox, driven as in the earlier run.
- Helium Share shares in the installed Helium.
- Win Spare replaces any member whose invite goes wrong.

Sample with `sample 1000` (250 ms around each start), and read each sharing tab's own `stats` lines too.

**The checks**, each written up as soon as it is done:

1. **High is chosen on its merits.** In Chrome and in Helium, record:
   - `RTCRtpSender.getCapabilities("video")`'s H.264 entries;
   - what `navigator.mediaCapabilities.encodingInfo({ type: "webrtc", video: { contentType: "video/H264; profile-level-id=64001f", width: 1920, height: 1080, framerate: 60, bitrate: 12000000 } })` answers (`supported`, `smooth`, `powerEfficient`), through `eval`.
2. **Fresh window shares.** 8 starts by Win Chrome and 4 by Helium Share, each of a 1600x900 or larger `content.html` game window at 60 fps, with a `reload` before each start and Win Watcher watching. For each, record:
   - the first frame's size, encoder and `hardware`;
   - at 10 s and 25 s: size, encoder, `hardware`, codec and `profile-level-id`, and bitrate.

   Pass: every start shows its first frame at about the window's full size, in hardware, as `64001f`, and is still that size in hardware at 25 s.
3. **Fresh tab shares.** The same, with a tab of `content.html`: 8 starts in Chrome and 4 in Helium. Then one Chrome tab share resized down and back up, with devtools opened and closed, while live for 2 minutes.

   Pass: the same as check 2, and the resized tab never leaves hardware, scaled only by the capture itself.
4. **Watchers decode graeae's own high share.** Win Chrome shares the game window for 5 minutes, with Win Watcher and Win Firefox watching. At each watcher, record frames decoded and per second, dropped frames, freezes, key frames and the decoder, plus a fast-scene screenshot.

   Pass: both decode at about 60 fps, with no more than 1 freeze, and no growing drop count.
5. **Sound still goes out.** In Chrome and in Helium:
   - a tab share of `content.html` playing a tone, and a window share of a `content.html` window playing another tone;
   - for each, the audio track's `capture.label`, whether the sharing tab logged `capture.audio-dropped`, and the tone's `audioLevel` at Win Watcher.

   Pass: `Tab audio` and `Application Audio`, no `capture.audio-dropped`, and the tone heard above silence at the watcher.
6. **A webcam is unchanged.** Win Chrome shares a webcam (Chrome's fake device if there is no camera, or the owner's if they say so) for 1 minute. Record its codec and `profile-level-id`.

   Pass: `42001f`, or VP8.

**The report.** On a branch `evidence/windows-<YYYY-MM-DD>` from `v1-build` (add `-2` after the date if that branch already exists), add a file `docs/evidence/windows-<YYYY-MM-DD>.md` holding:
- each browser's version, the Windows build, and the GPU driver;
- one section per check, with its readings in a table and pass or fail;
- a closing list of what could not be done and why.

Put the readings files and screenshots beside it in `docs/evidence/windows-<YYYY-MM-DD>/`, under 50 MB in all. Push the branch and open no pull request. Then tell the owner, in one line, that it is pushed.

**Clean up.** Close every browser you started and delete the user-data-dirs you made. Leave the members on `graeae-test`: a session on the other machine removes them.

## Comments

**Before the run (2026-11-23).** `graeae-test` runs version `b6d04cf6`, whose footer reads `eca6adf-dirty`. That is ticket 54's working tree before it was committed as `6c3ce33`. Its front-end bundle is byte for byte a production build of `98f62aa` (v1-build's head, the last commit to touch `src/`), apart from the build label. So it holds 52, 53 and 54 and was not redeployed. The MONSTRAO agent should expect `eca6adf-dirty` in the footer. `v1-build` was pushed to origin so that agent can read this ticket. The owner said MONSTRAO is free. Five invites into "Windows evidence" were made through the owner's API from the device that 53 and 54 reused: Win Chrome, Win Watcher, Win Firefox, Helium Share and Win Spare. They were given to the owner in chat and are not written here. They work for 7 days. No other member, room or invite was touched.

**The run (2026-11-23): failed on 54.** The report is `docs/evidence/windows-2026-11-23.md` on `evidence/windows-2026-11-23` (commit `75d6581`), with the readings beside it. The run used `v1-build` at `b0922c8`, and `graeae-test` was on `eca6adf-dirty`, as expected. MONSTRAO: Windows 11 Pro build 26300.9974, RTX 5070 Ti, NVIDIA driver 32.0.16.2124 (621.24), Chrome 158.0.8127.37, Helium 0.22.2.1 (Chromium 158.0.8127.36), Firefox 160.0.1. The run used no `fixes.js` override.

| Check | Owner | Result | Readings |
| --- | --- | --- | --- |
| 1. High chosen on its merits | 54 | Fail | Both browsers list high only as `640033` (mode 1). `encodingInfo` for the ticket's `64001f` query says supported and smooth but not power-efficient. With `packetization-mode=1` added, every H.264 profile reads power-efficient. |
| 2. Fresh window shares (8 Chrome, 4 Helium) | 53, 54 | Fail on the codec, pass on size | 12/12 at 1920x1080 from the first frame to 25 s, all with `D3D12VideoEncodeAccelerator` in hardware, 3 to 9 Mbps at 10 s and 8 to 12 Mbps at 25 s. 0/12 high: every share sent `42001f`. |
| 3. Fresh tab shares (8 Chrome, 4 Helium) | 53, 54 | Fail on the codec, pass on size | 12/12 at full size (Chrome 1920x934, Helium 1912x964), in hardware throughout. 0/12 high. The live resize passed: 120 s through a resize down and up and docked devtools opened and closed. It stayed in hardware at 1920x934, 1920x996 and 1576x1080, scaled only by the capture. |
| 4. Watchers decode the share (5 min) | 54 | Fail for high, the picture passes | Chrome watcher: 18,095 frames at 59.9 fps, D3D11 decoder in hardware. Firefox watcher: 18,123 frames at 59.9 fps, Media Foundation H.264. Both had 0 freezes and 0 drop growth, but the share was baseline `42001f`. |
| 5. Sound still goes out | 52 | Pass | Chrome tab and Helium tab carried `Tab audio`, and the Chrome and Helium windows `Application Audio`. No `capture.audio-dropped`. The tone was heard at about 0.020 and silence read 0.000. Three trials were repeated after reloading the watcher (ticket 56). |
| 6. Webcam unchanged | 54 | Pass | Chrome's fake camera, since MONSTRAO has none: `H264 42001f`, `D3D12VideoEncodeAccelerator`, 60 s. |

The Windows lines of 52 and 53 pass. 54's fails on every share: the hardware check in `hardwareQuery` asks without `packetization-mode=1`, so Chrome on Windows never reads the query as power-efficient and goes to baseline. 54 has the readings and is back to `needs-triage`. Two side findings:
- Chrome lists high only at level `33`, so the `64001f` in the pass lines and the wizard edits may need to change once high goes out. This is noted on 54.
- A watcher on one connection through about 27 shares stopped receiving new ones (ticket 56, `needs-triage`).

As the ticket says for a failed line, the wizard is not edited and the owner is not asked to run it. The five members stay on `graeae-test`, and their browser profiles on MONSTRAO were deleted. A rerun needs five new invites, and whoever closes this ticket removes the old members.

**Decided for the rerun (2026-11-23, owner).** Owner's decisions:
- **Level:** high is accepted at any level (`6400xx`), since Chrome and Helium list it only as `640033`. The level an offer carries only sets a ceiling. The pass lines and the wizard edit now say so, and the agent records the level it reads.
- **Scope:** checks 2 and 3 drop to 4 starts from Chrome and 2 from Helium each, and check 5 is not run, because 52 passed and the fix touches only the codec choice. Checks 1, 4 and 6 run as before. Check 1's query now carries `packetization-mode=1`, as 54's fix will.

The rerun waits for 54's fix to be on `graeae-test`. The five members from the first run are to be removed in People before new invites are made.
