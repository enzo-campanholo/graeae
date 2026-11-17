# 25: Relay credential renewal

**What to build:** A tab left open for more than 12 hours keeps working. At 11 hours the backend hands it a fresh relay credential; a tab on the relay restarts its connection with it.

Spec: [Relay](../spec.md#relay).

**Blocked by:** 13, 22, 23

**Status:** ready-for-human

- [x] At 11 hours after a media connection's credential was minted, the backend mints a fresh one for that tab
- [x] A tab on a direct path takes it silently
- [ ] A tab on the relay does a connection restart with the fresh credential
- [x] If the restart fails, the tab goes through the ordinary reconnect path: the "reconnecting" mark, shares and watching restored
- [x] A tab that makes a new media connection, after its grace period ran out, gets a new credential with a new 12 hours
- [x] Revocation is never called anywhere
- [x] The restart can be replaced by a plain reconnect in one place, in case the owner's check shows the restart blips badly
- [x] The tab sends its final byte total before the restart
- [x] The 12 and 11 hours are named constants in one place, so the owner can shorten them on a test deploy
- [x] Seam 1 tests with controlled time; the direct-or-relay decision and the failed-restart fallback are tested through the fake media client
