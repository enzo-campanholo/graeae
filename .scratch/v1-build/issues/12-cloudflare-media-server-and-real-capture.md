# 12: Cloudflare media server and real capture

**What to build:** The real halves behind the two fakes: the media layer's Cloudflare implementation and the media client's real capture and connection. With real secrets, a webcam share from one browser plays on another browser's stage through Cloudflare's media server, with the relay offered.

Nothing here is automated against Cloudflare. Port from what was proven: the prototype on the branch `prototype/quality-proof` is the only code that has run against the real media server and relay, and `docs/research/media-server-access.md` on the branch `research/media-server-access` describes the API. Neither branch is merged; read them with `git show <branch>:<path>`.

Spec: [Media connections and records](../spec.md#media-connections-and-records), [Relay](../spec.md#relay), [Encoding and quality](../spec.md#encoding-and-quality) (webcam row only), [Not automated: real media](../spec.md#not-automated-real-media). ADR 0003.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] The Cloudflare implementation covers every operation the media layer seam has at this point (media connection, publish, pull, forced close, relay credential), using only the application's secret, sent from the backend
- [ ] Every close is a forced close, needing nothing from the browser
- [ ] Relay credentials are minted from the relay key with a 12-hour life
- [ ] The relay is offered to every media connection from the start, over UDP, TCP and TLS
- [ ] The real media client captures a webcam at 720p and 30 fps, limited to 1.5 Mbps, and plays a pulled share on the stage
- [ ] A build or runtime switch selects the fakes for tests; the default is the real implementations, and no request to a deployed instance can select the fakes
- [ ] All Seam 1 and Seam 2 tests still pass on the fakes
- [ ] The code paths that only run against Cloudflare are thin and readable against the spec, since no test covers them
