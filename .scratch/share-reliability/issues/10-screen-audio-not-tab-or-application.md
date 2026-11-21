# Screen audio that is not the tab's or the application's

Type: grilling
Status: open
Blocked by: 09
Map: ../map.md

## Question

What should a screen share do when the browser hands it audio that is neither a tab's nor one application's?

[What window audio picks up on Windows](04-window-audio-on-windows.md) found that a window share falls back to the whole system's sound on Windows 10, and on Windows 11 with Chromium 142 to 145 (minus graeae's tab there). The whole system's sound holds the Discord voices, so it echoes them back to their owners. The glossary says screen audio is "never the whole system's sound", and [Screen audio offer](../../v1/issues/07-screen-audio-offer.md) decided such shares are video only. Windows 10 is not a supported platform, but it is never blocked.

The candidate, the smallest one: the page sends a captured audio track only when it is a tab's or one application's (Chromium names them in the track's label, "Application Audio" for a window, per the research) and drops any other, so the share goes out video only, as decided. Settle whether that is the rule, whether the label is reliable enough to read (the Windows evidence run checks the labels), and whether the sharer is told anything (the map's Notes: a warning is the last resort).
