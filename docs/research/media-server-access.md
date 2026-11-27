# Media server access control: Cloudflare Realtime SFU and TURN

Research date: 2026-11-16. Question: how does Cloudflare's media server decide who may
publish and who may watch, and how can graeae cut one member off within about 2 seconds?

Each claim is labelled:

- **[Doc]**: stated by a primary source (URL given).
- **[Inferred]**: my conclusion from documented facts. It is not stated anywhere.
- **[Unverified]**: could not be confirmed from primary sources. These are collected at the end.

## Sources

| Short name | URL |
|---|---|
| HTTPS API overview | https://developers.cloudflare.com/realtime/sfu/https-api/ |
| Sessions & tracks | https://developers.cloudflare.com/realtime/sfu/sessions-tracks/ |
| Connection patterns | https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/ |
| Negotiation & lifecycle | https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/ |
| SFU limits | https://developers.cloudflare.com/realtime/sfu/limits/ |
| Video room example | https://developers.cloudflare.com/realtime/sfu/examples/video-room/ |
| OpenAPI spec | https://developers.cloudflare.com/realtime/static/calls-api-2024-05-21.yaml |
| TURN credentials | https://developers.cloudflare.com/realtime/turn/generate-credentials/ |
| TURN FAQ | https://developers.cloudflare.com/realtime/turn/faq/ |
| TURN analytics | https://developers.cloudflare.com/realtime/turn/analytics/ |
| RFC 8656 (TURN) | https://www.rfc-editor.org/rfc/rfc8656.html |

## 1. What credential a browser needs to publish or pull

**[Doc]** The SFU has exactly one credential: the app's **App Secret**, sent as
`Authorization: Bearer <APP_SECRET>` to `https://rtc.live.cloudflare.com/v1`. Every operation
in the OpenAPI spec uses the same `secret` bearer scheme. There are no per-user, per-session
or per-track tokens. Sources: HTTPS API overview; OpenAPI spec (`components.securitySchemes.secret`,
`security: - secret: []` on every operation).

**[Doc]** Cloudflare issues the App ID and App Secret when an SFU app is created in the
owner's account ("App creation itself uses your Cloudflare account authorization"). Source: HTTPS API overview.

**[Doc]** The secret stays on the backend: "Keep the App Secret on trusted backend
infrastructure." "Your backend holds its App Secret and makes every SFU API request shown here."
Sources: HTTPS API overview; Connection patterns.

**[Doc]** The browser itself only does WebRTC. It creates or applies SDP and hands
`pc.localDescription` to the backend, which submits it to the API. Media and DataChannels then
flow between the browser and the SFU over WebRTC (ICE/DTLS-SRTP). Sources: Connection patterns;
Negotiation & lifecycle ("Your endpoint creates or applies SDP").

**[Inferred]** The only thing a browser receives from the SFU is the SDP the backend passes
back to it: the SFU's ICE ufrag/password, DTLS fingerprint and candidates. That is enough to keep
an already-negotiated PeerConnection running. It is not enough to call the API.

**Answer:** a browser needs no API credential of its own. graeae's Worker publishes and pulls on
its behalf with the App Secret, and the secret never has to reach the browser.

## 2. Can every publish and pull pass through graeae's backend?

**[Doc]** Yes. That is the only design the docs support. "Your backend sends authenticated
HTTPS requests, while endpoints exchange media and DataChannels with the SFU over WebRTC." (HTTPS API overview.)
"Endpoint authentication and resource authorization belong to your application." (HTTPS API overview.)
"Your application's own authentication and permission checks determine which end users can
request those calls." (Sessions & tracks.)

**[Doc]** Cloudflare's own video-room example uses exactly the shape graeae plans: an authenticated
request goes from the browser to a Worker, then by RPC to a Room Durable Object, and only the
backend calls the SFU "with server credential". In that example, room names, participant IDs,
track names and session IDs "are locators, not credentials", and the backend builds subscriptions
"using publisher session IDs and track names" taken from the Durable Object's own discovery state.
Source: Video room example.

The HTTPS calls, all made by **graeae's Worker/Durable Object** with the App Secret (OpenAPI spec;
HTTPS API overview):

