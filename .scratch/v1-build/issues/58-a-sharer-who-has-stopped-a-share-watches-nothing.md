# 58: A sharer who has stopped a share watches nothing

Status: resolved

Blocked by: none

**What was seen:** in ticket 57's checks on `graeae-test` (2026-11-23, from this server, two Linux Chromium 158 members, `scripts/real-media/member.ts` with fake webcams), a sharer made 14 webcam shares in turn from one page load. After each stop, it watched the other member's one webcam share for 6 s, then stopped watching. The watches ran as follows:
- The first watch, after one share, decoded 149 frames.
- Every later watch decoded nothing. The media server put each pull in a section the tab had published on, and the tab's stats show no bitrate for it.
  - The second watch went in mid 0 (share 1's), the third in mid 2 (share 2's), and so on to mid 13.
  - This shows in `pull`'s `tracks` in `.logs/graeae-test-1795457588000-1795457956000.jsonl` (version `b93e34ff`, sharer connection `379c36…`).
  - The instance logged no failed media server calls, and the tab answered each one `recvonly`.

The same member, watching and re-watching the same share four times with no shares of its own, decoded about 215 frames each time. Each of those pulls got a section the tab had never sent on: mids 0, 1, 2 and 3, each with its own SSRC (18:20 to 18:21 UTC, read from the member's `eval` of the connection's stats).

**Why, as far as is known:**
- The media server reuses a section for a pull once the tab's own offer has marked it inactive or rejected, that is, the offer for the tab's next share after a stop.
- It reuses sections that carried a published track, and then sends nothing on them.
- It is older than 57. The old `stop` left every stopped share's transceiver inactive. 57's run 2 (version `d8269bf1`) showed that path for mid 0: the pull went in mid 0, the tab answered `inactive` (no `recvonly` in `pull` then), and every close of the pull failed (`close_track_error Track doesn't exist or was already closed`). The instance retried that close every 30 s until the tab left. Meanwhile the member's next click on the share undid the stuck watch instead of starting one.
- So "share, stop, share, stop, then watch someone" ends in a black stage, before 57 and after it.

