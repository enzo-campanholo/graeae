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

## Comments

**Built** on `ticket/25-relay-credential-renewal`, against the fakes, and merged with `v1-build` after ticket 19. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. There is no migration: each tab's next renewal moment is kept in the Durable Object's key-value storage (`relay:renewals`), as tickets 19 and 22 kept their marks. Every box is met except the restart on a real relay, which needs the owner (below).

- **The lives** are `RELAY_CREDENTIAL_TTL_SECONDS` (12 hours) and `RELAY_RENEWAL_AFTER_MS` (11 hours) in `src/instance/relay.ts`, the one place to shorten them for a test deploy. `RELAY_CREDENTIAL_TTL_SECONDS` moved there from `shares.ts`. `Instance.relayLives` is how the test harness shortens them (`startInstance({ relayLives })`). A deploy should edit the constants instead.
- **The instance** (`Relay`). Each `connect` mints a credential through `Relay.mint` and records the tab as due a fresh one 11 hours on. The instance's one alarm also wakes for the earliest tab that is due one and whose socket is open. A tab still in its grace period gets it on coming back. A due tab is sent `media.renewed { iceServers }`, a fresh 12-hour credential, and is due again 11 hours later. If the relay refuses, the renewal is tried again a minute later. A tab that lets go of its media connection (leaving, the grace period running out, `dropped`) is forgotten, so its next connection starts a new 12 hours. There is no revocation anywhere: the relay is only ever asked to mint.
- **The protocol.** `media.restart { offer }` hands the media server the browser's ICE-restart offer (`MediaLayer.restart`). The instance replies `restarted { answer }`, or `restart-refused` when the tab has no media connection or the media server fails. Nothing ends either way. `media.reconnect` is the ordinary reconnect path on the same socket: the cut-off ends everything the tab's connection carried, lets the connection go, and the tab hears `dropped`. It needs no check, since it only takes away.
- **The page** (`RoomClient.renew`). The decision is `renewal(relayed)` in `src/app/lib/media/renewal.ts`, read from the transport totals ticket 23 already reads. On a direct path the page calls `setConfiguration` with the fresh servers and nothing else changes. On the relay it sends its final total, then restarts as its next negotiation: `createOffer({ iceRestart: true })`, the instance's answer, then up to 15 s (`RESTART_WAIT_MS` in `browser.ts`) for ICE to be connected again. If the restart fails, the page sends a final total and `reconnect`, and the stage says "Reconnecting…". The page then rebuilds as after a dropped socket: its shares start again from the captures it holds, with no picker, and it watches again what was on its stage. As after any reconnect, others' watching of its shares is not carried over.
- **The switch.** `ON_THE_RELAY` in `renewal.ts` is `"restart"`. Set it to `"reconnect"` to skip the restart and always take the plain reconnect, should the restart blip badly.
- **Usage.** The instance counts from zero after a final total, while a browser may keep counting through an ICE restart. So the page subtracts the total it sent as final from its later reports, and drops that offset if the browser's total falls below it. A restart whose final total is lost is already made up by `usage.ts` (a total lower than the last).
- **Tests.** `test/relay.test.ts` (Seam 1, controlled time) proves the real 12 and 11 hours once, then runs on 12 and 11 minutes. It covers the second renewal, each tab counted from its own connection, a lost tab renewed on coming back, the relay refusing then a minute later, a new credential after the grace period ran out, the restart answered or refused with every share and watch untouched, and the reconnect ending everything and starting a new 11 minutes. `test/renewal.test.ts` covers the decision and the switch. `test/browser/relay.spec.ts` (Seam 2, through the fake media client, which gained `iceServers`, `restarts` and `restartFails`) covers: direct path silent; relay, where the final total goes before the restart, everything carries on, and later totals count from zero; and a failed restart, which shows "Reconnecting…" and brings shares and watching back.

**Needs the owner:** after ticket 13's deploy, as part of ticket 27, on Windows 11 with current Chrome or Helium. Box 3 stays unticked until then.
1. *Shorten the lives for the deploy:* in `src/instance/relay.ts`, set `RELAY_CREDENTIAL_TTL_SECONDS` to `12 * 60` and `RELAY_RENEWAL_AFTER_MS` to `11 * 60 * 1000`, then deploy with `pnpm run deploy`. Put them back before the real release.
2. *The restart on the relay* (box 3): force one browser onto the relay, as in ticket 23's note (block UDP to Cloudflare, or set Chrome's WebRTC IP policy to "disable non-proxied UDP"), and have it share a webcam and watch another member's share. After 11 minutes the room's WebSocket frames (DevTools, Network) should show `renewed`, then a `usage` frame with `"final":true`, then `restart` and `restarted`. In `chrome://webrtc-internals` the selected pair should still be `relay`, on a new candidate. Neither picture should freeze for more than a moment, and the stage should never say "Reconnecting…". At 12 minutes nothing should drop. Let it run past 24 minutes to see a second renewal.
3. *If Cloudflare refuses the restart* (`restart-refused`, followed by "Reconnecting…" every 11 minutes): the call in `CloudflareMediaServer.restart` (`src/instance/media/cloudflare.ts`) is unproven. It POSTs the offer alone to `sessions/{id}/tracks/new`. Compare that with Cloudflare's OpenAPI schema for an ICE restart. If the restart works but blips badly, or the media server will not take it, set `ON_THE_RELAY` to `"reconnect"` in `src/app/lib/media/renewal.ts`. The tab then reconnects every 11 hours, with a short "Reconnecting…".
4. *A direct path* (box 2, worth a look): on a browser not forced onto the relay, the same 11 minutes should pass with only `renewed` on the socket, and no `restart` and no final total.
