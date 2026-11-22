# Where the two-profile loop is written down

Type: grilling
Status: open
Blocked by: none
Map: ../map.md

## Question

Where, if anywhere, does graeae tell the people testing it that a sharer and a watcher in the same browser loop a shared window's sound?

[What window audio picks up on Windows](04-window-audio-on-windows.md) found the mechanism and [Windows evidence run on MONSTRAO](09-windows-evidence-run.md) confirmed it on Windows 11 with Chromium 158: sharing a window of the browser that also holds a watching graeae tab, in another profile or the same one, sends that tab's sound back out, and the tone outlived its source for as long as it was measured (32.6 s). graeae's mute on the watching tab stops it; a sharer and watcher on separate user-data-dirs, or separate browsers, never loop. [What two tabs on one device do](08-two-tabs-on-one-device.md) ruled out a warning to members and left this as a testing hazard.

Candidates: the README's testing notes, `scripts/real-media/`'s header, the owner's checks in `scripts/owner-checks.sh`, or nowhere. The smallest place that the people who hit it (the owner, testers, agents driving two members on one machine) would actually read wins. Decide, and write the build ticket if it is anything but nowhere.
