# The backend is the only gate to the media server

Cloudflare's media server has one credential, the application's secret, and no per-member or per-track tokens; it also has no call that ends a whole connection, only one that closes named tracks. So graeae's backend is the only party that talks to it, and a browser never sees a media server identifier: it asks for "this member's screen" and the backend builds the pull from its own records. The backend picks every track name, writes the record to storage before making the call, and closes everything with a forced close, ordinary stops included. The alternative, where browsers negotiate with the media server more directly and the backend only grants permission, was rejected because cutting a member off means closing every track they publish or pull, and that is only possible if no track can exist that the backend has not recorded.

## Consequences

- A crash mid-call leaves a record with nothing behind it, never a track with no record. A sweep at each cut-off and after a restart asks the media server which tracks a connection really has and closes anything unaccounted for.
- There is one close path, the one removal depends on, and it runs on every ordinary stop.
- Every share and every act of watching costs a round trip through the Durable Object, and each adds rows to its storage.
- A cut-off browser may keep an empty connection to the media server open. It carries nothing and cannot gain a track, so it is left alone.
