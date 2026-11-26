# 68: A pull closed without its offer reaching the tab blocks that connection's next pull

**Status:** needs-triage

**Blocked by:** none

**What was seen:** ticket 67, on `graeae-test` (2026-11-24). A replacement's pull returned after its share had gone. The instance force-closed it without sending its offer to the tab. 5 s later the next pull into the same session got `406 The current signaling state is expecting a remote answer: renegotiation is expected`. The media server takes no other pull into a session until the browser answers the last offer, and closing the pulled track does not change that (`docs/media-server.md`). Ticket 67 fixed this for a replacement's steps only.

**Why (from reading the code, not seen yet):** these places still close a returned pull without sending its offer. Each keeps the tab's receiving connection, so that connection's next pull should then fail with 406, and the watch that asked for it is refused or leaves the stage.

- `Shares.watch`: the share ends, or the tab's socket closes, while the media server makes the pull. A tab in its grace period comes back to the same connection. If the connection carries another watch, it is kept and not forgotten.
- `Shares.move`: the new share ends, or the watcher's socket closes, while its pull is made (`!connected || gone(to)`). A pull returning to a connection that has been replaced meanwhile is harmless, since that session takes no pull again.
- After a restart: a pull the media server made just as the instance stopped is closed by the sweep (`test/restart.test.ts`, "closes a pull the media server made just as the instance stopped"). The tab keeps its receiving connection, and its next watch pulls into the same session. That test fails under the fake's `oneOfferAtATime()`.

**What to decide:** whether to send each such offer to the tab anyway (as 67 does: `pulled` or `moved`, answered, then closed), or to let go of the connection so the tab's next watch makes a new one. Check on real media first, e.g. a `repro-68.ts` that ends a share while a watch of it is being pulled onto a connection that carries another watch. Seam 1 can show each case with `oneOfferAtATime()` and a `hold("pull", { done: true })`.
