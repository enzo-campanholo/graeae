# 13: First real share

**What to build:** Nothing. The owner deploys the integration branch and proves that real media flows before the rest of the media work is built on it.

**Blocked by:** 12

**Status:** ready-for-human

- [ ] Deploy once with one secret left out: the deploy fails and names it
- [ ] Deploy the integration branch with real secrets, under a different Worker name to keep it apart from anything else deployed
- [ ] Deploy again with the secrets file removed: the instance still works
- [ ] Run setup, create an invite and join from a second browser
- [ ] Share a webcam from one browser and watch it from the other: the picture plays
- [ ] Stop the share: it leaves the viewer's stage at once
- [ ] Watch once more with the viewer forced onto the relay, if the browser allows it, or from the member known to need the relay
- [ ] Anything that fails is fixed on the integration branch before this ticket is resolved

## Comments

**Needs the owner:** this ticket is yours, and no agent has deployed anything. Everything it needs is on `v1-build` since ticket 12 merged (`9daeff5`). The build tickets that wait on it (15 onwards) are being built against the fake media layer meanwhile, so if real media fails here, fix it on `v1-build` first and expect those tickets to need checking against the fix.

- Deploy only with `pnpm run deploy`. A bare `wrangler deploy` after `pnpm test` would ship the fake-media test build (ticket 12's note).
- Ticket 12 made two calls in the close path that only a real run can check. A 410 ("session disconnected") counts as closed. A track that errors on close counts as closed only if the session no longer shows it open. When you stop a share, check that it really leaves the viewer's stage at once.
- Ticket 12 sets no codec preference yet; the browser picks the webcam codec until ticket 17.