**Not yet known:**
- whether a pull can be kept off sections the tab has published on, for example with a tab-made offer that names the mid (`tracks/new` with `location: "remote"` and a `sessionDescription`), or by closing a share as partytracks does (`tracks/close` with the tab's offer, `force: false`);
- whether the instance should treat `Track doesn't exist or was already closed` on a close as closed, rather than retrying it.

**Checking it:** `scripts/real-media/member.ts` on `graeae-test`. A sharer shares, stops, shares, stops, then watches another member. Its watch must decode (`inbound` frames in an `eval` of the connection's stats).

## Comments

### 2026-11-23: a red loop on graeae-test; the media server does send

**The loop.** `scripts/real-media/repro-58.ts` (uncommitted) runs two `member.ts` members with fake webcams, Sharer58 and Watcher58, in "First room" on `graeae-test`. Their invites were made with `pnpm as-owner` into `.owner/invites/`, and the two members are still on the instance. Watcher58 shares its webcam. For each run, the sharer reloads and does `--steps`: `share` shares and stops its webcam, and `watch` watches Watcher58's webcam for 6 s, reads its connection's stats, and stops watching. It exits 1 when a watch decodes no frames, 2 when the rig fails, and takes about 35 s a run. With `--dump <dir>` it saves each watch's stats and both descriptions.

    DISPLAY=:99 PULSE_SERVER=… node scripts/real-media/repro-58.ts --sharer .owner/invites/sharer58 \
      --watcher .owner/invites/watcher58 --steps 'share watch share watch' --runs 3

**Minimised.** `share watch share watch` was red in 7 of 7 runs. Every one-step cut was green in 2 of 2 runs, so each of the four steps is needed:

| Steps | Where the last watch went | Frames decoded |
|---|---|---|
| share share watch | mid 0 (published on) | 147, 150 |
| share watch watch | mid 0 (published on) | 156, 156 |
| watch share watch | mid 2 | 156, 156 |
| watch watch | mid 1 | 155, 156 |
| **share watch share watch** | **mid 0 (published on)** | **0** |

So the ticket's "share, stop, share, stop, then watch" is green. It goes red only when a watch came before the second share. A watch in a section the tab published on decodes in two of the cuts.

**The symptom, sharper than the ticket's.** The media server does send. On the red watch, mid 0's inbound stream counts 298 to 319 packets in 6 s, and the transport takes about 290 KiB, the same as a green watch. Chrome assembles none of it: 0 frames received, 0 key frames, no codec on the stream, and no PLI sent. Run 1's descriptions:
- The media server's offer names mid 0 `sendonly` with PT 102 (H.264 42001f) and the pull's SSRCs, and the tab answers `recvonly` with PT 102.
- The same offer still names mid 1, the first watch's pull (closed), `sendonly` with that pull's old SSRC. The tab still answers `recvonly` there, and the stream's stats live on with 0 new packets.
- Mid 2, the second share (stopped), is `recvonly` in the offer and `inactive` in the answer, not rejected.

### 2026-11-23: the cause: the media server sends the pull on a payload type the section never negotiated

**Hypotheses tested** on the loop above (`share watch share watch`). Each change was made in the sharer's page with `--before <step>=<js>`, and Chrome's own logs were read with `--sharer-arg`.

| Hypothesis | Test | Verdict |
|---|---|---|
| The receiver has no codecs | `receiver.getParameters().codecs` on mid 0 during the watch | Out: `102 H264`, `103 rtx` |
| Mid 0's leftover sender gets in the way | The passing `share watch watch` has the same leftover | Out |
| The closed watch's section, still `recvonly` in the tab's offer | Made `inactive` before the second share | Out: red 2 of 2 |
| The second share's transceiver, stopped but not rejected | `stop()` replaced by `inactive` | Out: red 2 of 2 |
| **The packets carry a payload type mid 0 does not know** | Chrome's RTC event log (`--webrtc-event-logging=<dir>`, read with `protoc --decode_raw`) | **Confirmed** |

**What happens.**
- **Chrome's side.** Mid 0's `VideoReceiveStream2` is built for PT 102 alone (H.264 42001f), and it never logs a first packet. In WebRTC's `RtpVideoStreamReceiver2::ReceivePacket`, a packet whose payload type is not in the map is dropped silently, after `getStats` has counted it. That is the 300 packets with 0 frames and no codec.
- **The packets.** The event log has the media server sending the first watch (SSRC 698403757) on **PT 102**, and the second (SSRC 2747656468) on **PT 108**. That is H.264 42e01f, which is negotiated only in mid 1.
- **Why 108 exists.** The second share's offer is the tab's own, and it carries mid 1, the first watch's transceiver, still `recvonly`, with Chrome's **full** codec list: 102 103 96 97 98 99 108 109 45 46. `setCodecPreferences` is called only on the transceivers the tab sends on. From then on the media server has 108 for H.264 in this session. Its offer for the second pull reuses mid 0, whose m-line still lists only 102 and 103, and it sends on 108.

**Why the cuts are green.**
- `share watch watch`: no offer from the tab after the first watch, so 108 is never negotiated.
- `share share watch`: no receive-only transceiver is in any offer.
- `watch share watch`: the second pull gets a new section, and its codec list includes 108.

**The check.** Before the second share, the closed watch's transceiver had `setCodecPreferences` set to H.264 42001f plus rtx. The second watch then decoded 155, 156 and 150 frames in 3 of 3 runs, in mid 0. The same step that only made it `inactive`, with no codec change, stayed red.

**Fix, not yet made.**
- Before each offer the tab makes (a share, or a restart), set every transceiver it does not send on to the codecs its section negotiated, rather than Chrome's full list. Each section's payload types then stay the same from one negotiation to the next.
- Narrowing to 42001f alone would not do. A pull of a screen share in H.264 high (ticket 54) needs its own profile.
- `docs/media-server.md`'s line "A watch in a section the tab once published on gets no media" is wrong. The true behaviour: the media server sends a pull on the payload type its session last saw for the codec, in any section, and not necessarily one the pull's own section negotiated.

The ticket's other open question is unchanged: whether `Track doesn't exist or was already closed` on a close means closed.

### 2026-11-23: fixed in the client; the check on graeae-test is still to run

**The fix.** Before each offer the tab makes, a share's or a restart's, `browser.ts` (`keepReceivingCodecs`) sets each negotiated transceiver it does not send on to the codecs its section negotiated. It reads them from `receiver.getParameters().codecs` and passes them through the pure rule `src/app/lib/media/receiving.ts`.
- A section that negotiated H.264 high keeps it.
- A section that negotiated nothing the browser lists is left alone.
- So does a browser that refuses the list.

**Checks**, all green with the fix (`pnpm test`: 491 Vitest tests, 67 Playwright journeys):
- **The loopback's stand-in now plays the media server's codecs.**
  - A new section's offer lists only the payload type the watch goes out on, plus its retransmissions.
  - A reused section's offer lists what the tab's last offer gave it.
  - The watch goes out on 42e01f's payload type when the tab's last offer listed one in any section, and on a baseline H.264's otherwise.
- **Two new loopback checks**, each red without its part of the fix:
  - share, watch, unwatch, share, watch;
  - share, watch, unwatch, an answered restart, watch.
- **In the red run, the stand-in sent the second watch on 108 in mid 0, whose answer listed only 102 and 103.** That matches the event log on graeae-test. Its sender encoded 83 frames, and the tab decoded none.
- `test/receiving.test.ts` checks the rule against the codec lists recorded on graeae-test.

**`docs/media-server.md`** now drops the wrong line and records the two behaviours. Neither was seen beyond the tab's last offer.

**Still to run on graeae-test**, after a deploy of this commit. Each needs a real browser and Cloudflare:
1. `repro-58.ts --steps 'share watch share watch' --runs 3` must exit 0. The ticket's own run, 14 shares each followed by a watch, should decode every watch.
2. Unchecked, and not new with this fix: a screen share in H.264 high, watched in a reused section that lists only baseline. This happens after the tab has watched a webcam, or after its own webcam share. It is likely to drop the same way. To check it, a sharer with a hardware H.264-high encoder (MONSTRAO) shares its screen while a member that has just watched a webcam watches it. If it fails, file it as its own ticket.

The members Sharer58 and Watcher58 and their invite files in `.owner/invites/` stay on graeae-test for check 1. Remove them afterwards with `pnpm as-owner remove`.

### 2026-11-23: checked on graeae-test; resolved

Deployed `034d09b` to `graeae-test` as version `aaff375f`.
- **`repro-58.ts --steps 'share watch share watch' --runs 3`: green in 3 of 3 runs, exit 0.** Before the fix it was red in 7 of 7. In each run the second watch went in mid 0 (published on) and decoded 156, 157 and 151 frames.
- **The ticket's own run, 14 shares each followed by a watch, in one run: every watch decoded, 146 to 156 frames.** The watches went in mids 1, 0, then 2 to 13. Before, every watch after the first decoded nothing.

The H.264-high case (check 2 above) needs MONSTRAO, and is ticket 59. Sharer58 and Watcher58 have been removed from `graeae-test`.
