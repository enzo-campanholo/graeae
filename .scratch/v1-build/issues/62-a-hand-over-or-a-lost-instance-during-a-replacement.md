# 62: A hand-over, or a lost instance, during a replacement of the receiving connection

**Status:** needs-triage

**Blocked by:** 61

**Why:** ticket 61's review found edge cases in replacing a receiving connection. A replacement lasts a few seconds, happens at an 11-hour renewal on the relay or after the browser gives the connection up, and nothing here has been seen on `graeae-test`. Each case below needs a decision before it is built.

## What was found

- **A hand-over during a replacement can apply an offer out of order.** While a tab replaces its receiving connection, a hand-over moves its watch of the old share onto the replacement at once (`Shares.move`, `receivingTarget`), and the tab hears `moved`. The room client runs `moved` behind the replacement on the receiving connection's turn. So it applies that offer after the replacement's later `pulled` offers. And a move that began on the old connection, before the replacement existed, can finish after it does: its offer is for the old session, but the tab applies it to the new connection. Either way the moved picture can be lost. One way out is for the instance to treat a move during a replacement as one of the replacement's steps, sent in turn as `pulled`. Whatever the fix, Seam 1 and a journey should cover it.
- **A replacement waits in memory.** `Instance.replacing` and `Shares.pending` live only in memory. If the Durable Object is evicted between a `pulled` and the tab's `answer` while the socket stays open, the next step never comes. The tab's wait for the next `pulled` or `replaced` has no timeout, so every later watch on that tab queues behind it. After an instance restart, a `role = 'replacement'` row is cleared only when the tab asks again (`replaceAgain`, on its next socket). Check whether a watch's own pending pull has the same gap.
- **Usage misses the overlap.** The tab reads the old connection's final total just before `replace`, but the old connection keeps receiving until the old pulls are closed and it is retired. Those bytes, a second or two per replacement, are never counted. The spec has the count never read below Cloudflare's own figure.
- **No limit on asking again.** If a replacement is answered `unavailable` while the browser still says the receiving connection `failed`, `recover("receiving")` asks again every 2 seconds for as long as the tab is open. On the sending side the 30-second rule ends this. On the receiving side nothing does, so the `unavailable` cases need telling apart (the media server failed, versus nothing to replace).

## Comments
