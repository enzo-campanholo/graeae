# 59: A screen share in H.264 high, watched in a reused section that lists only baseline

Status: resolved

Blocked by: none

**What is suspected:** ticket 58 found that the media server sends a watch on a payload type the tab offered for its codec, in any section, even one the watch's own section never listed. Chrome then counts the packets and drops them all, so the watch shows nothing. A reused section lists only what the tab last gave it. After the tab has watched a webcam, or made its own webcam share, that is baseline H.264 alone (102, and 103 for retransmissions).

When such a tab next watches a screen share sent in H.264 high (ticket 54, on a hardware encoder), the media server may put it in that section. It would then go out on a high payload type the section lacks, and decode nothing. This was so before 58's fix, and is likely still so: the fix keeps each section's own codecs, and adds none. `docs/media-server.md` lists it as unchecked. The loopback's stand-in cannot play it, because the stand-in sends baseline only.

**Checking it:** on `graeae-test`, two members.
1. Member W watches a webcam share and stops watching, so W has a closed baseline section.
2. On MONSTRAO, member S shares a screen whose sender's stats read `H264 64001f` on `D3D12VideoEncodeAccelerator` (as in ticket 55).
3. W watches it. Note which mid the watch's `pull` went in, and whether `inbound-rtp` decodes frames there (`pnpm real-media`'s `eval`). If it does not, Chrome's RTC event log (`--webrtc-event-logging=<dir>`) gives the payload type the packets carry, as in ticket 58.

**If it drops:** a section that receives could offer, besides what it negotiated, the screen-share codecs the encoding plan sends (H.264 high and baseline), at the payload types the tab uses for them elsewhere. That keeps the payload types stable and gives the media server a high one in every section. It is a change to `receiving.ts`, checked against `docs/media-server.md`.

## Comments

### 2026-11-23: checked from this server; it does not drop

**The rig, with no MONSTRAO.** Linux Chromium 158 lists no H.264 high to send, only `42001f`, `42e01f` and `4d001f`, so `--codec H264:6400` falls back to baseline. Two options of ticket 54's rig make a high share here:
- `--fake-h264` sends an x264 high clip (1920x1080, 60 fps) in place of the encoder's frames.
- A new option, `--fake-h264-as 64001f`, relabels the share's baseline as `64001f` in every offer the page sends, and maps the answer back for the browser. The media server's answer named `64001f`, so it took the share for high.

The bitstream is high and the description says high, as from Chrome on Windows. The one difference is the publish's own payload type, 102 here, which the media server does not pass on to watchers.

**The loop:** `scripts/real-media/repro-59.ts`. Its member driver is now shared with `repro-58.ts` in `scripts/real-media/driver.ts`. It runs three `member.ts` members in "First room" on `graeae-test` (version `aaff375f`, built from `034d09b`, 58's fix):
- Cam59 shares its webcam.
- Screen59 shares a game window, faked as high.
- Watcher59 reloads, then does the steps. `share` shares its webcam and stops it. `cam` and `screen` watch for 6 s and stop.

Each watch prints the mid it went in, the codecs that section knows, the codec the packets arrived in, and the frames decoded.

    DISPLAY=:99 PULSE_SERVER=… nix-shell --run 'node scripts/real-media/repro-59.ts --cam .owner/invites/cam59 \
      --screen .owner/invites/screen59 --watcher .owner/invites/watcher59 \
      --clip ~/.cache/graeae-real-media/clips/high-1080p60.h264 --steps "share share screen" --runs 2'

**The steps differ from the ticket's.** The ticket expected a watch of a webcam to leave W a section with baseline alone. That is wrong for a first watch. Before the tab's first offer, the media server makes the section from its own list: `125 42e01f`, VP9, VP8, H.265 and AV1. An ended watch's section also stays `recvonly` in the tab's offers, so it is never reused. The sections that know only `102 42001f` and get reused are the watcher's own stopped shares'. So the runs reach one through `share` steps.

**The ticket's case is green.** The last watch went in mid 0, the first share's section, which knew only `102 42001f` and `103 rtx`:

| Steps | Last watch's mid | It knew | Arrived as | Frames |
|---|---|---|---|---|
| share share screen | 0 (published on) | 102 42001f, 103 rtx | 102 42001f, 1920x1080 | 179, 179 |
| share cam share screen | 0 (published on) | 102 42001f, 103 rtx | 102 42001f, 1920x1080 | 183, 190 |

The 1920x1080 frames are the clip's size, not the window's, so the high clip is what decoded.

**The media server rewrites payload types, so 102 on both sides is not a pass by luck.** Here the share was published on 102, the same number as the reused section's. Two readings show the media server does not forward by number:
- The same 102-published share went to a fresh watcher on `125 42e01f` (the first `screen` watch of `screen cam share screen`: 99 frames at 1920x1080).
- Watches in the red orders below went out on a payload type other than 102.

It chooses by codec, and a `64001f` share went out on `42001f`'s type. Chrome on Windows would publish high on a payload type of its own. That would change only what the media server receives, not what it chooses to send.

**Why it cannot drop as suspected.** The media server does not tell H.264 profiles apart. It sends a high share on the same payload type it would use for baseline: here 102, and 42e01f's 125 to a fresh watcher, as in ticket 55's check 4. Chrome decodes high from the stream's own headers under either label. So the fix under "If it drops" is not needed, and `receiving.ts` is unchanged. `docs/media-server.md` now records this.

**Found on the way, and red: ticket 60.** In a fresh session, a watch made before the tab's first offer gets the media server's own section, whose only H.264 is `42e01f` at 125. 58's fix keeps that list in the tab's later offers. A later watch placed in a stopped share's section, which knows only `102 42001f`, then decodes nothing. This happens with a webcam watch as well as a screen watch, so it is not about high:

| Steps | Last watch's mid | It knew | Arrived as | Frames |
|---|---|---|---|---|
| cam share share screen | 1 (published on) | 102 42001f, 103 rtx | no codec, 3,541 and 3,596 packets | 0, 0 |
| cam share share cam | 1 (published on) | 102 42001f, 103 rtx | no codec, 316 and 315 packets | 0, 0 |

It is filed as [60](60-a-first-watch-leaves-42e01f-in-the-tabs-offers.md) with the loop and the descriptions.

MONSTRAO was not run. A run there would add only a hardware encoder's bitstream and Chrome on Windows' own publish payload type. Ticket 55's check 4 already shows the first decoding under a baseline label. The reading above shows the second does not reach the watcher.

Resolved. Cam59, Screen59 and Watcher59 were removed from `graeae-test` (see 60 for making them again).
