# Media server access control

Type: research
Status: resolved
Map: ../map.md

## Question

How does Cloudflare's media server decide who may publish and who may watch, and how can graeae cut one member off within about 2 seconds?

[Media transport choice](08-media-transport-choice.md) put every share through Cloudflare's media server in the owner's account. [Getting in](10-getting-in.md) requires that removing a member stops their shares and what they are watching within about 2 seconds, and the instance's address and code are public.

Report from primary sources:

- What credential a browser needs to publish or to pull a track, who issues it, and whether the app's secret ever has to reach the browser.
- Whether every publish and pull can be made to pass through graeae's own backend, so a remembered device and its room access are checked each time.
- How the backend ends one session or closes individual tracks, how fast that takes effect, and whether a cut-off browser can reconnect with anything it still holds.
- Whether a track can be pulled by someone who knows its identifiers but did not go through the backend.
- The same questions for Cloudflare's relay, which is used alongside the media server.

The answer feeds the map's Securing the media layer.

## Answer

Full findings: `docs/research/media-server-access.md`, read from Cloudflare's docs, its OpenAPI spec and RFC 8656 on 2026-11-16. Nothing was measured live.

- **Credential.** The only media server credential is the application's secret, sent as a bearer token by the backend. There are no per-member or per-track tokens. The browser never needs the secret; it only does WebRTC with SDP the backend hands it.
- **Backend gating.** Every publish and pull can pass through graeae. Only the Worker and its Durable Object call the API (`sessions/new`, `tracks/new`, `renegotiate`, `tracks/update`, `tracks/close`), and every call needs the secret. Cloudflare's own video-room example uses the same Worker-to-Durable-Object design.
- **Cut-off.** No endpoint ends a whole session. The backend force-closes tracks (`tracks/close` with `force: true`, no SDP and no help from the browser). To remove a member it must close every track it has on record for them, every other member's subscription to those tracks, and revoke their relay credential. A cut-off browser cannot add tracks or subscriptions, but its existing connection may stay up and any track left unclosed keeps working.
- **Pulling by identifiers.** Not possible without the secret; Cloudflare calls session IDs and track names "locators, not credentials". Any holder of the secret can pull any track in the application, so the backend must build pulls from its own records, never from identifiers a browser sends.
- **Relay.** The backend issues relay credentials from a separate server-side key. They last at most 48 hours and can be revoked by username. Leaked ones let someone relay traffic to public addresses, billed to the owner at $0.05 per GB after 1 TB free; they give no access to the media server.

Unverified: how fast a forced close stops forwarding (the 2-second requirement rests on this, so it is added to [Quality proof](13-quality-proof.md)); whether the media server drops packets a cut-off sharer keeps sending; whether a session with no tracks is ever torn down; whether a browser can reuse the 30-second reconnect window with no API call; whether revoking a relay credential disconnects a relay already in use; relay port and rate limits; whether scoped media server credentials exist or are planned; whether a forced close is complete when the API returns.
