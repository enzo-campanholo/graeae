# Owner's verification

Type: task
Status: ready-for-human
Map: ../map.md

## Question

Does the built app hold up on real machines and against Cloudflare's own figures?

This is the owner's sign-off on the deployed app. The steps and pass marks are in the spec under [Verification before v1 is called done](../../v1-build/spec.md#verification-before-v1-is-called-done). v1 is not called done until this is resolved. [Remaining browser checks](21-remaining-browser-checks.md) were run on `graeae-test` instead of the prototype.

- [x] README walkthrough: the owner accepted the earlier agent walkthrough on a fresh instance for `v0.1.0`; no separate Cloudflare account run is required. Dashboard onboarding and real media with newly created Realtime credentials remain untested (see below).
- [x] Usage comparison: one real session of at least 2 GB, then Cloudflare's egress for the same period on the Analytics tab. graeae reading 0 to 10% above passes; otherwise change the margin and repeat (build ticket 23: 2.2 GB, margin set to 0%, reading +7.9%)
- [x] In the same sitting, read the relay's analytics with one viewer on the relay. If relayed watching is billed once, switch the doubling off (build ticket 27: Billable Usage cannot tell which figure is billed, so the doubling stays until a bill shows it)
- [x] When the comparison passes, remove "unverified" from the README's cost section (it no longer says it)
- [x] ~~macOS: the nine-step pass in current stable Chromium, with browser and operating system versions recorded~~ Dropped by the owner on 2026-11-20: no Mac to test on, so macOS is untested and best effort in the platform table
- [x] Linux: the nine-step pass in current stable Chromium, with browser and operating system versions recorded (2026-11-24: steps 3 and 5 against Windows Chrome in build ticket 65, Chromium 158.0.8127.36 on NixOS 26.11; the rest Linux to Linux in build ticket 32)
- [x] The Durable Object stays under the free plan's daily duration quota across a real evening, with the heartbeat and byte reports running (settled without a measurement: one object awake 24 hours uses at most 10,800 of the 13,000 GB-s, see [the research](../../../docs/research/free-plan-durable-object-limits.md). The same research found rows written can run out in an evening: build ticket 49)
- [x] Which CPU limit applies to a free-plan Durable Object (30 s per request, socket message or alarm by Cloudflare's limits table, one FAQ line implying 10 ms; no graeae path comes near either, by reading the code. Not measured: graeae-test's invocation logs are off, so its lines carry no CPU time)
- [x] A deploy leaves a dashboard-attached custom hostname in place; if not, the README documents the deploy flag (2026-11-20: attached through the Custom Domains API to a throwaway instance, two deploys as Updating says, kept and serving both times; `wrangler delete` removed it and its DNS record)
- [x] Apply the available browser evidence: Brave verified; Zen's screen-sharing gap documented; two qualities stay off; the existing 11-hour relay behavior stays in place.
- [ ] Record the real launcher-started game audio result ([Remaining browser checks](21-remaining-browser-checks.md)) and finish the owner's Windows checks on `graeae-test` ([build ticket 32](../../v1-build/issues/32-second-critique-pass.md) and owner recovery).

## Comments

**2026-11-20: what agents did without the owner.**

