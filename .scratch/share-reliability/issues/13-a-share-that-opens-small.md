# A share that opens small

Type: grilling
Status: open
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
