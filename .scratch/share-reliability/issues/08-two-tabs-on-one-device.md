# What two tabs on one device do

Type: grilling
Status: resolved
Blocked by: 06
Map: ../map.md

## Question

Once graeae is one tab (The owner page and "You" as an overlay), two tabs of one member can still happen: the address opened twice, a forgotten tab. What should they do?

- **Both work** as the spec says today: each tab is present, and a share started in one while the same kind is live in the other is a hand-over. The failure Two tabs, and share starts run many times over finds is fixed as a bug.
- **One tab per device**, app-like: the newest tab takes over, and the older one shows that graeae is open in another tab, with a button to use it here.

A second graeae tab in the same browser also loops a shared window's sound back ([What window audio picks up on Windows](04-window-audio-on-windows.md)).

[Two tabs, and share starts run many times over](06-two-tabs-and-share-starts.md) could not make two tabs fail: hand-overs worked both ways, and the owner's 20 November logs hold no failed start, so ask the owner what they saw. The nearest failure it found: a tab with a share live is closed or reloaded, and a start comes from the other tab within about 10 s. That start is refused, and the tab cannot share again until it reloads. [Starting again after a reload](12-starting-again-after-a-reload.md) decides that fix.

Charting leaned to "both work" unless the cause makes that messy. Decide with the cause in hand, and whether any warning is needed at all (the map's Notes: a warning is the last resort).

## Answer

Resolved with the owner on 2026-11-21.

**Both work, as the spec says today; nothing changes.** Each tab is present, the member is listed once, and a share started in one tab while the same kind is live in the other is a hand-over. One tab per device was ruled out: it breaks user story 25 (present in two rooms on two tabs), adds a mechanism and a screen state, and nothing found says two tabs are broken. Seam 1 already covers two tabs of one browser (`test/presence.test.ts`, "is present once…"; `test/handover.test.ts`, the second tab on Bia's laptop).

**No warning for a second tab.** The one harm a second graeae tab does is the sound loop of [What window audio picks up on Windows](04-window-audio-on-windows.md), and only when a window of the sharing browser itself is shared. Any other tab with sound loops the same way, so a two-tab warning would name one cause of several. It is a testing hazard (two profiles of one browser), left to the fog's "where the two-profile loop is written down".

**The owner's failure of 2026-11-20 is not found, and not chased.** It happened before the logs: the owner says nothing of it was captured. The window [Two tabs, and share starts run many times over](06-two-tabs-and-share-starts.md) read as the owner's evening (Windows Chrome 158, owner page, home, entire screen, from 12:54 UTC, just after ticket 48's own check from 12:51 to 12:53) was an agent trying to reproduce it, and it did not fail. Left because:
- [The owner page and "You" open over the page under them](../../v1-build/issues/50-owner-and-you-as-an-overlay.md) removes the usual way to two tabs at the stage;
- every refused or failed start now writes `share.refused` or `share.failed` with its reason, so a repeat is one log pull away: the owner says when, and an agent pulls that window;
- the nearest mechanism found, a reload or close with a share live and a start from the other tab within 10 s, is fixed by [Starting again after a reload](12-starting-again-after-a-reload.md), whose build ticket tests that case from two tabs of one member.

Nothing is added to `scripts/owner-checks.sh`. No build ticket comes from this one.

**Ruled out of scope:** a forgotten tab that keeps watching keeps pulling and counting usage. One forgotten tab does that today too; it is about usage, not about sharing or watching at full quality.
