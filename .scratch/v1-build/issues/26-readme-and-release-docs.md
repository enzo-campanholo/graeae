# 26: README and release docs

**What to build:** A stranger can go from an empty Cloudflare account to a working instance by following the README, and knows the cost, the limits and that there is no support before starting.

Spec: [The README](../spec.md#the-readme), [Deploying](../spec.md#deploying), [Platform promises](../spec.md#platform-promises).

**Blocked by:** 03, 24

**Status:** ready-for-agent

- [ ] Steps from an empty account to a working instance: the dashboard work (card and Realtime, media server application, relay key), clone and install, the secrets file with the command that generates a setup secret, deploy, open the setup address, set the reset day to match the Cloudflare billing date, create invites
- [ ] Every command that needs no Cloudflare login has been run against the repo as it stands; the rest are checked against Cloudflare's current documentation
- [ ] Cost: expected $0; a card is required; the media server and the relay share 1,000 GB a month, then $0.05 per GB billed automatically; the usage budget defaults to 1,000 GB; it bounds watched media, not the whole bill, so keep Cloudflare's billing alert on
- [ ] The usage count is stated as unverified
- [ ] A recommendation to delete the local secrets file after the first deploy
- [ ] The optional custom hostname, attached in the dashboard
- [ ] The platform table, with Vivaldi and Brave as "Supported, not yet verified" and the best-effort platforms named as untested
- [ ] The 144 Hz caveat
- [ ] Updating: pull the latest tagged release and deploy; migrations are automatic; going back is not supported
- [ ] Rotating each secret, recovering the owner with the setup secret, deleting an instance
- [ ] The emergency stop for relay abuse, stated as unverified to end credentials already issued
- [ ] No backup, and what to do after loss
- [ ] 0BSD, no warranty, no support promise; issues and pull requests may go unanswered
- [ ] A changelog exists with a first entry and a place to flag releases that need a manual step
- [ ] Nothing in the repo is hardcoded to the owner's instance, and nothing rules out a later "Deploy to Cloudflare" button
