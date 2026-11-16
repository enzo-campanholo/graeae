# Media layer records and relay credentials

Type: grilling
Status: resolved
Blocked by: 16, 18
Map: ../map.md

## Question

What does the backend record about each share and each act of watching so that it can cut a member off completely, and how are relay credentials issued, limited and revoked?

Inputs are [Media server access control](16-media-server-access-control.md), which found that only the backend holds the media server secret, that no call ends a whole session, and that removal means force-closing every track on record; and [Signaling and room state](18-signaling-and-room-state.md), which fixed when a share is live, the 30-second grace period, hand-over, and that live state is kept in storage.

Decide:

- Which media server sessions and tracks the backend records per device, per share and per watch, and when each record is created and dropped, so that nothing a member publishes or pulls can exist off the record.
- The exact sequence on removal from a room, removal from the instance, a forgotten device, the usage budget stop and an expired grace period.
- How a publish or a pull is authorised: which checks run (remembered device, access to the room, presence, the one-share limit, the usage budget) and that pulls are built from the backend's records, never from identifiers a browser sends.
- Relay credentials: who gets one and when, how long it lasts, whether every member gets one or only those who need it, and when it is revoked.
- What is left running that the backend cannot close (an idle connection with no tracks), and whether that matters.

Whether a forced close lands within about 2 seconds is not decided here; it is measured in [Quality proof](13-quality-proof.md).

## Answer

Settled by grilling on 2026-11-16.

**Media connections**

- Each tab with a room open holds one media server connection, used for both what it shares and what it watches. It is created the first time that tab shares or watches, not on opening the room.
- Only the backend talks to the media server. A browser never receives or sends a media server identifier.

**Records**

- Per media connection: device, room, the media server's ID for it.
- Per share: member, device, room, kind, its video track and, for screen audio, its audio track.
- Per watch: the viewing device's connection, the share watched, the pulled tracks.
- The backend picks every track name and writes the record to storage before making the media server call. A crash mid-call leaves a record with nothing behind it, never a track with no record.
- A record is dropped only after the forced close for it has returned.

**Checks, run on every request**

- To share: remembered device, access to the room, this tab present in that room, and no other live share of that kind by the member (otherwise it is a hand-over). The usage budget does not block sharing.
- To watch: remembered device, access to the room, this tab present in the room the share is live in, the share is live, and the usage budget is not at its stop. The browser names "this member's screen" or "this member's webcam"; the backend finds the sharer's connection and tracks in its own records.

**Cut-off: one routine, five scopes**

1. Change storage first (access removed, device forgotten, budget stopped), so any new request is refused from that instant.
2. Force-close the covered shares' tracks.
3. Force-close every other member's pulls of those shares.
4. Force-close the covered pulls.
5. Revoke relay credentials, where the scope says so.
6. Tell the affected tabs over the signaling connection, and close it where the device is gone.

| Event | Shares closed | Watching closed | Relay credential revoked |
|---|---|---|---|
| Removed from a room | theirs in that room | theirs in that room | no |
| Removed from the instance | all | all | all their devices' |
| Device forgotten | that device's | that device's | that device's |
| Usage budget stop | none | everyone's | no |
| Grace period ran out | that tab's | that tab's | no |

**Closing**

- Every close is forced, ordinary stops and clean leaves included. There is one close path and none that depends on a browser cooperating. The browser tidies its own side when told the share or watch has ended.
- When a forced close fails, the record is kept and the backend retries on a backoff (1s, 2s, 4s, up to 30s between tries) until it succeeds or the sweep shows the track gone. The owner's page shows the removal as done at once. If closes are still failing after 1 minute it warns: "Couldn't confirm that <name> was cut off. Still trying."
- Sweep: at each cut-off and after a backend restart, the backend asks the media server which tracks the affected connections really have (`GET sessions/{id}`) and force-closes anything its records do not account for. There is no timed sweep, to stay inside the free quota.
- A cut-off browser may keep an empty connection to the media server open. It carries no tracks and cannot gain any, so it is accepted and its record dropped.

**Hand-over**

- The backend registers the new share first, then closes the old one and moves each same-room viewer (close the old pull, create the new one). The new share's record marks it as replacing the old, the one case where a member briefly has two shares of a kind. If the new share fails to register, the old one carries on.

**Relay credentials**

- Every device gets one, since a browser cannot know beforehand whether it needs the relay. It is issued when a tab first creates its media connection, one per device, shared by that device's tabs.
- It lasts 24 hours. The backend hands a connected tab a fresh one before it expires.
- It is recorded by username and revoked only when the device is forgotten or the member is removed from the instance.
- Accepted exposure: a member who copies their credential out can relay unrelated traffic through the owner's account for up to 24 hours. The usage budget does not see it; it draws on the same 1,000 GB pool and is billed at $0.05 per GB beyond. Removing the member ends it, and the account billing alert is the backstop.
- [Quality proof](13-quality-proof.md) has one sample of a revoked credential: the relay kept flowing for about 2 minutes 20 seconds, then stopped. Removal does not depend on this, because the member's tracks are force-closed, which that ticket timed at under half a second.

**Glossary.** No change.

**ADR.** `docs/adr/0003-backend-is-the-only-gate-to-the-media-server.md`.

**Follow-ons.** Three measurements were added as a comment on [Quality proof](13-quality-proof.md). If a revoked relay credential turns out to keep working much longer than the one sample showed, the 24-hour life is reopened with the owner.

## Comments

**2026-11-16.** The "Relay credentials" section, step 5 of the cut-off routine and the table's last column are replaced by [Relay and credential life](23-relay-and-credential-life.md): a 12-hour credential per media connection, unrecorded, and no revocation.
