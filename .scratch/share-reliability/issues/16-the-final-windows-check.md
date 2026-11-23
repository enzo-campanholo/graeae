# The final Windows check

Type: grilling
Status: resolved
Blocked by: none
Map: ../map.md

## Question

Once [Starting again after a reload](../../v1-build/issues/51-starting-again-after-a-reload.md), [Screen audio only from a tab or one application](../../v1-build/issues/52-screen-audio-only-from-a-tab-or-application.md), [A screen share keeps its size](../../v1-build/issues/53-a-screen-share-keeps-its-size.md) and [A screen share sends H.264 high](../../v1-build/issues/54-a-screen-share-sends-h264-high.md) are on `graeae-test`, what is checked on Windows, by whom, and which build ticket adds it?

Known lines, each from its build ticket:

- A tab and a window still carry sound on Chrome and Helium (52).
- A fresh game-window share and a fresh tab share open at about 1080 lines in hardware and stay there (53).
- A fresh game-window share goes out as `64001f` in hardware (54).
- The owner's eye on a real game finds the picture no worse (54).

The map's Notes say these go into `scripts/owner-checks.sh`, which the owner runs once, after these fixes are on `graeae-test`. They also say the owner is busy and keeps only what only the owner can do. Most of these lines are readings a MONSTRAO agent can take alone on the real GPU, as it did in [Windows evidence run on MONSTRAO](09-windows-evidence-run.md). Decide the split: which lines a MONSTRAO agent checks from a pasted prompt, and which stay in the wizard because they need the owner's eyes or ears. Also decide whether either one waits for the other. Then write the build ticket (or tickets), `ready-for-agent` or `ready-for-human`.

## Answer

Decided with the owner on 2026-11-22. Build ticket: [The final Windows check](../../v1-build/issues/55-the-final-windows-check.md) (v1-build 55, `ready-for-human`, blocked by 52, 53 and 54, with the MONSTRAO instructions already written).

**The split: an agent takes every reading, and the owner only looks.**
- A MONSTRAO agent, from a pasted prompt, takes the three reading lines in Chrome and Helium:
  - tab and window sound (52);
  - fresh window and tab shares at full size in hardware (53): 8 starts each in Chrome and 4 each in Helium, with a reload before each;
  - `64001f` in hardware (54).
- It also takes three cheap readings the earlier run could not, since it forced high with `--codec`:
  - what `getCapabilities` and `encodingInfo(...).powerEfficient` answer, so high is known to be chosen on its own;
  - Chrome and Firefox watchers on graeae's own high share for 5 minutes;
  - a webcam still sending `42001f`.
- No `fixes.js` overrides: graeae's own code is what runs. Nothing else from [Windows evidence run on MONSTRAO](09-windows-evidence-run.md) is run again.
- The owner's eye on a real game gets no new wizard stage. `scripts/owner-checks.sh` already has `t32-game` ("smooth, sharp, colours true?" on a real game shared from Chrome), which the owner has not run. It gains one line saying the share now goes out as H.264 high at full size, so a soft or blocky picture is a fail. `webrtc_help` names `D3D12VideoEncodeAccelerator` where it said `MediaFoundationVideoEncodeAccelerator`, and reads the codec.

**The order: MONSTRAO first, then the wizard.** The owner runs the wizard once, so it waits for the agent's run to pass, and the two edits to it are made only then. A failed line goes back as a comment on the build ticket that owns it (52, 53 or 54), which is set to `needs-triage`, and the wizard waits for its fix and a passing re-run.

**If the owner's eye says the picture is worse.** It is an absolute judgement, with no A/B switch for the owner: there is nothing from before to compare against, and keeping its size alone should beat the old 854x480 spells. A `t32-game` fail is diagnosed first from that share's `stats` lines (profile, size, encoder, QP), and high is turned off only if they point at it.

**Rejected.**
- A new wizard stage for the owner's eye, since `t32-game` already asks it.
- Two tickets, one for the run and one for the wizard edit, since the edit is too small to stand alone.
- An A/B switch so the owner could compare high with baseline.

No ADR and no glossary change.