| Purpose | Call | SDP flow |
|---|---|---|
| Open a connection for one browser | `POST /apps/{appId}/sessions/new` | Returns `sessionId`. No WebRTC connection exists yet. |
| Publish | `POST /apps/{appId}/sessions/{sessionId}/tracks/new` with `location: "local"`, `trackName`, browser offer | Browser offer goes in, SFU answer is returned to the browser. |
| Pull (watch) | `POST /apps/{appId}/sessions/{sessionId}/tracks/new` with `location: "remote"`, the publisher's `sessionId` and `trackName` | SFU may return an offer that requires renegotiation. |
| Finish a renegotiation | `PUT /apps/{appId}/sessions/{sessionId}/renegotiate` | Browser answer goes in. |
| Change a track | `PUT /apps/{appId}/sessions/{sessionId}/tracks/update` | |
| Stop tracks | `PUT /apps/{appId}/sessions/{sessionId}/tracks/close` (`force` true/false) | Only when `force: false`. |
| DataChannels | `POST .../datachannels/establish`, `POST .../datachannels/new`, `PUT .../datachannels/update`, `PUT .../datachannels/close` | |
| Inspect | `GET /apps/{appId}/sessions/{sessionId}` | |

**[Inferred]** Every publish and every pull needs one of these calls, and each call needs the
secret. So putting the remembered-device cookie and room-access check in front of each call
gates every publish and every pull. The browser never calls `rtc.live.cloudflare.com/v1` itself.
The only direct contact it has with Cloudflare is WebRTC media to the SFU, plus STUN/TURN to the relay.

**[Inferred]** Pulls should be built only from the Durable Object's own record of publications,
mapped from (room, member, share). They should never be built from a `sessionId` or `trackName`
the browser supplies. Otherwise a member with access to room A could ask the backend to pull a
track from room B by its identifiers. The SFU would not stop this, because all sessions in one
app can pull from each other (see point 4).

## 3. Ending a session or closing tracks: speed and reconnection

### What the API offers

**[Doc]** There is **no endpoint that ends or deletes a whole session.** The spec defines only
`tracks/close`, `datachannels/close` and `adapters/websocket/close` as teardown operations.
Sources: OpenAPI spec (path list); Connection patterns.

**[Doc]** `PUT .../tracks/close` takes `tracks: [{mid}]` and a required `force` flag. "When true,
stop the selected tracks' media flow without an SDP exchange." "No `/renegotiate` call is
needed." "Forced closure can leave records in session information." Source: OpenAPI spec
(`CloseTracksRequest`); Connection patterns.

**[Doc]** "Closing a receiving track stops that subscription." "Closing a publishing track stops
the source." "Subscribers' PeerConnections can remain connected, and media already buffered can
still play." Source: Connection patterns. The spec also says packets already sent or buffered at
endpoints are distinct from future forwarding (OpenAPI spec, `force` description).

**[Doc]** For an endpoint that is unresponsive or untrusted, the documented teardown is: "retire
the connection, force-close known tracks, and close known DataChannels"; withdraw ended
publications from discovery; and "Do not resume queued work on that connection". Also, "A
timed-out API request may still finish. Closing known tracks does not cancel it. Retain late
allocations for cleanup." Source: Negotiation & lifecycle (as summarised in the Cloudflare docs search
result for that page).

**[Doc]** "A request-level failure can occur after individual tracks have closed", so each
track result must be checked. Source: OpenAPI spec (`tracks/close` description).

### Proposed cut-off procedure for graeae [Inferred]

When the owner removes member M, the Durable Object should, in order:

1. Mark M removed and reject every later request from M's devices. Drop M's API work that is
   queued or in flight, and keep any late results for cleanup.
2. Withdraw M's publications from the room state and notify everyone else over WebSocket.
3. For each of M's SFU sessions: `tracks/close` with `force: true` on **all** mids (local and
   remote), and `datachannels/close` on all channels. This stops what M publishes and what M receives.
4. For every other member's session that pulls one of M's tracks: `tracks/close` with
   `force: true` on that receiving mid. Strictly this is redundant once M's source is closed, but it
   removes the subscription cleanly instead of leaving a dead receiver.
5. Revoke M's TURN credential(s) (point 5).
6. Close M's WebSockets and invalidate M's remembered-device cookie(s) server-side.

