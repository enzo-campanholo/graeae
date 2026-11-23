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

**Status:** ready-for-agent

**Blocked by:** none

- [ ] **The rule.**
  - A Chromium screen share sends under "maintain-resolution" at every step except its last.
  - Its last step stays "balanced", as today. That only matters if the step-down (`STEP_DOWN`) is ever switched back on. Its steps set the scale and frame rate explicitly, so they still work.
  - A webcam share stays "balanced". A Firefox screen share stays "maintain-framerate" above its last step. Nobody has seen either open small.
  - Today `degradationPreference(sending)` in `src/app/lib/media/sending.ts` decides from the step alone, and the plan does not say what kind of share it is. One way to give it what it needs: `encodingPlan` in `src/shared/encoding.ts`, the one pure rule for how a share goes out, gives each plan the preference it degrades by above its last step. Choose whatever keeps the rule pure and in one place.
  - Add "maintain-resolution" to `Degradation`.
- [ ] **Comments.**
  - In `sending.ts`, the `STEP_DOWN` comment's "(resolution first)" and the `degradationPreference` doc comment ("resolution, so motion stays smooth") change to say what happens now.
  - In `encoding.ts`, mention it where the Chromium screen plan is made.
- [ ] **Spec (`.scratch/v1-build/spec.md`), Encoding and quality.**
  - **The step-down is switched off.** "the browser alone gives up what it must, resolution first" becomes: the browser alone gives up what it must; a Chromium screen share keeps its size and gives up frame rate ("maintain-resolution"), since under "maintain-framerate" a share opened small and in software and often stayed there (share-reliability tickets 11 and 09).
  - Drop "Left alone, Chrome also scales a game share below 720 lines in spells of 15 to 60 seconds, and encodes it in software there", or say it was the old preference's doing.
  - **A sharer on a weak upload.** Add that, between steps, a Chromium screen share keeps its size and the browser gives up frame rate.
- [ ] **Ticket 30.** Add a comment: its last item ("`maintain-resolution` above the last step is the candidate; ticket 18 kept resolution first") was decided by this ticket. Any step-down built later starts from "maintain-resolution".
- [ ] **Tests (on the fakes).**
  - In `test/sending.test.ts` (and `test/encoding.test.ts` if the plan carries it):
    - a Chromium screen share degrades by "maintain-resolution" above its last step and "balanced" at it;
    - a Firefox screen share degrades by "maintain-framerate" above its last step;
    - a webcam share degrades by "balanced".
  - `follow`'s first `apply` carries "maintain-resolution" for a Chromium screen share.
- [ ] **On this server, with `scripts/real-media/`**, against `graeae-test` once it is deployed, with no `fixes.js` override. The change itself is what runs.
  - 8 fresh starts of a window share and 8 of a tab share, each after a reload. Each must show its first frame at the full capture size, and still be at that size at 25 s.
  - One tab share is resized down and back up while live, and must keep its size, scaled only by the capture itself.
  - Compare with ticket 11's fresh-start readings: 13 of 16 at 480x270 before.
  - The watcher's `stats` lines show no new freezes.

The agent does all of this alone. This server encodes in software only, so hardware is left to the map's final Windows check, which gains one line: in Chrome and Helium, a fresh share of a game window and a fresh share of a tab open at about 1080 lines in hardware and stay there. The owner checks nothing for this ticket alone.
