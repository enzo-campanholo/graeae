# 21: Failed closes, sweep and restart

**What to build:** A cut-off still lands when the media server misbehaves or the instance restarts. Failed closes are retried, tracks the records do not account for are found and closed, the owner is warned if a cut-off cannot be confirmed, and a graeae update during a session shows members at most a "reconnecting" flicker.

Spec: [Cut-off](../spec.md#cut-off), [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection). ADRs 0002 and 0003.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 20

**Status:** ready-for-agent

- [ ] A failed forced close keeps its record and is retried on a backoff: 1s, 2s, 4s, up to 30s between tries
- [ ] Retrying ends when the close succeeds or a sweep shows the track gone
- [ ] The owner's page shows a removal as done at once
- [ ] If closes are still failing after 1 minute the owner sees: "Couldn't confirm that <name> was cut off. Still trying."
- [ ] Sweep: at each cut-off and after a restart, the backend asks which tracks the affected media connections really have and force-closes anything its records do not account for
- [ ] There is no timed sweep
- [ ] A crash between writing a record and calling the media server leaves a record that the sweep clears
- [ ] An empty media connection left open by a cut-off browser is left alone and its record dropped
- [ ] After a restart of the instance, live shares and watching are still on record and everyone is treated as in their grace period
- [ ] Members who reconnect within the grace period keep their shares and watching; those who do not are cut off as usual
- [ ] Seam 1 tests use the fake's failures and delays and restart the instance mid-session
- [ ] The media layer seam gains "which tracks does this connection have", in the fake and in the Cloudflare implementation
- [ ] The Seam 1 harness gains a way to restart the instance mid-test while the fake media server keeps its tracks