All of steps 3–5 are server-to-Cloudflare HTTPS calls. They can run in parallel, and none of
them waits on M's browser.

### Speed

**[Doc]** The docs give **no latency figure** for how fast a forced close stops forwarding. The
limits page has no figure either. Source: SFU limits.

**[Inferred]** A forced close needs no SDP exchange and no cooperation from the browser, so the
time to cut off is about one HTTPS round trip from the Worker to `rtc.live.cloudflare.com` plus
whatever internal propagation the SFU has. That fits plausibly within 2 seconds, but it **must
be measured** (see unverified list).

### Can a cut-off browser reconnect or resume?

**[Doc]** "After a session loses WebRTC connectivity", there is a "30-second session/track reuse
window", and "Reuse requires a viable connection and resources." Source: SFU limits.

**[Doc]** A media track that receives no packets for 30 seconds "is garbage-collected." Source: SFU limits.

**[Doc]** The documented recovery path is replacement, not resumption: "replace the connection",
create a replacement session, and "Session inspection can recover resource identifiers, but not
lost SDP or request history." Source: Negotiation & lifecycle.

**[Inferred]** What M's browser still holds after cut-off, and what each item allows:

| Held item | Can it be used without graeae's backend? |
|---|---|
| Own `sessionId`, track names, mids | No. Every API call that uses them needs the App Secret. |
| Other members' `sessionId`/`trackName` (if ever sent to the browser) | No. A pull is `tracks/new` and needs the secret. |
| SFU's ICE ufrag/pwd, DTLS fingerprint, the existing DTLS-SRTP association | Keeps the **existing** PeerConnection alive and lets the browser send packets. It cannot add a track or a subscription: that needs `tracks/new` or `renegotiate`, which need the secret. |
| An ICE restart attempt | Needs a new offer/answer applied by the SFU, which only reaches the SFU through `renegotiate`/`tracks/*` (secret required). |

**[Inferred]** No API call ends the session, so after the forced closes M's PeerConnection may
stay connected to the SFU with no tracks in it. The risk is a **track that was missed**. Any
track not explicitly closed keeps flowing, and if connectivity drops briefly it can be reused
within the 30-second window. Step 3 must therefore close every mid the Durable Object has on
record for M's sessions, including ones from API calls that timed out but may have succeeded.
The `GET /apps/{appId}/sessions/{sessionId}` call can be used to list the tracks that actually exist and
close them too.

## 4. Can a track be pulled by someone who only knows its identifiers?

**[Doc]** A pull is `tracks/new` with `location: "remote"`, the publisher's `sessionId` and
`trackName` ("Use the publisher's session ID together with the track name to locate remote
media."). It is an authenticated API call. Sources: Sessions & tracks; OpenAPI spec.

**[Doc]** Within one app, "Its sessions can publish and subscribe to resources within that
application." The spec describes no restriction per session or per track. Sources: Sessions & tracks;
OpenAPI spec.

**[Doc]** Cloudflare's example states that session IDs and track names "are locators, not credentials".
Source: Video room example.

**[Inferred]** A stranger who knows a `sessionId` and `trackName` but not the App Secret cannot
pull the track, because they cannot make the `tracks/new` call. Anyone holding the App Secret can
pull **any** track in the app, and the SFU itself does not check room membership. So graeae's
backend is the only access check, and the App Secret must never leave the Worker's secrets.

**[Inferred]** Because the code is open source, a stranger can see how pulls are requested. That
does not matter as long as each backend request is checked against the cookie and room access,
and pulls are resolved from server-side state (point 2).

## 5. Cloudflare TURN relay

### Issuance and lifetime

**[Doc]** The owner creates a **TURN key** (key ID plus API token). The backend calls
`POST https://rtc.live.cloudflare.com/v1/turn/keys/$TURN_KEY_ID/credentials/generate-ice-servers`
with `Authorization: Bearer $TURN_KEY_API_TOKEN` and a body like `{"ttl": 86400}`. The call
returns 201 with `iceServers` (a username and credential plus `stun:`/`turn:`/`turns:` URLs), which
"can then be passed on to your front-end application." Source: TURN credentials.

**[Doc]** "You should keep your TURN key on the server side (don't share it with the
browser/app)." It is "a long-term secret that allows you to generate unlimited, shorter lived
TURN credentials". "You should generate short-lived credentials for each TURN user." Source: TURN credentials.

