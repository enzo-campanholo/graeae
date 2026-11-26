# The media server, as it behaves

What Cloudflare's Realtime SFU does with a tab's media connections beyond what its docs
say, seen on `graeae-test` with `pnpm real-media` and read back with `pnpm logs`. The
calls themselves are listed in `src/instance/media/cloudflare.ts`. What Chrome does with
the same connections is in `src/app/lib/media/stopping.ts` (stopping a transceiver) and
`browser.ts` (the rest).

A tab sends on one connection and receives on another (ADR 0005, ticket 61). The tab
offers only on its sending connection, where nothing is watched; on the receiving
connection every section is the media server's own, and the tab only answers. So the
section behaviours below, how sections are reused and which codecs they list, matter
now only on the sending connection, where the tab's own offers narrow them and no watch
lands in them. They are kept as they were seen, since they are why the connections were
split. The rebuilt transport (57) and the failed close still matter on both.

Each behaviour names where it was seen and whether the loopback's stand-in media server
(`test/loopback/page/media-server.ts`, run by `pnpm test`) plays it. A change to how
`browser.ts` negotiates is read against this list. When it relies on a behaviour the
stand-in does not play, a real-media run on `graeae-test` checks it.

## Sections

Seen on the one connection a tab had before ticket 61, where shares and watches shared
sections.

- **A watch goes in a closed section.** A pull's offer puts the track in a section the
  tab's own last offer marked inactive or rejected, the lowest mid first, and adds a new
  section only when there is none. Such a section belonged to a stopped share or an
  ended watch. *Ticket 57, run 3: the pulls went in mids 0, 2, 3 … 13 in turn.* On the
  receiving connection that leaves an ended watch's section, which nothing renegotiates
  before the next pull, and there the media server does not reuse it: a later watch gets
  a new section. *Ticket 61, on `graeae-test` (`b5219829`): in `repro-59.ts`
  (`cam share share cam`, three runs) and `repro-58.ts` (`share watch share watch`)
  the first watch went in mid 0 and the second, after the first ended, in a new mid 1.*
  The stand-in still reuses an ended watch's section, the harder case; the tab answers
  either.
- **Chrome answered inactive for that section** unless its transceiver was set to
  receive first, and then nothing arrived. *Ticket 57, run 2.* That was a section the
  tab had made for a share. On the receiving connection every transceiver is made by
  the media server's offer and stays `recvonly`, so `pull` no longer sets it: the
  loopback's reused section is answered `recvonly` and decodes.
- **A watch's offer lists the codecs the tab last gave its section.** A new section
  lists only the codec the watch goes out in, with its retransmissions. A reused one
  lists what the tab's own last offer listed there, whatever the watch goes out in.
  *Ticket 58: a new section offered 102 and 103 alone, and a reused one the tab's own
  ten (`repro-58.ts`, the red runs).* With no tab offer on the receiving connection,
  this no longer reaches a watch. The stand-in no longer plays it.
- **A watch goes out on a payload type the tab offered for its codec**, in any section,
  and so maybe one its own section never listed. For H.264 baseline it takes 42e01f's
  over 42001f's. Chrome counts those packets, then drops them all, so the watch shows
  nothing: no frames and no codec, and the tab sends no PLI. *Ticket 58: a webcam sent
  in 42001f, as the encoding plan has it, went out on 102 (42001f) until the tab's offer
  listed 108 (42e01f) in an ended watch's section, and then on 108 in a section that
  knew only 102 (`repro-58.ts`, run 1, in Chrome's RTC event log).* Seen from the tab's
  last offer; whether the session remembers what an earlier offer listed is not known.
  The tab's offers are now on another connection than its watches, so it rests on
  nothing; `receiving.ts`, which narrowed each section before an offer, is gone.
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
  *Ticket 59: every first watch after a reload (`repro-59.ts`).* With the tab's codec
  handling, its later offers then listed 42e01f, and by the rule above a later watch in
  a section that knew only 42001f decoded nothing (ticket 60). On the receiving
  connection every watch is such a section, and the later ones go out as the first does.
  *Ticket 61, on `graeae-test`: each watch, first or later, in a new section listing
  H.264 42e01f at 125, VP9, VP8 and AV1 with their retransmissions, sent on 125 and
  decoded (`repro-59.ts` and `repro-58.ts`).* The stand-in offers Chrome's own list.

## The transport

- **A rebuilt transport is never connected.** When the tab's offer rejects the BUNDLE
  tag's section, Chrome moves the connection to a new transport with a new ICE ufrag.
  The media server never connects it, and the next `tracks/new` answers `410 Session
  appears to be disconnected`. *Ticket 57, run 1.* In the stand-in the new transport
  connects. The loopback checks for it instead as one ufrag on each connection, through
  every description but those of a restart, which is an ICE restart.
- **410 means the session is gone.** Once a session is disconnected, every call on it
  answers 410. `cloudflare.ts` treats a 410 on close and on listing tracks as nothing
  left open.
- **A session no browser joins is dropped within seconds.** A receiving connection's
  browser joins it only by answering a pull's offer. A replacement made while the tab
  watched nothing got no offer, and a pull into it 3 s after it was made went through,
  while one 15, 20 or 23 s after answered `410 Session appears to be disconnected`,
  about 5 s after it was asked. A session the browser joined and that then carried
  nothing for 30 s, 2, 5 or 10 minutes took its next pull as ever. So the instance lets
  go of a replacement that carried nothing (`instance.ts`, `replaceStep`), as it did a
  connection whose first share or watch failed. *Ticket 66,
  `scripts/real-media/repro-66.ts`.* The stand-in never drops a session; the fake media
  server of Seam 1 plays it when a test calls `disconnectUnjoined`.

## Closing

- **Closing a track that never got going fails.** `tracks/close` on a pull the tab
  answered `inactive` reports `close_track_error Track doesn't exist or was already
  closed`. The session's track list still names it, so the instance retries the close
  every 30 s until the tab leaves. *Ticket 57, run 2; ticket 58.* The stand-in has no
  calls to fail.
- **A pull's offer must be answered before the session takes another pull.** Until the
  browser's answer to it reaches the media server, the next `tracks/new` pulling into
  that session answers `406 The current signaling state is expecting a remote answer:
  renegotiation is expected`. Closing the pulled track does not change that: the
  replacement's pull of a share a hand-over had just ended was force-closed (the close
  went through) without its offer reaching the tab, and 5 s later the hand-over's pull of
  the new share into the same session answered 406. So a replacement's pull of a share
  that went meanwhile still goes to the tab as a step, and is closed once answered
  (`shares.ts`, `replaceNext`). *Ticket 67, `scripts/real-media/repro-67.ts`.* The
  stand-in takes any pull; the fake media server of Seam 1 plays the 406 when a test
  calls `oneOfferAtATime`.
- **Not seen yet: closing a pull whose offer was never answered, on a session let go
  of.** A hand-over's `moved` that reaches a tab just as its receiving connection is
  replaced is left unanswered (ticket 62): the replacement pulls the new share onto the
  new connection instead, and closes the old connection's pull of it with the rest. That
  session takes no pull again, so the 406 above cannot follow. If the close fails as
  above, it is retried on its backoff, and the old connection's record stays until a
  sweep shows the track gone or the tab leaves. The stand-in never closes a track, so a
  real-media run is the only check.

## Failures seen once

- **503 "Transport is temporarily unavailable"** on a publish and on the close of it 5 s
  later, then not again. *Ticket 57, run 2.*
