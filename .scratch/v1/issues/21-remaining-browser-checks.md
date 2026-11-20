# Remaining browser checks

Type: task
Status: ready-for-human
Map: ../map.md

## Question

Does ~~Vivaldi and~~ Brave on Windows 11 ~~each~~ share at 1080p60 with hardware H.264 at its default settings, and does single-application audio work in it and for a game started through a launcher? And does Zen on Windows 11 hold the Firefox row? (Vivaldi dropped and Zen added on 2026-11-20, the owner's decision: see the comment below.)

[Quality proof](13-quality-proof.md) left these untested, at the owner's request. The owner can do it alone with the prototype still deployed as the Worker `graeae-quality-proof` (how to read its log is in Quality proof's handoff comment):

- In ~~Vivaldi, then~~ Brave: share the game's window with audio on, codec "H.264 main/high (hardware)", monitor at 120 Hz, "Frame rate" 120, for 2 minutes with the game moving. Watch it from another browser and listen.
- In any supported browser: share the window of a game started through a launcher that stays running beside it, and say whether the viewer hears only the game.
- In Zen, at the Firefox level (added 2026-11-20): watch a Chrome member's screen share with its audio; share a webcam; share a screen, and check the viewer sees it as video only.

A browser that fails drops from Supported to Limited in [Platform promises](09-platform-promises.md) with its gap named; an audio failure adds a caveat to the spec. A Zen failure names a gap on Zen in the Firefox row. None reopens a decision. When done, ask the owner to run `./run.sh delete`.

This does not block the spec: until it is done the spec marks Brave "Supported, not yet verified" and Zen "not yet verified" in the Firefox row.

## Added by Quality adaptation

[Quality adaptation](22-quality-adaptation.md) decided that a Chromium screen share is sent at two qualities (1080p60 at 12 Mbps and 720p60 at 4 Mbps), on condition that this check passes. The owner does it alone, in the same sitting.

Does Chrome on Windows keep both qualities on the hardware encoder, with the game's frame rate unchanged?

- First the prototype page needs a two-quality option. It does not have one yet: a session adds it on the branch `prototype/quality-proof`, logging the encoder named for each quality in the `send` rows, and the owner runs `./run.sh`.
- Then, in a supported Chromium browser with the monitor at 120 Hz: note the game's fps, share the game's window with two qualities on for 2 minutes with the game moving, and note the fps again. Watch it from another browser.
- Pass: both qualities name a hardware encoder, the 1080p quality holds about 60 fps at about 12 Mbps, the 720p quality holds about 60 fps, and the game's fps does not fall.
- Fail: either quality is software encoded, or the game's fps falls. The spec then says one 1080p60 stream at 12 Mbps for every Chromium screen share, as set out in Quality adaptation's answer.

This proves the point on the owner's RTX 5070 Ti only. Until it is done the spec marks two qualities "decided, not yet verified".

## Added by Relay and credential life

[Relay and credential life](23-relay-and-credential-life.md) set a 12-hour relay credential, renewed at 11 hours by a connection restart for a tab on the relay. Two things it rests on are unmeasured. The prototype page first needs two additions on the branch `prototype/quality-proof`: a credential life the tester can set (1 to 2 minutes), and a "Restart with fresh credential" button on a watch tile.

- Watch a moving share with "Force relay" on and a 2-minute credential, and do nothing. Does the picture stop after expiry, and how long after?
- Same again, but press "Restart with fresh credential" before expiry. Does the picture carry on without a visible blip, and does it survive the old credential's expiry?

If the restart fails or blips badly, the spec says a tab on the relay reconnects once at 11 hours. If expiry does not cut a relay in use, the spec notes it; nothing changes. Neither reopens a decision.

## Comments

**2026-11-20: Vivaldi dropped, Zen added, by the owner's decision for 0.1.0.** Vivaldi is now best effort, untested, so its 1080p60 check is struck above; Brave and the launcher-started game stay. Zen is built on Firefox and joins the Windows Firefox row, marked "not yet verified" until its check passes: watching a Chrome screen share with its audio, sharing a webcam, and a screen share its viewer sees as video only. `scripts/owner-checks.sh` runs all of these on graeae-test rather than the prototype, with Brave as the second member on Windows where Vivaldi was (ids `brave-1080p60`, `launcher-audio`, `zen-watch`, `zen-webcam`, `zen-screen`).