**[Doc]** The longest lifetime is 48 hours: "You can set a expiration time for a credential up to 48
hours in the future." Credentials can be refreshed mid-call with `RTCPeerConnection.setConfiguration()`.
Sources: TURN FAQ; TURN credentials.

**[Doc]** A separate endpoint, `/credentials/generate`, accepts a `customIdentifier` (for example a
user ID) that shows up in GraphQL analytics for abuse monitoring. Sources: TURN credentials; TURN analytics.

### Revocation

**[Doc]** "Short lived credentials can also be revoked before their TTL expires":
`POST https://rtc.live.cloudflare.com/v1/turn/keys/$TURN_KEY_ID/credentials/$USERNAME/revoke`, which
returns 204. Revocation is by **username**, so the backend must store the username it issued to each
device. Source: TURN credentials.

**[Doc]** On **expiry** during use: Cloudflare "will immediately stop billing and recording usage
for analytics", and "After a short delay, the connection will be disconnected." Source: TURN FAQ.

**[Unverified]** The docs do not say whether **revocation** cuts an active allocation the same
way, or how long "a short delay" is.

**[Doc, protocol]** In TURN, Refresh, CreatePermission and ChannelBind are authenticated requests.
Send and Data indications "cannot be authenticated". Allocations last 10 minutes, permissions 5
minutes, and channel bindings 10 minutes unless refreshed. Source: RFC 8656.

**[Inferred]** If Cloudflare only checked credentials on authenticated requests, a revoked holder
could keep relaying over an existing allocation for up to about 5–10 minutes until a refresh was
needed. Cloudflare's FAQ suggests active disconnection on expiry. Whether that also covers revocation
must be tested. In any case, the media itself still goes to the SFU, and point 3's forced track closes
cut it off whatever the relay state is. TURN only carries packets. It grants no SFU access.

### What leaked TURN credentials allow

**[Doc]** A holder can allocate a relay and send to public IPv4 peers. Cloudflare "denies
CreatePermission or ChannelBind requests" to private ranges (loopback, link-local, multicast)
and BYOIP addresses, and issues IPv4 relay addresses only. It does not support TCP relaying
(RFC 6062). Source: TURN FAQ.

**[Doc]** Billing: $0.05/GB for data sent from Cloudflare's edge to the TURN client, after 1,000
GB free. Traffic between TURN and the SFU is not billed. Source: TURN FAQ.

**[Inferred]** Leaked TURN credentials allow, until they expire or are revoked:

- relaying UDP to arbitrary public IPv4 hosts through the owner's account, which costs the owner
  money and hides the leaker's IP from those hosts;
- nothing on the SFU. Pulling or publishing needs the App Secret through graeae's backend.

Mitigations: issue one credential per device per call with a short `ttl` (for example a few
hours, refreshed by `setConfiguration()`), tag it with `customIdentifier`, store the username, and
revoke on removal.

## Unverified (could not be confirmed from primary sources)

1. How long a `tracks/close` with `force: true` takes to stop forwarding. No latency or SLA is documented.
   It needs measurement against the 2-second target.
2. Whether the SFU drops RTP that a cut-off publisher keeps sending on a mid that was force-closed,
   rather than merely not forwarding it. The docs say the source stops; the per-packet behaviour is not described.
3. Whether a session with no tracks and no DataChannels left is ever torn down by the SFU. The 30-second
   media timeout "does not define the lifetime of a connected session without media". No session-delete endpoint exists.
4. Whether the 30-second "session/track reuse window" can be used by an endpoint on its own, for
   example an ICE consent recovery or a new network path using the old ICE credentials, without any API call.
   The docs do not say what "reuse" involves.
5. Whether TURN **revocation** disconnects an active allocation, and how quickly. Only expiry
   behaviour ("after a short delay") is documented.
6. Whether Cloudflare enforces any per-port restriction or rate limit on TURN relay destinations,
   beyond the private-range blocking and the packet-rate throttling described in the FAQ.
7. Whether Cloudflare offers, or plans, scoped credentials for the SFU (per-session or per-track tokens).
   None appear in the current OpenAPI spec or docs.
8. Whether a forced close finishes within one API response, or carries on asynchronously after
   the 2xx returns.
