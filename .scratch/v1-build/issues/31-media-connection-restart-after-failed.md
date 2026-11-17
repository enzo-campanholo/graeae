# 31: Media connection restart after "failed"

**What to build:** A media connection that the browser gives up on comes back once the network does, within the 30 seconds a faltering tab's shares stay live. When the connection reaches "failed", the tab restarts its ICE through the instance, the way ticket 25's relay renewal does. It tries again until the connection recovers, the instance lets the connection go, or the tab leaves.

Found by ticket 22's real-media check on `graeae-test`. Chrome reports "disconnected" about 6 seconds into a media drop and recovers from that by itself. It reports "failed" about 17 seconds in and never tries again, so a drop of 17 to 30 seconds ended the share even with the network back at 20 seconds.

Spec: [Shares](../spec.md#shares) ("If media falters while the signaling connection is fine…").

**Blocked by:** 22, 25

**Status:** ready-for-human

- [ ] A media connection that reaches "failed" is restarted through the instance (`media.restart`), keeping every share and watch
- [ ] A restart that finds no path is tried again while the connection stays failed and the tab still holds it
- [ ] "disconnected" alone starts no restart: the browser recovers from it by itself
- [ ] The instance's 30 seconds stand: a connection still failed then ends its shares as before, and the tries stop
- [ ] Seam 2 tests on the fake; the owner's check (or the agent's harness) on Cloudflare for a 20-second drop

## Comments
