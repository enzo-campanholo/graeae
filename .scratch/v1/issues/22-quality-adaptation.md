# Quality adaptation

Type: grilling
Status: resolved
Blocked by: 13
Map: ../map.md

## Question

What does graeae ask of the browser when sharing, and what does a viewer on a weak link get?

[Quality proof](13-quality-proof.md) fixed the facts this decides on: hardware H.264 needs main or high profile; capture follows the monitor (48 fps at 144 Hz, 60 at 120 Hz, over 120 on some machines) so the sender must be capped at 60; Cloudflare passes 12 and 20 Mbps untouched; a Firefox sharer manages 720p at 29 fps in H.264 or 1080p at 33 fps in VP9; one viewer's lossy downlink caused freezes and a drop to 720p with nothing wrong at the sender.

Decide:

- The bitrate target and cap for a screen share and for a webcam share, checked against the 20 Mbps upload floor and the usage budget.
- The codec and profile a Chromium sharer offers, and which a Firefox sharer uses.
- The capture frame rate asked for, the sender cap, and what a sharer on a 144 Hz monitor is told.
- Whether a share is sent at more than one quality so a weak viewer does not drag down or stall, or whether every viewer gets the one stream.
- When a share falls to the 720p60 floor, and whether resolution or frame rate gives way first.

## Answer

Decided with the owner on 2026-11-16. All numbers are fixed; neither the sharer nor the owner gets a setting.

**Chromium screen share**

- **Two qualities.** 1080p at 60 fps capped at 12 Mbps, and 720p at 60 fps capped at 4 Mbps. A monitor larger than 1080p is scaled down to 1080p.
- **Codec.** H.264 high profile, then main, so the hardware encoder is used. A software codec is offered last so a share always starts; which one is left to the build. A sharer whose share is software encoded gets a quiet note saying so.
- **Frame rate.** The capture is asked for 120 fps and the sender is capped at 60.
- **144 Hz monitors.** graeae detects a capture that settles near 48 fps and shows the sharer a dismissible note on their own share ("Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60"). Nothing is shown before sharing and nothing is blocked. The note stops appearing once Chrome's fix ships, because it is driven by the measured rate.

**Firefox screen share**

- One stream: VP9 at 1080p, capped at 30 fps and 6 Mbps. No quality is promised. Firefox cannot send VP9 at two qualities.

**Webcam share**

- One stream: 720p at 30 fps capped at 1.5 Mbps, with the same codec rule as a Chromium screen share.

**A viewer on a weak link**

- Gets the 720p60 quality alone; other viewers keep 1080p. The media server steps the viewer down automatically.
- Each watched screen share has a choice of "Auto", "1080p" or "720p", defaulting to Auto. The manual choice is for a machine that struggles to decode several screens, for spending less usage, and as a way out if the automatic choice proves poor.
- A share received at the lower quality carries a small "720p" mark.
- Firefox screen shares and webcam shares are single streams, so a weak viewer can pull those down for everyone. Accepted.

**A sharer on a weak upload**

- Resolution gives way first: the 1080p quality stops and every viewer gets 720p60. If 720p60 does not fit, frame rate drops to 30. Below 720p30 the browser degrades as it sees fit.
- graeae never ends a share for quality reasons.
- The sharer gets a dismissible note on their own share when their upload cannot carry 1080p.
- The browser has no setting for a resolution floor, so graeae watches the share and steps it down itself.

**Checked against the budgets**

- Upload: 12 + 4 + 1.5 = 17.5 Mbps for a screen and a webcam, inside the 20 Mbps floor.
- Usage: 12 Mbps replaces the 8 Mbps earlier estimates assumed. At the owner's estimate (30 hours, 1 screen and 1 webcam, 3 viewers each) that is about 547 GB a month, 55% of the free 1,000 GB, up from 385. Watching at 720p uses less.
- The "maximum bitrate" that [Usage budget](14-usage-budget.md) charges for unreported watch time is now 12 Mbps for a Chromium screen share, 6 for a Firefox one and 1.5 for a webcam.

**Still to prove**

- Whether Chrome on Windows keeps both qualities on the hardware encoder with the game unaffected is unconfirmed. The owner checks it alone; the check is added to [Remaining browser checks](21-remaining-browser-checks.md).
- If it fails, every Chromium screen share is one 1080p60 stream at 12 Mbps. The quality choice and the "720p" mark go away, and a weak viewer can pull a share down for everyone.

**Facts this rests on** (research on 2026-11-16, from Cloudflare's documentation and the Chromium source; not measured)

- Cloudflare's media server takes a share at several qualities. Each viewer names a preferred one, can change it mid-watch with one call, and can be stepped down by the server when bandwidth is short. How the server judges that is undocumented.
- How the media server treats a weak viewer of a single stream is undocumented. In Quality proof one lossy downlink pushed a share to 720p with no loss at the sender.
- Chrome has no spatial scalable coding for H.264, so two qualities means two encodes.
- Bitrate, frame rate and scale can be changed on a live share without renegotiating.

**Correction made along the way.** The friend's machine in Quality proof has an RTX 5060 Ti, not a GTX 980. Hardware H.264 is therefore proven on recent cards only, and Firefox's 30 fps is not a weak-machine result. Recorded on that ticket.
