# Two tabs, and share starts run many times over

Type: task
Status: resolved
Blocked by: 05
Map: ../map.md

## Question

Not a decision: the facts that What two tabs on one device do waits on. Done by an agent alone, on `graeae-test`, with `scripts/real-media/`.

The owner, on 2026-11-20: with two graeae tabs of one member at the stage, sharing the screen failed. The usual way there today: the gear or the member's own row opens the owner page or the "You" page in a new tab, and going "home" from it lands on the room again, so two tabs are at the stage. The spec says a share of a kind already live becomes a hand-over (spec, Shares), and two tabs on one device were meant to work as two devices do, so the failure is probably a bug.

1. Reproduce it: one member, two tabs in one room (the harness's `reopen`), share from the second, then from the first, with and without a share already live in the other. Pin down which step fails, where (the tab's lines, the instance's lines, the media server calls) and why. Fix nothing yet; name the cause and the place in the code.
2. Run share starts many times over, within the map's rule on what counts as a failure: a tab, a window and the entire screen, each started and stopped repeatedly; cancelling the picker and trying again; a reload with a share live; going offline and back within the grace period; a second member watching throughout. Record every start that failed, or a watch that showed no picture, with its lines.
3. On a tab share, record the capture size and the frame size sent over a few minutes, and whether it shrinks in steps when the tab is busy ([Why a shared tab falls back to software encoding](01-tab-share-software-encoding.md): the tab capturer shrinks itself under `maintain-framerate`; Chrome on Linux encodes in software, so only the size can be seen here).

Answer with the two-tab cause, the tab-size readings, each other failure found with its cause or best guess, and the pulled log saved under `.logs/` (gitignored), named in the answer.

## Answer

**Two tabs: not reproduced.** Two tabs of one member, sharing in turn, with and without a share live in the other, worked every time. That held on the fakes (a throwaway Playwright test, deleted) and in three runs on `graeae-test` with real Chromium members. Every hand-over went live and the old share ended. The owner's evening of 2026-11-20 is in `.logs/graeae-test-1794926137065-1795184737065.jsonl`, and it holds no failed start either:
- the original room tab was hidden behind the owner page from 09:53:54 (local time);
- a second tab went owner page, home, room, and shared the entire screen at 09:54:21, live within 3 s;
- the extra tabs were closed at 09:54:56;
- the owner stopped with graeae's Stop and shared again, live at 09:55:09, and the second profile watched it from 09:55:17.

No `share.failed`, `share.refused` or hand-over appears. What the owner saw as a failure is not in the logs; What two tabs on one device do should ask them. The closest mechanism found is the two bugs below together. A tab closed with a share live, then a share from the other tab within about 10 s, leaves that other tab unable to share until it is reloaded.

**Failure 1: a start in the first 10 s after a reload is refused.** It happened every time (6 of 6 reloads or closes with a share live; a start was tried soon enough in two of them).
- **What the member sees.** After a reload, or a closed tab, with a share live, the old share stays listed for about 10.5 s, so the page counts it as live elsewhere. "Share screen" opens "Your screen is already live", although it is this same tab before its reload. "Share from here" captures, and then the page says "Your screen share didn't start. Try again." (`not replaceable now`). If the member waits instead, the offer closes by itself and the click seems to do nothing. A start 12 s or more after the reload works.
- **Cause.** `Instance.cutOff` (`src/instance/instance.ts`, about line 607) awaits `Shares.cutOff` before `sharesEnded` tells the room. `Shares.cutOff` (`src/instance/shares.ts`, `cutOff`, `end`, `sweep`, `sweepConnection`) first closes the old share's tracks at the media server, then reads the connection's tracks. Each call takes 5.0 to 5.4 s on a connection whose peer has just gone, against about 300 ms otherwise (every close and tracks call of the run). Meanwhile `Shares.start` refuses a hand-over of a share that is ending, and `Room.svelte`'s `liveElsewhere` offers that hand-over.

**Failure 2: a refused first start leaves the tab unable to share until it reloads.** Seen once: round B, the retry 20 s after the refused hand-over, and every later try.
- **Mechanism.** The first start on a tab makes its media connection (`RoomClient.connected`, `src/app/lib/room-client.svelte.ts` about line 909; the instance's `connect`), and a session opens at the media server. If that start is refused before anything was published (failure 1, or any other refusal), the session never gets a peer. The media server then drops it. The next start on the same page offers into it and gets `410 Session appears to be disconnected. Please check if the PeerConnection is connected.` after 5 s, so the page says "didn't start".
- **Timing and scope.** A retry 11 s after the session was made worked (round A); one at 20 s failed, and so did another 5 minutes later. `RoomClient.publish` (about line 293) keeps reusing the connection, because nothing makes a new one after a refusal. Best guess, not tried: watching from that page fails the same way.

**Everything else started and showed a picture.** 39 starts were asked for in the run and 34 went live; the five that did not are the two of failure 1, the two of failure 2 and one cancelled picker. No watch failed.
- **Tab, window and entire screen.** Each was started and stopped four times or more, and each start was live within 2 s. With the watcher picking each new share, every one reached it within 4 s, including the first start 15 s after a reload. "Watch everything" is a one-off pick by design, so a new share has to be picked again.
- **Cancel and retry.** Cancelling the picker left "Share screen" ready with no message. The retry went live, chosen by hand in the picker, and the watcher saw it.
- **Offline and back.** Offline 8 s and 20 s, with a share live and a watcher, then back online. The socket resumed within the grace period, the share stayed live and the watcher's picture never froze. Playwright's offline cuts HTTP and the socket only, not the media connection's UDP, so a drop that also cuts media was not covered here.

**Tab-share sizes, Linux, OpenH264 in software.** The browser window was 1280x720 with a 1282x624 page. `getSettings` at grant says 1920x1080. The capture then follows the frame size sent: it starts at 728x354 (once 542x264), rises in steps to 912x444 and 1282x624 within about 10 s while Chrome says `limitedBy` "bandwidth", and stays at 1282x624, `limitedBy` "none", from then on. On a busy tab (the game page at 60 fps) the sizes held for 3.5 minutes. With all 8 cores loaded for 70 s, the capture's frame rate fell to 18 to 30 fps, but the size never stepped down and `limitedBy` never said "cpu". So on this server the steps come only from the bandwidth estimate at the start, and the shrink under `maintain-framerate` that Why a shared tab falls back to software encoding expects under load did not show here. Windows and the entire screen showed the same pattern. The first share on a new media connection was sent at 640x360 and climbed to full size in about 15 s; later shares on the same connection started at full size (1280x720 for the window, 1920x1080 for the screen).

**Logs.** The whole run is in `.logs/graeae-test-1795278756309-1795283537218.jsonl`, with no invite code in it. The screenshots of failure 1 are in `.impeccable/review/real-media/` (gitignored): `reload-offer.dark.960x700.png` and `reload-failed.dark.960x700.png`, and `t-retry2.dark.1920x953.png` for failure 2.

**Done along the way.**
- `scripts/real-media/member.ts` gained `handover screen|webcam` ("Share from here"), `newtab` and `tab <n>`, for two tabs of one member, and its watch shortcuts now look only in the Here list.
- On `graeae-test`, the members Probe T and Probe W were removed in People and their browser profiles deleted.

## Comments

**2026-11-21, corrected by [What two tabs on one device do](08-two-tabs-on-one-device.md).** The window read above as the owner's evening of 2026-11-20 was an agent trying to reproduce the owner's failure; the failure itself came before the logs and was never captured. The findings stand; only that reading changes.
