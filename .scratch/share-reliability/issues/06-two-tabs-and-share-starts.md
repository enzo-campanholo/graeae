# Two tabs, and share starts run many times over

Type: task
Status: open
Blocked by: 05
Map: ../map.md

## Question

Not a decision: the facts that What two tabs on one device do waits on. Done by an agent alone, on `graeae-test`, with `scripts/real-media/`.

The owner, on 2026-11-20: with two graeae tabs of one member at the stage, sharing the screen failed. The usual way there today: the gear or the member's own row opens the owner page or the "You" page in a new tab, and going "home" from it lands on the room again, so two tabs are at the stage. The spec says a share of a kind already live becomes a hand-over (spec, Shares), and two tabs on one device were meant to work as two devices do, so the failure is probably a bug.

1. Reproduce it: one member, two tabs in one room (the harness's `reopen`), share from the second, then from the first, with and without a share already live in the other. Pin down which step fails, where (the tab's lines, the instance's lines, the media server calls) and why. Fix nothing yet; name the cause and the place in the code.
2. Run share starts many times over, within the map's rule on what counts as a failure: a tab, a window and the entire screen, each started and stopped repeatedly; cancelling the picker and trying again; a reload with a share live; going offline and back within the grace period; a second member watching throughout. Record every start that failed, or a watch that showed no picture, with its lines.
3. On a tab share, record the capture size and the frame size sent over a few minutes, and whether it shrinks in steps when the tab is busy ([Why a shared tab falls back to software encoding](01-tab-share-software-encoding.md): the tab capturer shrinks itself under `maintain-framerate`; Chrome on Linux encodes in software, so only the size can be seen here).

Answer with the two-tab cause, the tab-size readings, each other failure found with its cause or best guess, and the pulled log saved under `.logs/` (gitignored), named in the answer.
