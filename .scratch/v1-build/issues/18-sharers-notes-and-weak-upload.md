# 18: Sharer's notes and weak upload

**What to build:** A sharer is told, on their own share and nowhere else, when something measurable is off: capture stuck near 48 fps, software encoding, or an upload that cannot carry 1080p. On a weak upload the share gives up resolution before frame rate and is never ended.

Spec: [Encoding and quality](../spec.md#encoding-and-quality), [The room's screen](../spec.md#the-rooms-screen). User stories 61 to 64.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 17

**Status:** ready-for-human

- [x] A capture that settles near 48 fps shows a dismissible note: "Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60"
- [x] That note is driven by the measured rate, so it stops appearing when the browser captures 60
- [x] A software-encoded share shows a quiet note saying so
- [ ] The media client watches the share's statistics and steps down itself: the 1080p quality stops first, so every viewer gets 720p60; if that does not fit, frame rate drops to 30
- [x] Bitrate, frame rate and scale are changed on the live share without renegotiating
- [x] The share steps back up when the upload recovers. The spec gives no thresholds for stepping down or up; choose them, and keep them as named constants in one place
- [x] A dismissible note tells the sharer when their upload cannot carry 1080p
- [x] graeae never ends a share for quality reasons
- [x] Notes are shown only to the sharer, never before sharing, and never block anything
- [x] The step-down decision is a pure rule tested with fed statistics through the fake media client; Seam 2 covers each note

## Comments

**Built** on `ticket/18-sharers-notes-and-weak-upload`, against the fakes, since tickets 13, 15 and 17 still wait on the owner's real-media checks. Picked up from a previous agent's WIP commit, which held only `test/sending.test.ts`; its timings were reworked for the settling window below. `pnpm test` (Seam 1, 328 tests; Seam 2, 25 journeys), `pnpm typecheck` and `pnpm lint` pass. No migration, and nothing in the backend: everything is in the media client and the page. One box needs real media, so the ticket waits for the owner (below). The owner was away, so the impeccable skill's questions were not asked; the UI follows `DESIGN.md`, whose Own Share section now describes the notes.

- **The pure rule** is `src/app/lib/media/sending.ts`: `startSending(plan, at)`, `nextSending(sending, reading)`, `sharerNotes`, `stepEncodings(plan, step, captureHeight)`, `degradationPreference` and `readingOf(stats, at)`, which turns a sender's `getStats()` into a reading: whether an active quality is limited by `bandwidth` (a stopped quality, or a `cpu` limit, does not count), the `media-source` frame rate, and software encoding (`powerEfficientEncoder` false, or an encoder named OpenH264, libvpx or libaom). A share's steps come from its plan: a Chromium screen share goes `full` → `720p` (the `f` quality set `active: false`; a one-quality share is scaled to 720p at 4 Mbps) → `720p30` (the 720p quality at 30 fps and 2.5 Mbps). A Firefox screen share has only `720p` (at 30 fps already, 2.5 Mbps), and a webcam none. Below its last step, `degradationPreference` is "balanced", so the browser degrades as it sees fit; above it, "maintain-framerate", so resolution gives way first. The share is never ended for quality.
- **The thresholds**, all named constants at the top of `sending.ts`. Statistics are read every 2 s. For **10 s after a share starts or changes step** the upload's limit is not counted, because the browser's bandwidth estimate starts low, climbs, and says "bandwidth" meanwhile; without that window every share would step down at its start. Then **three limited readings in a row (4 s)** make one step down. **30 s with no limited reading** makes one step back up. A step up that is stepped down again within **60 s** did not hold, and doubles the next wait, up to **8 minutes**; one that holds for 60 s resets it to 30 s. **The 48 fps note** appears once five readings in a row (8 s) read between 46 and 50 fps, and goes once five read 55 or more, so it stops appearing when the browser captures 60. Shares asking for 30 fps or less never get it.
- **The media clients** run each live share through `follow(plan, captureHeight, at, { apply, notes })`. It sets the full plan at once, then applies a new step and reports the notes as readings come. `MediaClient` gains `notes(capture, heard)`. **The real client** starts following in `accept`, which replaces ticket 17's "set the limits again after the answer" with the same `setParameters` call. It reads `sender.getStats()` on `every()` (the worker ticker), so the readings keep coming while the sharer's tab is hidden behind their game. A step is one `setParameters` on the live sender (encodings plus `degradationPreference`), with no renegotiation. **Ticket 17's note:** a screen capture's video track gets `contentHint = "motion"`, since games move and Chrome otherwise treats a screen capture as a document and keeps resolution over frame rate. **The fake** follows the same rule. A journey feeds it statistics with `graeaeFakeMedia.stats(kind, entries, at)`, with `at` counted from the share's start, and reads `sent` (each live share's encodings and degradation) and `offers` (how many offers the page has made).
- **The page** (impeccable skill, following `DESIGN.md`). `OwnShare` in the room client gains `notes`, and the sharer's own preview at the bar's foot shows them under its caption, in a polite live region. "Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60." and "Your upload can't carry 1080p, so this share goes out at 720p." (or "720p and 30 fps") are raised panels with a close button. "Encoded in software, so it costs your game more." is a quiet muted line like "Video only", with nothing to dismiss. **Decision:** a dismissed note comes back only if it goes away by itself and later holds again, so a new weak spell an hour later is told. The notes are grey, not amber, since they never block anything. Another device of the same member sees no notes, since they live in the sharing tab alone. With the bar folded into the rail there is no preview, so there are no notes either.
- **Tests.** `test/sending.test.ts` (25): each step down and its timing, the settling window at the start and after a step, no step on a moment's limit, the 720p30 floor, stepping up one step at a time, the doubling wait and its 8-minute cap, the reset after a held step, the webcam, a Firefox screen share, a one-quality share, what each step sends (scale never up), the degradation preference, the 48 fps note appearing, not appearing for a pass through 48, going at 60, never for a 30 fps share, the software note, and `readingOf` on Chromium's report shapes. Seam 2, `test/browser/notes.spec.ts` (members Quim and Rosa): nothing before sharing; the 48 fps note on the sharer's share alone, going at 60, coming back, dismissed; the software line. And a weak upload: 1080p stopped with no new offer and the note, then 720p30, the note dismissed with Stop still usable, the share still live for its viewer through a long weak spell, and 1080p again after two steps up.

