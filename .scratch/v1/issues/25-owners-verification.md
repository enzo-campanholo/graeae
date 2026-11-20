# Owner's verification

Type: task
Status: ready-for-human
Map: ../map.md

## Question

Does the built app hold up on real machines and against Cloudflare's own figures?

This is the owner's work on a deployed instance, once every ticket in [the build](../../v1-build/issues/) is resolved. The steps and pass marks are in the spec under [Verification before v1 is called done](../../v1-build/spec.md#verification-before-v1-is-called-done). v1 is not called done until this is resolved. It does not replace [Remaining browser checks](21-remaining-browser-checks.md), which runs on the prototype.

- [ ] Follow the README from an empty Cloudflare account to a working instance, exactly as written, and fix any step that is wrong or missing
- [x] Usage comparison: one real session of at least 2 GB, then Cloudflare's egress for the same period on the Analytics tab. graeae reading 0 to 10% above passes; otherwise change the margin and repeat (build ticket 23: 2.2 GB, margin set to 0%, reading +7.9%)
- [x] In the same sitting, read the relay's analytics with one viewer on the relay. If relayed watching is billed once, switch the doubling off (build ticket 27: Billable Usage cannot tell which figure is billed, so the doubling stays until a bill shows it)
- [x] When the comparison passes, remove "unverified" from the README's cost section (it no longer says it)
- [ ] macOS: the nine-step pass in current stable Chromium, with browser and operating system versions recorded
- [ ] Linux: the same
- [ ] The Durable Object stays under the free plan's daily duration quota across a real evening, with the heartbeat and byte reports running
- [ ] Which CPU limit applies to a free-plan Durable Object
- [ ] A deploy leaves a dashboard-attached custom hostname in place; if not, the README documents the deploy flag
- [ ] Results from Remaining browser checks are applied: the platform table, two qualities on or off, restart or reconnect at 11 hours
