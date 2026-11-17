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

**Built and checked on Cloudflare** on 2026-11-17, in `a7aaa42`, deployed to `graeae-test` (version `ab94d3db`).

- **The page.** The media client reports how the connection is doing (`MediaHealth`: "fine", "faltering", "failed"). The room client answers "failed" with ticket 25's restart, and tries again 2 s after each one that fails, until the connection recovers or the instance lets it go. "disconnected" alone starts nothing.
- **Tests.** Seam 2 in `test/browser/dropped.spec.ts`: a restart is tried again until one finds a path, keeping the share, its viewer and the one connection; and the tries stop once the instance has ended the share. `pnpm test` (427 tests and 38 journeys), `pnpm typecheck` and `pnpm lint` pass.
- **On Cloudflare it cannot work.** With the sharer's media cut for 20 seconds, every restart came back `restart-refused`, and the share ended at the 30 s mark as before. A deploy that logged the media server's reason, since reverted, showed:
  - `POST sessions/{id}/tracks/new` with the restart offer alone: `400 Body JSON validation error`.
  - The same with `tracks: []`: `406 Expecting at least 1 track in the request`.
  - `PUT sessions/{id}/renegotiate` with the offer: `406 sessionDescription.type=answer is expected`.

  So the Realtime SFU takes no offer that only restarts ICE. Its docs advise a new session after a loss of connectivity (developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/), and another project reports the same refusal (github.com/Q9Labs/chalk/pull/838).
- **Also found:** a refused restart leaves the browser's offer applied (`have-local-offer`), and nothing rolls it back. In the real run the next try took about 18 s to go out. The fake applies no description, so it cannot show this.

**Needs the owner:** how to bring a failed connection back, given the above. The options are in the conversation of 2026-11-17: a restart offer that carries one throwaway track, a new connection, or leaving 17-to-30-second drops to end the share.