**Needs the owner:** after ticket 13's deploy, on Windows 11 with current Chrome or Helium, sharing a game at 1080p60 to a viewer on another network. The step-down box stays unticked until then. The rule is tested, but whether Chrome's statistics and Cloudflare behave as it assumes has never run.
1. *A weak upload:* cap the sharer's upload, with a router's QoS or a tool such as NetLimiter, to about 10 Mbps, then about 3 Mbps, and watch `chrome://webrtc-internals`. At 10 Mbps, within about 15 s, `f` should go inactive while `h` keeps 720p at about 60 fps. The sharer's note should read "720p", and the viewer's "720p" mark (ticket 17) should appear under Auto, from Cloudflare's `ridNotAvailable` fallback. At 3 Mbps, `h` should drop to 30 fps and the note read "720p and 30 fps". Lift the cap: about 30 s later 720p60 should return, and 30 s after that 1080p. The share must never end. If `qualityLimitationReason` never says "bandwidth", or the share steps down at its start, the thresholds in `sending.ts` are where to look.
2. *A 144 Hz monitor:* the note should appear within about 10 s. Set the monitor to 120 Hz and it should go within about 10 s.
3. *Software encoding:* force it (`chrome://flags`, disable hardware video encoding) and check the quiet line appears; with hardware encoding it must not. If `powerEfficientEncoder` is missing and `encoderImplementation` names something not in the list, extend `SOFTWARE_ENCODER` in `sending.ts`.
4. *To judge:* whether "motion" as the screen's content hint looks right on a desktop or a document share as well as a game. It favours smooth motion over sharp text.

**Found during ticket 17's check (2026-11-17), on a healthy upload: the step-down fires falsely.** One quality (ticket 17 switched two off), CS2 at 1080p60 on the NVIDIA encoder, `graeae-test`. The sharer saw "can't carry 1080p, so 720p", though no packet was lost in 4 minutes and the round trip stayed under 10 ms. Chrome's bandwidth estimate (`availableOutgoingBitrate`) follows what the share sends: about 5 to 6 Mbps while the picture is calm (3 to 6 Mbps sent), climbing to 17 to 19 Mbps over 10 to 20 seconds when the game moves. Each time the motion comes faster than the estimate climbs, `qualityLimitationReason` reads "bandwidth" for several seconds, and:
- Chrome itself scales the picture down under "resolution first" (1280x720, then 853x480), and at 480 lines switches to `OpenH264`, software, until it scales back up;
- this ticket's rule counts three limited readings and steps down to 720p, then 720p30, with the note. It stepped back up after about a minute.
Two qualities had hidden it: the two encodes kept about 12 Mbps flowing, so the estimate never sank. The rule needs a sign of a real limit besides "bandwidth" (loss, a growing round trip, or an estimate that stays low for longer than a ramp takes), and "resolution first" may need rethinking for one quality; the 480-line software fallback suggests a floor. Dumps of the run: ask the owner (webrtc-internals, 16:32 to 16:36 UTC).

