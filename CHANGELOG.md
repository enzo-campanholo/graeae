# Changelog

Each release is a git tag, newest first. To update, follow [Updating](README.md#updating) in the README.

A release that needs something done by hand, beyond checking out its tag and running `pnpm run deploy`, starts its entry with a **Manual step** line saying exactly what to do and when. Read every entry between your release and the new one: a manual step in a release you skip still applies.

Changes to stored data are applied by the instance itself and need no manual step. Going back to an older release is not supported.

## v1.0.0 (not yet released)

The first release.

- One instance per Cloudflare account, on the free plan, configured by five secrets and the setup secret's address.
- Permanent rooms, single-use invites, and devices remembered for 400 days from their last visit.
- Screen shares at 1080p60 and 720p60 with screen audio, and webcam shares at 720p30, through Cloudflare's media server with the relay offered.
- The owner page: people and their access, invites, rooms, and usage with the usage budget, its warnings and its stop.

No manual step: this is a first deploy, so follow [Deploying](README.md#deploying).
