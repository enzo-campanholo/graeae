# 23: Usage count and the owner's meter

**What to build:** graeae counts usage, and the owner sees it on the owner page: GB used this month, the usage budget and the projected month-end figure, with a small meter in the owner page's navigation. The owner sets the day of the month on which usage resets.

Spec: [Usage and the usage budget](../spec.md#usage-and-the-usage-budget), [Other pages](../spec.md#other-pages) (Usage).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 12, 17

**Status:** ready-for-agent

- [ ] Each tab with a media connection reports, every few seconds over the signaling connection, the running total of bytes its media connection's transport has received since it opened
- [ ] The backend charges the difference between reports, so a lost report is made up by the next and nothing is skipped at the start
- [ ] A tab sends a final total before a connection restart, and the total starting again from zero is handled
- [ ] The backend adds a fixed 5% to every reported byte; it is a constant, not a setting
- [ ] Where no later total arrives, the backend charges each watched share's maximum bitrate (12, 6 or 1.5 Mbps) from the last report until it records the watch as ended
- [ ] A tab reports whether its media connection is on the relay, and relayed watching is counted twice; the doubling can be switched off in one place
- [ ] A sharer's upload is not counted
- [ ] The month resets on the owner's day of the month, in UTC, default 1
- [ ] Usage section: the meter with GB used, the usage budget (1,000 GB until ticket 24 makes it settable) and the projected month-end figure (the month so far, extended at the same daily rate), and the reset-day setting
- [ ] A small meter stays visible in the owner page's navigation
- [ ] Members see nothing about usage
- [ ] Seam 1 tests for every counting rule with controlled time; Seam 2 for the meter
