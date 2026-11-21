# What two tabs on one device do

Type: grilling
Status: open
Blocked by: 06
Map: ../map.md

## Question

Once graeae is one tab (The owner page and "You" as an overlay), two tabs of one member can still happen: the address opened twice, a forgotten tab. What should they do?

- **Both work** as the spec says today: each tab is present, and a share started in one while the same kind is live in the other is a hand-over. The failure Two tabs, and share starts run many times over finds is fixed as a bug.
- **One tab per device**, app-like: the newest tab takes over, and the older one shows that graeae is open in another tab, with a button to use it here.

A second graeae tab in the same browser also loops a shared window's sound back ([What window audio picks up on Windows](04-window-audio-on-windows.md)).

[Two tabs, and share starts run many times over](06-two-tabs-and-share-starts.md) could not make two tabs fail: hand-overs worked both ways, and the owner's 20 November logs hold no failed start, so ask the owner what they saw. The nearest failure it found: a tab with a share live is closed or reloaded, and a start comes from the other tab within about 10 s. That start is refused, and the tab cannot share again until it reloads. [Starting again after a reload](12-starting-again-after-a-reload.md) decides that fix.

Charting leaned to "both work" unless the cause makes that messy. Decide with the cause in hand, and whether any warning is needed at all (the map's Notes: a warning is the last resort).
