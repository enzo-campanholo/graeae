# The media server, as it behaves

What Cloudflare's Realtime SFU does with a tab's media connection beyond what its docs say,
seen on `graeae-test` with `pnpm real-media` and read back with `pnpm logs`. The calls
themselves are listed in `src/instance/media/cloudflare.ts`. What Chrome does with the
same connection is in `src/app/lib/media/stopping.ts` (stopping a transceiver) and
`browser.ts` (the rest).

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
- **A watch in a section the tab once published on gets no media**, though every call
  succeeds and the tab answers `recvonly`. *Ticket 58, open.* The stand-in does not
  play it: there, the watch arrives.

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
