# 26: README and release docs

**What to build:** A stranger can go from an empty Cloudflare account to a working instance by following the README, and knows the cost, the limits and that there is no support before starting.

Spec: [The README](../spec.md#the-readme), [Deploying](../spec.md#deploying), [Platform promises](../spec.md#platform-promises).

Blocked by: 03, 24

Status: resolved

- [x] Steps from an empty account to a working instance: the dashboard work (card and Realtime, media server application, relay key), clone and install, the secrets file with the command that generates a setup secret, deploy, open the setup address, set the reset day to match the Cloudflare billing date, create invites
- [x] Every command that needs no Cloudflare login has been run against the repo as it stands; the rest are checked against Cloudflare's current documentation
- [x] Cost: expected $0; a card is required; the media server and the relay share 1,000 GB a month, then $0.05 per GB billed automatically; the usage budget defaults to 1,000 GB; it bounds watched media, not the whole bill, so keep Cloudflare's billing alert on
- [x] The usage count is stated as unverified
- [x] A recommendation to delete the local secrets file after the first deploy
- [x] The optional custom hostname, attached in the dashboard
- [x] The platform table, with Vivaldi and Brave as "Supported, not yet verified" and the best-effort platforms named as untested
- [x] The 144 Hz caveat
- [x] Updating: pull the latest tagged release and deploy; migrations are automatic; going back is not supported
- [x] Rotating each secret, recovering the owner with the setup secret, deleting an instance
- [x] The emergency stop for relay abuse, stated as unverified to end credentials already issued
- [x] No backup, and what to do after loss
- [x] 0BSD, no warranty, no support promise; issues and pull requests may go unanswered
- [x] A changelog exists with a first entry and a place to flag releases that need a manual step
- [x] Nothing in the repo is hardcoded to the owner's instance, and nothing rules out a later "Deploy to Cloudflare" button

## Comments

**Done** on `ticket/26-readme-and-release-docs`. Docs only: `README.md`, a new `CHANGELOG.md`, and the notes in `.secrets.example`. No code, no migration and no new test, since nothing here is behaviour a test can check; `pnpm test`, `pnpm typecheck` and `pnpm lint` still pass. A first agent stopped at an API rate limit before committing anything; this one started again from `v1-build`.

- **The README** follows the spec's list in order of need: what graeae is, Cost, Limits, Platforms, Deploying (seven numbered steps plus the optional custom hostname), Updating, Looking after an instance (getting back in, rotating each secret, the emergency stop, deleting, no backup), Licence and no support, and a short section for contributors pointing at `CLAUDE.md`. Cost, Limits and No support are linked from the top, so a stranger reads them before starting.
- **Only `pnpm run deploy`**, as ticket 12 asked. The README says outright not to run `wrangler deploy` by hand, and why. `pnpm exec wrangler login` and `pnpm exec wrangler delete` are the only bare wrangler commands. Rotating a secret uses the deploy script too: a `.secrets` with only the lines being changed (the script refuses blank lines, and `--secrets-file` leaves the others on the Worker, which `wrangler deploy --help` confirms).
- **Decision: the setup secret is generated with Node**, `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, in place of the example file's `openssl rand -base64 32`. Node is needed anyway, openssl is not on every Windows machine, and 64 hex characters need no thought in the `/setup#` address (base64's `+`, `/` and `=` would work, but there is no reason to have them). `.secrets.example` says so, and also says to keep only the changed lines on a later deploy and to keep the setup secret in a password manager, since the README recommends deleting `.secrets`.
- **Decision: releases are tags.** The README's clone and update steps check out `git describe --tags --abbrev=0 origin/HEAD`, the newest tag on the default branch. The changelog's first entry is `v1.0.0 (not yet released)`, and its header says a release needing a step by hand opens with a **Manual step** line.
- **Run against the repo as it stands** (a scratch clone of this branch with a stand-in `v1.0.0` tag, under the test lock): clone and the tag checkout; `pnpm install --frozen-lockfile`; the setup secret command (64 characters); `cp .secrets.example .secrets`; `pnpm run deploy --dry-run` refusing the blank file and naming all five; with the file filled in, the dry run building the production build with all five secrets bound (the fakes appear only in a source-map comment); `--name other` passing through; with no `.secrets`, wrangler warning about the five required secrets; `wrangler delete --dry-run`; `corepack enable pnpm` (into a scratch directory); `git fetch --tags` and the update's checkout.
- **Checked against Cloudflare's documentation** (17 November 2026): Realtime › Serverless SFU and its App ID and App Secret; TURN keys with a Turn Token ID and API token; 1,000 GB a month shared by the SFU and TURN, then $0.05 per GB of egress, ingress free; `secrets.required` failing a deploy and naming what is missing; dashboard routes left alone when the config names none; Custom Domains under Workers & Pages › the Worker › Settings › Domains & Routes › Add › Custom Domain, needing a zone on Cloudflare; budget alerts under Manage Account › Billing › Billable Usage, informational only; `wrangler delete` deleting "your Worker and all associated Cloudflare developer platform resources"; and the Deploy to Cloudflare button's needs (public repo, `package.json`'s `build` and `deploy` scripts, secrets read from a `.dev.vars.example` or `.env.example`, Durable Objects provisioned).
- **Nothing is hardcoded to an instance.** No account ID, zone, route, `workers.dev` subdomain or hostname is in any tracked file; the Worker's name is `graeae` and `--name` changes it. The README's clone address is the repo's GitHub address, not an instance's. **Nothing rules out a Deploy to Cloudflare button:** the deploy script uploads `.secrets` only when the file exists, so the button's own `deploy` run works without one. A later ticket that adds the button would add a `.dev.vars.example` listing the five secrets for the button's form.
- **Seen in the docs, for ticket 27:** Cloudflare's TURN FAQ says traffic between the relay and the media server "does not incur any charges", and the pricing page says it "is not charged twice". That points to relayed watching being billed once, so `RELAYED_COUNTS_TWICE` may well end up `false`; the README states the count as unverified either way.

**Needs the owner:** none of this blocks the ticket, but these README facts can only be confirmed on a real Cloudflare account. Correct the README where any of them turns out wrong.
1. *In ticket 13's deploy:* that Cloudflare asks for a card before Realtime can be used; the TURN key's place in the dashboard (the README says only "In Realtime, open TURN") and the labels of its two values (the README says "Turn Token ID" and "API Token"); that a deploy with a secret missing fails and names it; that the deploy prints the `workers.dev` address.
2. *A custom hostname* (the spec's "measured once something is built"): attach one in the dashboard, deploy again, and check it still answers. The docs say a config with no routes leaves dashboard routes alone, but say nothing about Custom Domains. If a deploy removes it, the README needs the deploy flag for it.
3. *Deleting an instance:* after deleting the ticket 13 test instance with `pnpm exec wrangler delete --name <its name>`, check under Workers & Pages › Durable Objects that its namespace has gone. The README says the stored data goes with the Worker on the strength of Cloudflare's "all associated resources".
4. *The usage count:* when ticket 23's comparison passes, change the README's "The usage count is unverified" line, and the Cost section's 5% if the margin changes.
5. *The relay key emergency stop:* the README states it as unverified to end credentials already issued. If you ever test it, say what happened.
6. *Screenshots:* the README has none. One of a room with real shares on the stage would help a stranger; only a real deploy can show one, and PRODUCT.md forbids inventing them.
7. *Tag ~~`v1.0.0`~~ `v0.1.0`* (the owner's decision, 2026-11-20) on `main` once v1 is done (ticket 27 and the rest), and change its changelog heading from "not yet released" to the date. Until a tag exists, the README's `git describe --tags` step fails.
