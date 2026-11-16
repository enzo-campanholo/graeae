# Deploy story

Type: grilling
Status: resolved
Blocked by: 11, 14, 15, 16
Map: ../map.md

## Question

What does someone deploying their own instance configure, and what steps does the README give them?

Inputs are [App hosting and framework](11-app-hosting-and-framework.md) (one Worker, `workers.dev` or an optional custom hostname), [Getting in](10-getting-in.md) (the deploy-time setup secret), [Usage budget](14-usage-budget.md), [Cloudflare account check](15-cloudflare-account-check.md) and [Media server access control](16-media-server-access-control.md) (which media server credentials exist).

Decide:

- The full list of settings and secrets, which are required, and their defaults.
- The README steps from an empty Cloudflare account to a working instance with its owner, and what a deployer must do in the Cloudflare dashboard by hand.
- How a deployer updates to a newer version, and what happens to their stored state when the schema changes.
- What the README says about cost and the absence of support.

## Answer

Decided with the user on 2026-11-16. Wrangler facts were read from Cloudflare's docs the same day (<https://developers.cloudflare.com/workers/wrangler/configuration/>, <https://developers.cloudflare.com/workers/wrangler/commands/workers/>, <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>). Nothing was run.

**Deploy path**

- One documented path in v1, on the command line with pnpm: clone, `pnpm install`, `wrangler login`, fill in the secrets file, `pnpm run deploy`.
- A "Deploy to Cloudflare" button is not in v1 but stays open as a later addition, because the user wants getting an instance running to be as simple as possible. Nothing in v1 may rule it out.

**Settings and secrets**

- The whole deploy-time configuration is five secrets, all required, with no defaults:
  - `SETUP_SECRET`: the setup secret.
  - `SFU_APP_ID` and `SFU_APP_SECRET`: the media server application.
  - `TURN_KEY_ID` and `TURN_KEY_TOKEN`: the relay key.
- The relay key is required even though whether any member needs the relay is still open (the map's Connectivity), so there is one configuration to test. Revisit only if [Quality proof](13-quality-proof.md) shows the relay is never needed.
- There are no other settings. The usage budget, its reset day, room names and everything else the owner can change are set in the app and stored in the instance. No environment variable exists for any of them.
- The Worker is named `graeae`. Someone running two instances passes `--name`.

**How the secrets are set**

- The deployer copies `.secrets.example` to `.secrets` (git-ignored) and fills in the five values. `pnpm run deploy` uploads them together with the code (`wrangler deploy --secrets-file`).
- The config declares all five under `secrets.required`, so a deploy with one missing fails and names it. The setup page naming a missing secret, shown only to someone holding the setup secret, stays as a backstop.
- Later deploys keep the secrets already on the Worker. The README recommends deleting `.secrets` after the first deploy, since it holds them in plain text.
- No interactive setup script in v1.

**The setup secret**

- The deployer generates it with a command the README gives (`openssl rand -base64 32`).
- An instance whose setup secret is missing or shorter than 32 characters refuses setup entirely.
- The setup address is `/setup#<secret>`. The part after `#` is never sent in the request, so it stays out of Cloudflare's logs; the page sends it to the backend itself.

**Done by hand in the Cloudflare dashboard**

1. Add a card and activate Realtime.
2. Create a media server application and copy its ID and secret.
3. Create a relay key and copy its ID and token.
4. Optional: attach a custom hostname to the Worker.

**Hostname**

- The repo's config ships with `workers.dev` only and no routes, so nobody edits a tracked file and `git pull` never conflicts.
- A deployer who wants their own hostname attaches it in the dashboard (Settings, Domains & Routes, Add, Custom Domain).
- If a deploy turns out to remove a dashboard-attached custom domain, the fallback is wrangler's `--domain` flag (`pnpm run deploy --domain graeae.example.com`).

**README steps, empty account to working instance**

1. Create a Cloudflare account; do the dashboard steps 1 to 3 above.
2. Clone, `pnpm install`, `wrangler login`.
3. Copy `.secrets.example` to `.secrets`, paste the four Cloudflare values, generate and paste the setup secret.
4. `pnpm run deploy`.
5. Open `https://<address>/setup#<secret>`. That browser becomes the owner's first device and the first room is created.
6. Set the usage budget's reset day to match the Cloudflare billing date, then create invites.

**Updating**

- `git pull` to the latest tagged release, then `pnpm run deploy`.
- Schema changes are numbered, forward-only migrations that the instance applies itself on first start after a deploy. Members, devices, rooms, access and invites carry over.
- Going back to an older version after a migration is not supported.
- `CHANGELOG.md` flags any release that needs a manual step.

**Backup and loss**

- v1 has no export and no backup. If the stored state is lost, the deployer runs setup again and re-invites everyone. The README says so plainly.

**Cost wording in the README**

- Expected cost is $0.
- Cloudflare requires a card on file.
- The media server and the relay share 1,000 GB a month, then cost $0.05 per GB, billed automatically.
- The usage budget defaults to 1,000 GB, so no media bill arrives unless the owner raises it.
- The usage budget bounds watched media, not the whole bill, so keep Cloudflare's billing alert on.

**Support wording in the README**

- 0BSD, no warranty, no support promise.
- Issues and pull requests are open but may go unanswered.

**Rotation and teardown (a few lines each in the README)**

- Rotating the media server secret or the relay key: make a new one in the dashboard, then deploy with a `.secrets` holding only the changed value, or use `wrangler secret put`.
- Rotating the setup secret, and recovering the owner with it: `wrangler secret put SETUP_SECRET`, then open the setup address. That forgets the owner's other devices, as [Getting in](10-getting-in.md) decided.
- Deleting an instance: `wrangler delete`, then remove the media server application and the relay key in the dashboard.

**Still unknown.** Whether `wrangler deploy` leaves a dashboard-attached custom domain in place when the config has no routes: the docs say this for routes and are silent on custom domains. It is checked on the owner's own instance when something is built.

**Glossary.** No term added. "Deployer" in this ticket is the owner before setup, not a separate role.

**No ADR.** Nothing here is hard to reverse.
