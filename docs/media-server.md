# The media server, as it behaves

What Cloudflare's Realtime SFU does with a tab's media connection beyond what its docs say,
seen on `graeae-test` with `pnpm real-media` and read back with `pnpm logs`. The calls
themselves are listed in `src/instance/media/cloudflare.ts`. What Chrome does with the
same connection is in `src/app/lib/media/stopping.ts` (stopping a transceiver),
`receiving.ts` (the codecs a transceiver it does not send on offers) and `browser.ts`
(the rest).

Each behaviour names where it was seen and whether the loopback's stand-in media server
(`test/loopback/page/media-server.ts`, run by `pnpm test`) plays it. A change to how
`browser.ts` negotiates is read against this list. When it relies on a behaviour the
stand-in does not play, a real-media run on `graeae-test` checks it.

## Sections

- **A watch goes in a closed section.** A pull's offer puts the track in a section the
  tab's own last offer marked inactive or rejected, the lowest mid first, and adds a new
  section only when there is none. Such a section belonged to a stopped share or an
  ended watch. *Ticket 57, run 3: the pulls went in mids 0, 2, 3 … 13 in turn.* The
  stand-in plays it for inactive sections.
- **Chrome answers inactive for that section** unless its transceiver is set to receive
  first, and then nothing arrives. `pull` sets it to `recvonly`. *Ticket 57, run 2.*
  The stand-in plays it: a plain Chrome peer.
- **A watch's offer lists the codecs the tab last gave its section.** A new section
  lists only the codec the watch goes out in, with its retransmissions. A reused one
  lists what the tab's own last offer listed there, whatever the watch goes out in.
  *Ticket 58: a new section offered 102 and 103 alone, and a reused one the tab's own
  ten (`repro-58.ts`, the red runs).* The stand-in plays it.
- **A watch goes out on a payload type the tab offered for its codec**, in any section,
  and so maybe one its own section never listed. For H.264 baseline it takes 42e01f's
  over 42001f's. Chrome counts those packets, then drops them all, so the watch shows
  nothing: no frames and no codec, and the tab sends no PLI. *Ticket 58: a webcam sent
  in 42001f, as the encoding plan has it, went out on 102 (42001f) until the tab's offer
  listed 108 (42e01f) in an ended watch's section, and then on 108 in a section that
  knew only 102 (`repro-58.ts`, run 1, in Chrome's RTC event log).* Seen from the tab's
  last offer; whether the session remembers what an earlier offer listed is not known.
  So `browser.ts` sets each transceiver it does not send on to the codecs its section
  negotiated (`receiving.ts`) before each offer it makes, as its section stands when
  the tab makes no offer. The stand-in plays it for H.264 baseline, the codec of every
  watch there.
- **H.264's profile does not count.** A share published as H.264 high goes out on the
  same payload type as baseline would, by the rule above, and Chrome decodes it there.
  *Ticket 59: a share offered as 64001f, sending an x264 high clip, was watched in a
  reused section that knew only 102 (42001f); it went out on 102 and decoded at
  1920x1080 (`repro-59.ts`, `share share screen` and `share cam share screen`, two runs
  of each). Ticket 55: a fresh watcher's section labelled a high share 42e01f.* The
  stand-in sends baseline only.
- **A session's first section lists the media server's own codecs.** A watch made
  before the tab has made any offer of its own gets a new section with H.264 42e01f at
  125, VP9, VP8, H.265 and AV1, each with its retransmissions, and goes out on 125.
  *Ticket 59: every first watch after a reload (`repro-59.ts`).* So once `receiving.ts`
  keeps that section's codecs, the tab's later offers list 42e01f, and by the rule above
  a later watch in a section that knows only 42001f decodes nothing (ticket 60). The
  stand-in does not play it: with no offer of the tab's, it offers Chrome's own list.

## The transport

- **A rebuilt transport is never connected.** When the tab's offer rejects the BUNDLE
  tag's section, Chrome moves the connection to a new transport with a new ICE ufrag.
  The media server never connects it, and the next `tracks/new` answers `410 Session
  appears to be disconnected`. *Ticket 57, run 1.* In the stand-in the new transport
  connects. The loopback checks for it as one ufrag through every description instead.
- **410 means the session is gone.** Once a session is disconnected, every call on it
  answers 410. `cloudflare.ts` treats a 410 on close and on listing tracks as nothing
  left open.

## Closing

- **Closing a track that never got going fails.** `tracks/close` on a pull the tab
  answered `inactive` reports `close_track_error Track doesn't exist or was already
  closed`. The session's track list still names it, so the instance retries the close
  every 30 s until the tab leaves. *Ticket 57, run 2; ticket 58.* The stand-in has no
  calls to fail.

## Failures seen once

- **503 "Transport is temporarily unavailable"** on a publish and on the close of it 5 s
  later, then not again. *Ticket 57, run 2.*