- **The README walkthrough.** A fresh clone of v1-build, deployed as `graeae-readme-check` with a new setup secret, followed Deploying step by step: becoming the owner, the reset day, the budget, an invite and a second member joining, rotating `SETUP_SECRET` as written, a custom hostname, then Deleting. All worked as written. The README now gives `--name` wherever a second instance needs it (Updating and Rotating would have deployed over `graeae`), says what a wrong media value looks like, follows Cloudflare's current billing paths, and says a hostname added after people are in makes each of them a stranger there. Not proven: shares on a fresh instance, because the media values in `.dev.vars` are placeholders and wrangler's login cannot reach Realtime (graeae-test proves the same code with real values); the dashboard steps for the card, the SFU application and the TURN key, checked against Cloudflare's docs only (the docs give no dashboard path for creating a TURN key); and a stranger's clone and checkout, which need the repo public and a tag on `main`. Nothing created is left on the account, except possibly an edge certificate for the test hostname (`graeae-readme-check` on the owner's domain) in the zone's SSL/TLS › Edge Certificates, which the token could not read.

**2026-11-20: a wizard for what is left.** `scripts/owner-checks.sh`, run on the Linux machine that holds the repo, walks the owner through the checks that need the owner's own machines, one at a time: getting back in on Windows Chrome; steps 3 and 5 of the nine-step pass between Windows Chrome and a Linux Chromium member it runs itself (`scripts/real-media/`); ticket 32's real-media checks on Windows; Remaining browser checks (Vivaldi, Brave, a launcher-started game) on graeae-test; and the macOS pass. Each answer goes below, under "Owner's results", and a re-run skips what is recorded.

**2026-11-20: the owner dropped macOS and Vivaldi, and added Zen, for 0.1.0.** With no Mac to test on, the macOS pass is struck above and macOS is best effort, untested, in the README's Platforms table and the spec. Vivaldi is best effort too. Zen, built on Firefox, joins the Windows Firefox row as "not yet verified" until its check in [Remaining browser checks](21-remaining-browser-checks.md) passes. The Linux row stays Limited: build ticket 32 checked it Linux to Linux in Chromium 157 today, and steps 3 and 5 against a Windows member are still in the wizard. `scripts/owner-checks.sh` no longer asks for Vivaldi or the Mac (their ids, `vivaldi-1080p60`, `macos` and `macos-1` to `macos-9`, are ignored if already recorded); Brave is the second member on Windows where Vivaldi was, and three Zen checks (`zen-watch`, `zen-webcam`, `zen-screen`) come last. Every other id is unchanged.

**2026-11-24: Linux steps 3 and 5 against a Windows member pass** (`docs/evidence/windows-2026-11-24.md` on `evidence/windows-2026-11-24` (commit `8cfe1bf`), through [build ticket 65](../../v1-build/issues/65-the-release-checks-on-windows.md)). Linux A was Chromium 158.0.8127.36 on NixOS 26.11; Windows Chrome was 158.0.8127.37 on Windows 11 26H2 (build 26300.9974).
- Step 3: Linux A watched Win Chrome's hardware H.264 high share of a game window at 1920x1080, 60 fps median, with no freezes, and its 523 Hz Application Audio at 0.030, over 3.5 minutes.
- Step 5: Win Watcher watched Linux A's tab share at 59.2 fps with no freezes, and its 440 Hz tab audio at 0.16 median.

The other seven steps were checked Linux to Linux in Chromium 157 in build ticket 32. The wizard's `step3-windows-share` and `step5-linux-tab` need not be asked.

## Existing release evidence

These results are from the agent run in [build ticket 65](../../v1-build/issues/65-the-release-checks-on-windows.md), not from the owner. The wizard recognizes them and only repeats them if asked.

- 2026-11-24 · `step3-windows-share` · **pass** · Linux Chromium saw and heard the Windows Chrome share.
- 2026-11-24 · `step5-linux-tab` · **pass** · Windows Chrome saw and heard the Linux Chromium tab share.
- 2026-11-24 · `brave-1080p60` · **pass** · Default-profile Brave sent hardware H.264 high at 59.9 fps with application audio.
- 2026-11-24 · `zen-watch` · **pass** · Zen watched the Windows Chrome screen share at 59.9 fps with audio.
- 2026-11-24 · `zen-webcam` · **pass** · Zen's fake webcam decoded in Chrome at 26.8 fps; the owner's real webcam check is separate.
- 2026-11-24 · `zen-screen` · **fail** · Zen captured the window but the sender encoded no frames; the README names the gap. An owner rerun is optional.
