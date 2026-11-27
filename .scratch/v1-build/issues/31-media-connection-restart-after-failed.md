# 31: Media connection restart after "failed"

**What to build:** A media connection that the browser gives up on comes back once the network does, within the 30 seconds a faltering tab's shares stay live. When the connection reaches "failed", the tab restarts its ICE through the instance, the way ticket 25's relay renewal does. It tries again until the connection recovers, the instance lets the connection go, or the tab leaves.

Found by ticket 22's real-media check on `graeae-test`. Chrome reports "disconnected" about 6 seconds into a media drop and recovers from that by itself. It reports "failed" about 17 seconds in and never tries again, so a drop of 17 to 30 seconds ended the share even with the network back at 20 seconds.

Spec: [Shares](../spec.md#shares) ("If media falters while the signaling connection is fine…").

Blocked by: 22, 25

Status: resolved

- [x] A media connection that reaches "failed" is restarted through the instance (`media.restart`), keeping every share and watch
- [x] A restart that finds no path is tried again while the connection stays failed and the tab still holds it
- [x] "disconnected" alone starts no restart: the browser recovers from it by itself
- [x] The instance's 30 seconds stand: a connection still failed then ends its shares as before, and the tries stop
- [x] Seam 2 tests on the fake; the owner's check (or the agent's harness) on Cloudflare for a 20-second drop

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

**The owner chose the throwaway track**, and it works on Cloudflare.
- **How.** The restart offer carries one empty transceiver of its own (audio, sendonly, no track). `media.restart` now names its `mid`, and the instance pushes it as a local track in the same `tracks/new` call, so the call has the track Cloudflare insists on. The track sends nothing and stays on the session. A sweep may close it later, as a track no record names.
- **The stuck offer is fixed too.** A restart that is refused, or whose socket is lost, rolls back the browser's offer. The never-negotiated spare transceiver is stopped, so it does not go out with the next offer.
- **On `graeae-test`** (version `2d907b70`):
  - **A 20-second cut of the sharer's media.** The restart went out at "failed" and was answered at once, while the network was still down. The connection recovered 0.2 s after the network came back, and the viewer was decoding 20 fps again within 4 s: the same share, the same viewer and the same connection.
  - **The same cut, then a stop, a new share and a new watch** on the restarted connection: 20 fps.
  - **A 20-second cut of the viewer's media.** The viewer's own restart brought the picture back about 2 s after the network, without watching again.
  - **A 45-second cut.** Two restarts went out while the network was down, each waiting 15 s for a path. The share ended 31 s after the faltering. The tries stopped, and the next share made a new connection and was watched.
- Ticket 25's relay renewal restarts the same way, so it should work on Cloudflare now too. It has not been watched at its 11-hour mark.
- `pnpm test` (427 tests and 38 journeys), `pnpm typecheck` and `pnpm lint` pass.
