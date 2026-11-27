# 53: A screen share keeps its size

**What to build:** a Chromium screen share (a tab, a window or an entire screen) goes out under `degradationPreference` "maintain-resolution" instead of "maintain-framerate". When the browser has to give something up, it drops frame rate and keeps the picture's size. Webcam shares and Firefox screen shares keep what they have today.

**Why:** under "maintain-framerate", a share opens small and often stays small. Chrome shrinks the capture before the first frame and encodes it in software, and only some shares grow back.
- **On this server** ([Measure the upload estimate from this server](../../share-reliability/issues/11-measure-upload-estimate.md)): 13 of 16 shares opened at 480x270 and stayed there.
- **On Windows 11 with Chrome 158** ([Windows evidence run on MONSTRAO](../../share-reliability/issues/09-windows-evidence-run.md)):
  - 8 of 8 shares opened under 360 lines on OpenH264, and 6 were still at 304x172 after 25 s.
  - A shared tab stayed at 626x304 in software for 3 minutes.
  - Under "maintain-resolution", 8 of 8 opened at 1904x1072 in hardware and stayed there. A tab held 1920x934 in hardware through resizing, devtools, fullscreen and switching away.

This is the shape of the owner's 854x480 OpenH264 spells in ticket 18. The Windows run made this exact change, at the same `setParameters` call graeae already makes.

The owner chose this in [A share that opens small](../../share-reliability/issues/13-a-share-that-opens-small.md). Its answer gives the reasoning and what was rejected: the start bitrate, `x-google-max-bitrate` and a 720p step to retry hardware.

