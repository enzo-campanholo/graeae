# 58: A sharer who has stopped a share watches nothing

**Status:** needs-triage

**Blocked by:** none

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
