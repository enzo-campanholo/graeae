# Starting again after a reload

Type: grilling
Status: open
Blocked by: none
Map: ../map.md

## Question

[Two tabs, and share starts run many times over](06-two-tabs-and-share-starts.md) found two bugs that chain together. Its answer gives the lines and the places in the code.

1. **A start in the first 10 s after a reload is refused.** For about 10.5 s after a reload, or a closed tab, with a share live, the page sees its own old share as live elsewhere, and a hand-over of it is refused as `not replaceable now`. The cut-off tells the room only after two media-server calls, each about 5.3 s on a connection whose peer has gone.
2. **A refused first start leaves the tab unable to share until it reloads.** If a tab's first start is refused, its new media connection never gets a peer, the media server drops it within 11 to 20 s, and every later start from that page fails with a 410.

Which fixes, each the smallest that removes its failure (the map's Notes: no bloat)? Candidates to weigh, not decided:

- For 1:
  - tell the room a share has ended before the media-server calls, not after;
  - or let a hand-over replace a share that is ending;
  - or let the page treat a share from its own device's previous page as its own, so there is no offer at all;
  - and whether to shorten the 5 s calls, say with a timeout, since the peer is known to be gone.
- For 2:
  - make a new media connection after a refusal when the old one never carried anything;
  - or ask for the connection only once the instance has accepted the start;
  - or have the instance recognise a dropped session and make a new one.

Settle what the agent checks on `graeae-test` with `scripts/real-media/` (the reload and retry sequences in ticket 06 reproduce both), and write the build ticket or tickets.
