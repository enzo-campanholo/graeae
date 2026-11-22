# Starting again after a reload

Type: grilling
Status: resolved
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

Settle what the agent checks on `graeae-test` with `scripts/real-media/` (the reload and retry sequences in ticket 06 reproduce both), and write the build ticket or tickets. [What two tabs on one device do](08-two-tabs-on-one-device.md) asks that the build ticket's tests also cover failure 1 from two tabs of one member: one tab with a share live closes or reloads, and the other starts a share within 10 s.

## Answer

Decided with the owner on 2026-11-22. Build ticket: [Starting again after a reload](../../v1-build/issues/51-starting-again-after-a-reload.md) (v1-build 51, `ready-for-agent`, nothing for the owner).

**What the code and the run's log showed.**
- On a reload the socket closes cleanly, so the cut-off starts at once. It then waits on the close and on the sweep's tracks call. Both succeed (`ok: true`) after 5.0 to 5.4 s each, every time in the run, and the room hears only after the sweep.
- `Shares.start` refuses a hand-over of a share in `ending`.
- For failure 2, the instance answers a second `connect` from a tab that has a connection on record with `"already"`, so the tab cannot make a new connection on its own. The `dropped` path, which makes the tab rebuild, exists already; refusals never used it.

**Failure 1: a share stops counting the moment its end begins.** This holds for every end, not only a leave.
- The room hears that the share ended when its close begins.
- From then on it is not listed, cannot be watched, and is not in the way of a new share of its kind.
- Its record stays until its close returns, and a failed close keeps its retries and the owner's warning.
- A member who reloads, or closes one of two tabs, starts again with no "already live" offer.
- Rejected:
  - a hand-over that may replace an ending share: it still offers "already live" to a member who just reloaded;
  - telling the room after the share's own close but before the sweep: it still leaves about 5 s;
  - the page recognising its own device's earlier page: it cannot be told apart from a second tab still open.

**The 5 s calls stay as they are.** They succeed. A shorter timeout would only turn them into failed closes and retries, and once the share stops counting at the start of its end, nobody waits on them.

**Failure 2: a start or watch that does not go live lets go of an empty media connection.**
- This covers every reason it did not go live: refused, or the media server failed.
- When the connection then carries nothing, the instance forgets it and sends the tab `dropped` after the refusal, and the tab makes a new one on its next try.
- A connection that carries anything is left alone.
- Rejected:
  - a fix in the tab alone, blocked by `"already"`;
  - making the media-server session only at the first offer, which is a restructure;
  - catching the 410 and making a new session, which still costs the 5 s wait and adds a failure path.

**Checks.**
- **Seam 1 tests on the fakes.** `hold` keeps a close waiting. They cover the leave and the two-tab case ([What two tabs on one device do](08-two-tabs-on-one-device.md) asked for it), no watch and no listing while ending, a failed close never listed again, a refused first start and a refused first watch each followed by a new connection, and a connection carrying a watch left alone.
- **On `graeae-test` with `scripts/real-media/`, a watcher throughout.** Three reloads with a start within 2 s, two tabs with the sharing one closed, and a refused first start provoked with `eval` and then a share 30 s later.
- **The log token.** It is asked for only if a check fails and the pages do not make the cause plain.

No new glossary term and no ADR: the changes are to the spec's Cut-off and Shares, carried by the build ticket.