Spec: [Encoding and quality](../spec.md#encoding-and-quality).

Status: resolved

Blocked by: none

- [x] **The rule.**
  - A Chromium screen share sends under "maintain-resolution" at every step except its last.
  - Its last step stays "balanced", as today. That only matters if the step-down (`STEP_DOWN`) is ever switched back on. Its steps set the scale and frame rate explicitly, so they still work.
  - A webcam share stays "balanced". A Firefox screen share stays "maintain-framerate" above its last step. Nobody has seen either open small.
  - Today `degradationPreference(sending)` in `src/app/lib/media/sending.ts` decides from the step alone, and the plan does not say what kind of share it is. One way to give it what it needs: `encodingPlan` in `src/shared/encoding.ts`, the one pure rule for how a share goes out, gives each plan the preference it degrades by above its last step. Choose whatever keeps the rule pure and in one place.
  - Add "maintain-resolution" to `Degradation`.
- [x] **Comments.**
  - In `sending.ts`, the `STEP_DOWN` comment's "(resolution first)" and the `degradationPreference` doc comment ("resolution, so motion stays smooth") change to say what happens now.
  - In `encoding.ts`, mention it where the Chromium screen plan is made.
- [x] **Spec (`.scratch/v1-build/spec.md`), Encoding and quality.**
  - **The step-down is switched off.** "the browser alone gives up what it must, resolution first" becomes: the browser alone gives up what it must; a Chromium screen share keeps its size and gives up frame rate ("maintain-resolution"), since under "maintain-framerate" a share opened small and in software and often stayed there (share-reliability tickets 11 and 09).
  - Drop "Left alone, Chrome also scales a game share below 720 lines in spells of 15 to 60 seconds, and encodes it in software there", or say it was the old preference's doing.
  - **A sharer on a weak upload.** Add that, between steps, a Chromium screen share keeps its size and the browser gives up frame rate.
- [x] **Ticket 30.** Add a comment: its last item ("`maintain-resolution` above the last step is the candidate; ticket 18 kept resolution first") was decided by this ticket. Any step-down built later starts from "maintain-resolution".
- [x] **Tests (on the fakes).**
  - In `test/sending.test.ts` (and `test/encoding.test.ts` if the plan carries it):
    - a Chromium screen share degrades by "maintain-resolution" above its last step and "balanced" at it;
    - a Firefox screen share degrades by "maintain-framerate" above its last step;
    - a webcam share degrades by "balanced".
  - `follow`'s first `apply` carries "maintain-resolution" for a Chromium screen share.
- [x] **On this server, with `scripts/real-media/`**, against `graeae-test` once it is deployed, with no `fixes.js` override. The change itself is what runs.
  - 8 fresh starts of a window share and 8 of a tab share, each after a reload. Each must show its first frame at the full capture size, and still be at that size at 25 s.
  - One tab share is resized down and back up while live, and must keep its size, scaled only by the capture itself.
  - Compare with ticket 11's fresh-start readings: 13 of 16 at 480x270 before.
  - The watcher's `stats` lines show no new freezes.

The agent does all of this alone. This server encodes in software only, so hardware is left to the map's final Windows check, which gains one line: in Chrome and Helium, a fresh share of a game window and a fresh share of a tab open at about 1080 lines in hardware and stay there. The owner checks nothing for this ticket alone.

## Comments

### 2026-11-22: built, deployed to graeae-test and checked there

**The rule.** `encodingPlan` in `src/shared/encoding.ts` gives every plan a `degradation`: the preference it degrades by above its last step. A Chromium screen share gets "maintain-resolution", at one quality or two. A Firefox screen share gets "maintain-framerate". A webcam gets "balanced"; it has one step only, so it is "balanced" either way. `degradationPreference` in `sending.ts` returns "balanced" at a share's last step, as before, and the plan's `degradation` above it. `Degradation`, now with "maintain-resolution", moved to `encoding.ts` with the plan, and `browser.ts` and `fake-control.ts` import it from there.

**Comments.** In `sending.ts`, the `STEP_DOWN` comment and the `degradationPreference` doc comment now say what happens: frame rate goes first on a Chromium screen share, which keeps its size. In `encoding.ts`, the Chromium screen plan says why, with the readings from share-reliability tickets 11 and 09. The review found one more stale comment: next to `contentHint = "motion"` in `browser.ts`, it still said the encoder "gives up resolution before frame rate". It now points to the plan's `degradation`.

**Spec.** The three edits under Encoding and quality are in. The 720-line sentence now says the spells happened "Under 'maintain-framerate'". User story 63 is left as it was. It is about the step-down's own steps (720p60 before 720p30), and those still give up resolution first.

**Ticket 30.** It already had the comment from the map's close. Its last item is now ticked, with a second comment saying it is built and where.

**Tests.** `test/sending.test.ts` checks each case:
- a Chromium screen share, at one quality and two, degrades by "maintain-resolution" at its full plan and at 720p, and by "balanced" at 720p30;
- a Firefox screen share degrades by "maintain-framerate" at full and by "balanced" at its last step, 720p;
- a webcam degrades by "balanced" on both browsers;
- `follow`'s first `apply` carries "maintain-resolution" for a Chromium screen share (both plans), "maintain-framerate" for a Firefox screen share and "balanced" for a webcam.

`test/encoding.test.ts` checks each plan's `degradation`. Typecheck passes. Lint's only errors are in the untracked `.logs/upload-estimate/scripts`. All 472 tests pass in the Workers runtime, and all 60 browser journeys pass.

**Review.** The Spec axis found nothing missing. The Standards axis found the stale `browser.ts` comment, and a test helper typed with `string` instead of `Degradation`. Both are fixed. It also noted that the webcam plan's "balanced" is never read. It was kept, since the ticket says a webcam stays "balanced".

**On real media.** Deployed to `graeae-test` from `3ff8988` (version `ed2ade19`), with no `fixes.js` override. Two throwaway members, Probe S sharing and Probe W watching, joined "First room" from owner's invites. Each ran in a headed Chromium 158 on an Xvfb display (`:98`) through `scripts/real-media/member.ts`. Probe S shared `content.html`'s game in a 1600x900 window of its own, at 60 fps. Every start was fresh, with a reload between, and was read every 250 ms. During a share, Probe S's video sender read `degradationPreference` "maintain-resolution".

| Fresh starts | First frame | At 10 s | At 25 s |
|---|---|---|---|
| Window share, 8 | 1600x900, 8 of 8 | 1600x900, 59 to 60 fps, 8.0 to 9.5 Mbps | 1600x900, 59 to 60 fps, 12.0 Mbps, limit "none" |
| Tab share, 8 | 1602x806 (the tab's viewport), 8 of 8 | 1602x806, 59 to 60 fps, 6.5 to 7.4 Mbps | 1602x806, 59 to 60 fps, 11.9 to 12.1 Mbps, limit "none" |
| Watched, 2 window and 2 tab | full size, 4 of 4 | full size, 59 to 61 fps | full size, 59 to 60 fps, 12.0 Mbps, limit "none" |

- **Size.** No start changed size at any reading, and the size sent always matched the capture.
- **Frame rate.** The first frames came at 3 to 18 fps, and were at 59 to 60 within 2 s. After the first 3 s, the lowest reading in any start was 53 fps.
- **Encoder.** Software (OpenH264), as always on this server.
- **Before.** Ticket 11's fresh starts under "maintain-framerate" opened at 480x270 in 13 of 16, and stayed there. Its 8 starts under "maintain-resolution" (through `fixes.js`) opened at full width. These 20 match those.

**Resized while live.** A tab share was shrunk from 1600x900 to 1000x560 at 20 s, and grown back at 40 s. It sent 1602x806, then 1000x464, then 1600x806, always the capture's size, with `qualityLimitationResolutionChanges` 0. So it was scaled only by the capture. Frame rate held 60 through the shrink. After the grow back it read 45 to 50, with no limit reported, until the end at 58 s. That is the trade this preference makes; the size held.

**Watcher.** Probe W watched the 4 watched starts, each on a new stream at the sharer's full size (1600x900, or 1602x806). Each stream had 0 freezes, 0 frames dropped and 0 packets lost, and decoded at 60 fps. All 2,333 to 2,339 frames received were decoded. In the 16 unwatched starts, the watcher never opened a connection: "Watch everything", pressed before any share began, did not pick up later shares. So the watched starts were run separately, with `watch "Probe S" screen` pressed after each start.

**Files**, in `.logs/keeps-its-size/` (gitignored):
- `start-window-<n>.jsonl` and `start-tab-<n>.jsonl`: the 16 fresh starts.
- `watched-<window|tab>-<n>.jsonl` and `…-w.jsonl`: sharer and watcher of the watched starts.
- `resize-tab.jsonl`: the resize run.
- `*.out`: `member.ts`'s own lines, with invite addresses redacted.

Not checked here: hardware encoding, which this server lacks. It is ticket 55's first check ("a fresh share of a game window and a fresh share of a tab open at about 1080 lines in hardware and stay there (53)"), which was already in place. Afterwards Probe S and Probe W were removed in People, and their browser profiles and invite codes deleted. The other members and the pending invite were not touched, and the owner's device from `/setup` was reused, not made again. The desktop on `:98` was stopped.
