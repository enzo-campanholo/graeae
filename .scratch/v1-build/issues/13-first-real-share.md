# 13: First real share

**What to build:** Nothing. The owner deploys the integration branch and proves that real media flows before the rest of the media work is built on it.

**Blocked by:** 12

**Status:** resolved

- [x] Deploy once with one secret left out: the deploy fails and names it
- [x] Deploy the integration branch with real secrets, under a different Worker name to keep it apart from anything else deployed
- [x] Deploy again with the secrets file removed: the instance still works
- [x] Run setup, create an invite and join from a second browser
- [x] Share a webcam from one browser and watch it from the other: the picture plays
- [x] Stop the share: it leaves the viewer's stage at once
- [x] Watch once more with the viewer forced onto the relay, if the browser allows it, or from the member known to need the relay
- [x] Anything that fails is fixed on the integration branch before this ticket is resolved

## Comments

**Needs the owner:** this ticket is yours, and no agent has deployed anything. Everything it needs is on `v1-build` since ticket 12 merged (`9daeff5`). The build tickets that wait on it (15 onwards) are being built against the fake media layer meanwhile, so if real media fails here, fix it on `v1-build` first and expect those tickets to need checking against the fix.

- Deploy only with `pnpm run deploy`. A bare `wrangler deploy` after `pnpm test` would ship the fake-media test build (ticket 12's note).
- Ticket 12 made two calls in the close path that only a real run can check. A 410 ("session disconnected") counts as closed. A track that errors on close counts as closed only if the session no longer shows it open. When you stop a share, check that it really leaves the viewer's stage at once.
- Ticket 12 sets no codec preference yet; the browser picks the webcam codec until ticket 17.

**Done** on 2026-11-17, by the owner with an agent running the deploys. The integration branch was `v1-build` at `acd2667`, so the deploy carried tickets 13 to 28, not only ticket 12's webcam path. The test Worker was named `graeae-test`, on the owner's account, using the SFU application and TURN key made during planning.

- **One secret left out:** `.secrets` without `TURN_KEY_TOKEN`. Wrangler refused the deploy: "The following required secrets have not been set: TURN_KEY_TOKEN". The assets were uploaded but no Worker was made.
- **Real deploy:** all five secrets. `wrangler secret list` shows all five as `secret_text`.
- **Without the secrets file:** `.secrets` was deleted and the Worker deployed again. All five secrets remained.
- **An unknown browser** gets the app's page with a 404 at `/` and at `/setup` (`nothingHere`), as designed. The setup page reads the secret after the `#` itself.
- **Media:** the owner has no webcam, so every media check used a **screen share**: share, watch, stop, and relay on and off. The relay was tried on Chrome and Firefox. The owner reports that everything worked, stopping included, so ticket 12's close path (410 counts as closed, an errored track is checked against the session) behaves on real media. **The webcam capture itself (`getUserMedia` at 720p30, 1.5 Mbps) has not run on real media.** Ticket 27's Firefox "Share a webcam" line covers it.
- **Nothing failed**, so nothing was fixed.
- **For a later ticket, not a failure:** wrangler warns that preview URLs are on by default, because `wrangler.jsonc` does not set `preview_urls`. They run the same Worker and the same access checks. `"preview_urls": false` would close an address nobody needs.
