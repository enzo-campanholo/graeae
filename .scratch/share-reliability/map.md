# Share reliability and quality

Label: wayfinder:map

## Destination

A short set of build tickets in `.scratch/v1-build/issues/`, one per decided fix, each `ready-for-agent` or `ready-for-human`, so that a member with nothing wrong on their side can always share, and a watcher with nothing wrong on theirs always watches at the share's full quality: 1080p60 within the 12 Mbps it has today. Every problem below ends as a decided fix or a decided "leave it, because". The map decides; building is the tickets' work. They land on `v1-build` before 0.1.

## Notes

**Domain.** Browser real-time media on Windows Chromium (capture, hardware encoding, Chrome's bandwidth estimate, application audio), Cloudflare's media server, and the room's single-tab experience.

**Skills.** Grilling tickets call `grilling` and `domain-modeling`. Research tickets call `research`. Prototype tickets call `prototype`, and anything visual also goes through `impeccable` against `DESIGN.md`.

**Fixed.** 12 Mbps stays the ceiling for 1080p60; no share may cost more per hour. Cloudflare's media server stays. Browser only, no desktop helper. The usage picture (1,000 GB a month) stays. Codec and encoder settings are open, as long as each share has one codec that every watcher, Firefox included, decodes.

**What counts as a failure.** A failure is in scope when a member on a supported browser with a working connection can hit it through ordinary use: two tabs, a reload, a dropped connection, choosing a tab, window or screen, cancelling the picker and trying again. A failure tied to one network, region or provider is out. If we look for problems we will find them; that does not mean all of them get fixed.

**The owner is busy.** Agents do everything they can, including verification on `graeae-test`, with `scripts/real-media/` (real Chromium members on this Linux server, software encoding, no window audio). Every build ticket this map produces says what the agent does alone and keeps what only the owner can do to the minimum. The owner's own log token (CLAUDE.md, Logs) is asked for with `request_secret` only when a ticket needs it.

**Windows.** This server (MONSTRINHO) has no GPU and cannot reach the owner's Windows desktop (MONSTRAO). Windows-only work is a ticket holding a prompt the owner pastes into an agent on MONSTRAO, `ready-for-human` until the owner says the desktop is free. That agent pulls `v1-build` from origin, drives Chrome and Helium itself on the real GPU against `graeae-test`, and pushes its findings to a branch that agents here read.

**Against 0.1.** The open 0.1 work is Owner's verification and Remaining browser checks (in `.scratch/v1/`) and ticket 32's real-media checks, all gathered into `scripts/owner-checks.sh`, which the owner has not run. Nothing here changes those checks; this map's final Windows checks are added to that wizard, and the owner runs it once, after these fixes are on `graeae-test`. Tickets 29 (two qualities) and 30 (step-down) stay after 0.1.

**No bloat.** Reliable, but no overengineering: the smallest change that removes a failure wins, and a warning is the last resort, not the first.

**Subagents.** Haiku, Sonnet or Opus 5.5 by task complexity; Fable 5.2 only when necessary.

**Vocabulary.** `GLOSSARY.md`: share, screen share, screen audio, webcam share, watch, live, stage, present, member, owner, device, usage. Never stream, broadcast or session in anything a member reads.

## Decisions so far

<!-- one line per closed ticket: gist, then the link -->

- [A better codec at 12 Mbps](issues/03-better-codec-at-12-mbps.md): H.264 high in hardware is the only candidate that fits (Firefox does decode it; the old rule came from two qualities), offered when the sharer has it in hardware with baseline as the fallback, and adopted only if the Windows run shows a gain; AV1 is software-only in Chrome on Windows and VP9 has no NVIDIA encoder.
- [Why a shared tab falls back to software encoding](issues/01-tab-share-software-encoding.md): not odd sizes (Chrome keeps every frame even); a tab's capture size changes mid-share and shrinks itself under `maintain-framerate`, each change resets the encoder and a failed reset or a height under 360 drops to software; candidate fix: `maintain-resolution` for tab shares, and a 720p step and back to retry hardware when software is named.
- [Why Chrome's upload estimate sits low](issues/02-upload-estimate-sits-low.md): with no maximum in the answer Chrome caps probes at 5 Mbps and "motion" switches off calm probing, so after a probably false fall the estimate climbs back at about 45 kbps a second; lead fix: `x-google-max-bitrate` on the video codec in the received answer, measured first for padding freezes at watchers.
- [What window audio picks up on Windows](issues/04-window-audio-on-windows.md): sharing a window of the capturing browser sends that browser's mix of every tab in every profile minus the sharing tab, so the two-profile loop (and a second graeae tab's) is expected; the watch party does not echo on Windows 11 with Chromium 146+, but a window share falls back to the whole system's sound on Windows 10 and Chromium 142 to 145.
- [Readings in the logs](issues/05-readings-in-the-logs.md): each tab's `stats` line now carries the encoder and whether it is hardware, the codec, the target bitrate, Chrome's upload estimate, key frames, resolution changes and the capture's surface and size at each reading; and on the watcher, freezes, `pli`/`fir`/`nack`, the received sound's `audioLevel` and the decoder (named only to a tab that is capturing too). On `graeae-test` as build `74cb885`. On this server the estimate already sat at 5.5 to 6.1 Mbps.

## Not yet specified

- **The fix for Chrome's low upload estimate** (fix A alone, with B, or C too), once Measure the upload estimate from this server and the Windows evidence run report.
- **Opus stereo set by rewriting the local offer**, which RFC 9429 forbids ([Why Chrome's upload estimate sits low](issues/02-upload-estimate-sits-low.md)'s aside): whether to move it to the received answer in the same hook as fix A, so screen audio does not break if Chrome stops allowing it. Likely folds into the upload-estimate build ticket.
- **Whether H.264 high is adopted**, once the Windows evidence run measures it against baseline ([A better codec at 12 Mbps](issues/03-better-codec-at-12-mbps.md) says what to measure).
- **The tab-share fix**: whether one or both parts of the candidate in [Why a shared tab falls back to software encoding](issues/01-tab-share-software-encoding.md) are built, once the Windows evidence run shows what triggers the fall to software and which part keeps or brings back hardware.
- **Where the two-profile loop is written down** (README or testing notes: test sharer and watcher in separate browsers or user-data-dirs), once the Windows evidence run confirms the mechanism [What window audio picks up on Windows](issues/04-window-audio-on-windows.md) found.
- **The final Windows check after the build**, added to `scripts/owner-checks.sh` or run by the MONSTRAO agent, and the build tickets themselves, with the spec and `DESIGN.md` changes they carry.

## Out of scope

- Two qualities for a weak watcher (v1-build ticket 29): a weak link is something wrong on the watcher's side.
- The weak-upload step-down and its note (v1-build ticket 30); its open question on Chrome's estimate is taken over by [Why Chrome's upload estimate sits low](issues/02-upload-estimate-sits-low.md).
- Failures tied to one network, region or provider.
- Any rise in bitrate.
- A desktop helper.
