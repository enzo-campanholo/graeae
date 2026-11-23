# A share that opens small

Type: grilling
Status: resolved
Blocked by: 09
Map: ../map.md

## Question

[Measure the upload estimate from this server](11-measure-upload-estimate.md) found that what holds a share down on this server is its size, not Chrome's estimate. 13 of 16 shares started with graeae's settings opened at 480x270 and stayed there for minutes, under `maintain-framerate`, sending about 5.8 Mbps on OpenH264 against a target of 9 to 12. The estimate settled at about 1.6× what was sent. That is the shape of the owner's 854x480 OpenH264 spells in [v1-build ticket 18](../../v1-build/issues/18-sharers-notes-and-weak-upload.md). Two one-line changes each removed it in 8 fresh starts of 8: `x-google-start-bitrate=6000` on the video codec of the received answer, and `degradationPreference` "maintain-resolution". Fix A (`x-google-max-bitrate`) took the estimate to 20 Mbps but never lifted a share from 480 wide.

Which change, or changes, does graeae make, each the smallest that removes its failure (the map's Notes)? To weigh, once the Windows evidence run says whether a share opens small there and what each change does on the owner's machine:

- **The start bitrate** (fix C): one line in the hook that already rewrites Opus in the answer. Its value, and what it does on a real weak upload: the first seconds sent above what the line carries.
- **"maintain-resolution"**: for every screen share, or for tab shares only, as [Why a shared tab falls back to software encoding](01-tab-share-software-encoding.md)'s first part proposes. Its cost: on a weak upload a share drops frame rate rather than size, against [v1-build ticket 17](../../v1-build/issues/17-encoding-rules-and-two-qualities.md)'s and ticket 18's "resolution first" for games.
- **Fix A**, with or without periodic probing (`contentHint` "detail" sent less than a third of "motion" here and is out): whether it still earns its place once a share keeps its size. Here it brought the estimate back within 17 s of a fall only with periodic probing forced. Without fix A, a share at full size was back at 12 Mbps 27 to 28 s after a fall.
- What the agent checks on `graeae-test` with `scripts/real-media/` (the fresh-start sequence and `fixes.js` of ticket 11), and what is left for the final Windows check.

Write the build ticket or tickets.

## Comments

**2026-11-22, from [Windows evidence run on MONSTRAO](09-windows-evidence-run.md).** Unblocked. What the Windows run adds (its answer, sections 1, 2 and 5, holds the readings):
- **A share opens small on Windows too**: 8 starts of 8 as today opened under 360 lines on OpenH264, and 6 of them were still at 304x172 after 25 s.
- **The start bitrate does not fix it there**: 5 of 8 stayed small on OpenH264. It worked 8 of 8 only on this server.
- **"maintain-resolution" does**: 8 of 8 opened at 1904x1072 in hardware and stayed there. A shared tab held 1920x934 in hardware for 3 minutes, through resizing, devtools, fullscreen and switching away.
- **Fix A changed nothing on Windows**: every fall of the estimate was a probe coming back near 5 Mbps, never the line; at full size in hardware the estimate was back at 12 Mbps within 2 to 8.5 s of every fall with or without it, and nothing padded or froze at the watcher.
- **Also settle here the second part of the tab-share fix** (from the map's fog): the 720p step to retry hardware when software is named. Under "maintain-resolution" the run found no software spell for it to act on; the one turn to software it saw followed a shrink under 360 lines, as today.

## Answer

Decided with the owner on 2026-11-22. Build ticket: [A screen share keeps its size](../../v1-build/issues/53-a-screen-share-keeps-its-size.md) (v1-build 53, `ready-for-agent`, nothing for the owner).

**The fix: "maintain-resolution" for every Chromium screen share.**
- It applies to a tab, a window or an entire screen, at every step except the last, which stays "balanced" for a step-down if it is ever switched back on.
- Not tab shares only, as [Why a shared tab falls back to software encoding](01-tab-share-software-encoding.md) proposed: game windows opened small too.
- Webcam shares ("balanced") and Firefox screen shares ("maintain-framerate") are unchanged. Nobody has seen either open small, and nothing changes where nothing has failed.
- It is the change the Windows run measured: graeae already sets `degradationPreference` at the `setParameters` call that `fixes.js` overrode.

**Its cost is accepted.** On a truly weak upload, a Chromium screen share now drops frame rate and keeps its size. That reverses the spec's "the browser alone gives up what it must, resolution first", and ticket 17's and 18's resolution-first stance for games. A weak upload is something wrong on the sharer's side, which this map's destination leaves out, and the step-down that would handle it ([v1-build ticket 30](../../v1-build/issues/30-weak-upload-signal.md)) is after 0.1. The spec line is rewritten, and ticket 30 is told that its "maintain-resolution above the last step" candidate is now decided.

**Left out, each because it removes no failure once a share keeps its size.**
- **The start bitrate** (fix C, `x-google-start-bitrate`): it failed on Windows (5 of 8 stayed small) and is redundant under "maintain-resolution". The first 10 s at 5 to 7.5 Mbps is an acceptable start.
- **Fix A** (`x-google-max-bitrate`), with or without periodic probing: on Windows every fall of the estimate was a probe, not the line. At full size in hardware, the estimate was back at 12 Mbps within 2 to 8.5 s of every fall, with or without it, and nothing padded or froze at the watchers.
- **The 720p step to retry hardware** (the second part of the tab-share fix): under "maintain-resolution" the Windows run found no software spell for it to act on. The sharer's software-encoding note and the `stats` log lines would catch one.

**Opus stereo, set by rewriting the local offer (from the map's fog): left as it is.** The fog meant to move it into the hook that would carry the start bitrate or fix A. Neither ships, so moving it would be a change of its own, with no failure behind it. It works on every browser today, and the logs would show a refused description at once if Chrome stopped allowing the edit.

**Verification.** The agent checks on `graeae-test` with `scripts/real-media/` and no overrides:
- 8 fresh starts each of a window and a tab open at full capture size and keep it at 25 s;
- a tab resized while live keeps its size;
- ticket 11's readings are the before.

The map's final Windows check gains one line: in Chrome and Helium, a fresh game-window share and a fresh tab share open at about 1080 lines in hardware and stay there.

No ADR: the change is one value and easy to reverse; the trade-off is recorded here, in the spec and on ticket 30. The glossary does not change.