**Fixed after ticket 17's check (2026-11-17), with the owner.** An agent read the sharer's webrtc-internals dump of the false step-down second by second (16:32 to 16:36 UTC, one quality, CS2):
- Chrome's estimate (`availableOutgoingBitrate`) fell by itself, with nothing lost and a round trip of 1 to 9 ms. It went from 17.3 to 5.6 Mbps at 46 s, and from 20.9 to 4.5 Mbps over 191 to 211 s, each fall to about 0.85 times what had just been sent. It then took 15 seconds or more to climb back.
- `qualityLimitationReason` "bandwidth" only means Chrome lowered the picture because the encoder struggled at the bitrate it aimed at (H.264 QP around 37 or more). In motion at a 4 to 5 Mbps target that took about a second, and it lasted 7 to 15 seconds.
- The 720p step's own 4 Mbps cap starved the encoder. Chrome kept saying "bandwidth", scaled to 854x480 on OpenH264, and the rule took that for the upload again and stepped to 720p30.
- Chrome also went to 480p in software on its own once (at 219 s), with no step from graeae.

**Decisions (the owner):**
- A reading counts as held back by the upload only when all three hold:
  - Chrome says "bandwidth";
  - it aims under 90% of the step's own bitrate limit (`OWN_LIMIT_FRACTION`), so a limit from graeae's own cap does not count;
  - the share sends at least half of the estimate (`SENDING_FRACTION`), so a calm picture after motion does not count.
- A step down takes **12 such readings within 30 seconds** (`STEP_DOWN_WINDOW_MS`, `STEP_DOWN_READINGS`), after the same 10 s settling window. The earliest step down is now about 32 s into a share, not 14.
- **No step changes a bitrate limit.** A one-quality share keeps 12 Mbps at 720p and 720p30, since the estimate already holds it under what the upload carries. A two-quality share's 720p quality keeps its 4 Mbps, and a Firefox share its 6.
- Resolution-first (`maintain-framerate`) stays above the last step. Whether Chrome's own spells at 480p in software last long enough to need a floor is to be judged from the capped runs below.

`readingOf` now also reads the bitrate aimed at (`targetBitrate` over the qualities being sent), the bytes sent (over every quality), and the estimate, from the candidate pair the transport names. When the byte count starts again, the reading is not taken for a calm picture.

`test/sending.test.ts` gains tests for each of these:
- the healthy upload's spells, which do not step down;
- a calm reading now and then, which does not hide a weak upload;
- a limit from the step's own cap;
- a calm picture;
- a byte count that starts again;
- `readingOf` on Chrome's shapes.

The notes journey follows the new timings. `pnpm test` (Seam 1, 422; Seam 2, 35), `pnpm typecheck` and `pnpm lint` pass.

**Known limits, not built:**
- The window counts readings, not a fraction of them, so readings more than about 2.6 s apart could never step a share down. The real client reads every 2 s from the worker ticker.
- The estimate is the whole media connection's while the rate is the screen's alone, which is why the margin is half.
- A browser that reports no target or estimate is judged on "bandwidth" alone. Firefox, as far as is known, reports no `qualityLimitationReason` either, so its share would never step down.
- A step up still comes after 30 s with nothing held back, a calm picture included. The doubling wait limits how often a step up that does not hold is tried.

**The owner's check, revised** (replaces step 1 of "Needs the owner" above; steps 2 to 4 stand):
1. *No cap:* play for 4 minutes. No upload note should appear, and the share should stay at 1920x1080.
2. *A 10 Mbps cap:* the note "720p" should come within about 40 s of steady motion, with the share at 1280x720 and around 60 fps.
3. *A 3 Mbps cap:* about 40 s later, "720p and 30 fps".
4. *Cap lifted:* 720p60 should come back about 30 s later, and 1080p 30 s after that. The share must never end.

Send the dumps for each run. They calibrate the four constants named above, and show how long Chrome spends at 480p in software on its own.

**Checked by the owner** on 2026-11-17, on `graeae-test` (version `4c79e0cd`, Chrome on Windows 11): the 48 fps note at 144 Hz and the software-encoding line both work, as the owner had also seen in earlier testing (steps 2 and 3 of "Needs the owner"). The weak-upload runs and the content hint's judgement are still to come.
