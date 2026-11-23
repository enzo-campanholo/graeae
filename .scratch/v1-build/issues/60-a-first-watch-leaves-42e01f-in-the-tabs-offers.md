# 60: A first watch leaves 42e01f in the tab's offers, and a later watch in a stopped share's section shows nothing

**Status:** needs-triage

**Blocked by:** none

**What was seen:** in ticket 59's checks on `graeae-test` (2026-11-23, version `aaff375f`, built from `034d09b` with 58's fix), three Linux Chromium 158 members ran in "First room" with `scripts/real-media/repro-59.ts`. Watcher59 reloaded, then:
1. watched Cam59's webcam and stopped watching;
2. shared its own webcam and stopped it, twice;
3. watched again.

The second watch decoded nothing, in 4 of 4 runs. It did not matter whether that watch was Cam59's webcam or Screen59's screen:

| Steps | First watch | Last watch's mid | It knew | Arrived as | Frames |
|---|---|---|---|---|---|
| cam share share screen | mid 0, 125 42e01f, 119 and 135 frames | 1 (the first share's) | 102 42001f, 103 rtx | no codec, 3,541 and 3,596 packets | 0, 0 |
| cam share share cam | mid 0, 125 42e01f, 115 and 128 frames | 1 (the first share's) | 102 42001f, 103 rtx | no codec, 316 and 315 packets | 0, 0 |

Every other order tried was green: `share share screen`, `share cam share screen` and `screen cam share screen`. In a room, this is a member who watches someone, shares their webcam, stops, shares again, and then watches someone else, all without a reload.

**Why, as far as is known.** This is 58's mechanism, but the extra payload type comes from the media server, not from Chrome:
- **The first watch's section is the media server's own.** It comes before the tab has made any offer, so the media server makes a new section with its own codec list: H.264 `42e01f` at 125, VP9 98, VP8 96, H.265 116 and AV1 45, each with retransmissions. The tab answers with all of them except H.265, and the watch goes out on 125.
- **The tab's later offers keep 125.** 58's fix (`receiving.ts`) sets the ended watch's transceiver to what its section negotiated, so mid 0 keeps offering `125 42e01f`. Each share offers `102 42001f` alone, as the encoding plan has it.
- **The second share's offer rejects mid 1**, the first share's section (`stopping.ts`: not the BUNDLE tag's, so stopped). The media server reuses mid 1 for the next watch, and lists in it what the tab's last offer listed there: `102`, `103`.
- **The watch goes out on 125.** By `docs/media-server.md`, the media server sends H.264 on 42e01f's payload type whenever the tab's last offer lists one, in any section. Chrome counts the packets on mid 1, finds no codec for them, and drops them all. That is the signature in the table.

The descriptions of a red run are in the loop's `--dump` files: mid 0 `recvonly 125 42e01f …`, mid 1 `recvonly 102 42001f`, mid 2 `inactive 102 42001f`.

**Not yet known:**
- Chrome's RTC event log has not been read. That the packets carry 125 is inferred from the rule and the signature; ticket 58 confirmed both that way. To read it, add `--chromium-arg=--webrtc-event-logging=<dir>` to the watcher.
- Whether the media server moves a live watch to another payload type when the tab's next offer drops the one it goes out on. That decides whether the tab could stop offering 42e01f in a section the media server made.

**Ways out, none tried:**
- **A section the media server made offers 42001f, not 42e01f, in the tab's own offers, once its watch has ended.** The tab's offers then list no 42e01f, and every watch goes out on 102. A live watch on 125 would still pull a later watch onto 125, unless the media server moves it (the second unknown above).
- **The tab makes an offer before its first watch**, so the session never gets 125. Not possible as it stands, since the media server takes no offer without a track.
- **A share offers 42e01f too.** Ruled out: given both profiles, the media server publishes in 42e01f (ticket 17), which Chrome on Windows encodes only in software.

**The stand-in does not play it.** With no offer from the tab, `test/loopback/page/media-server.ts` offers Chrome's own list, not the media server's five codecs. A loopback check for this needs that first, and it should be red before any fix.

**Checking it:** `repro-59.ts --steps 'cam share share cam' --runs 3` on `graeae-test` must exit 0. Cam59, Screen59 and Watcher59 were removed after ticket 59. To run it again:

    nix-shell --run 'for n in Cam59 Screen59 Watcher59; do pnpm as-owner invite $n .owner/invites/$(echo $n | tr A-Z a-z) 4zgfjn653p; done'
    scripts/real-media/desktop.sh start
    DISPLAY=:99 PULSE_SERVER=… nix-shell --run 'node scripts/real-media/repro-59.ts --cam .owner/invites/cam59 \
      --screen .owner/invites/screen59 --watcher .owner/invites/watcher59 \
      --clip ~/.cache/graeae-real-media/clips/high-1080p60.h264 --steps "cam share share cam" --runs 3'

Remove the members afterwards with `pnpm as-owner remove <name>`.
