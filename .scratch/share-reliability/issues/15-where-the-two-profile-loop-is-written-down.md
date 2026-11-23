# Where the two-profile loop is written down

Type: grilling
Status: resolved
Blocked by: none
Map: ../map.md

## Question

Where, if anywhere, does graeae tell the people testing it that a sharer and a watcher in the same browser loop a shared window's sound?

[What window audio picks up on Windows](04-window-audio-on-windows.md) found the mechanism and [Windows evidence run on MONSTRAO](09-windows-evidence-run.md) confirmed it on Windows 11 with Chromium 158: sharing a window of the browser that also holds a watching graeae tab, in another profile or the same one, sends that tab's sound back out, and the tone outlived its source for as long as it was measured (32.6 s). graeae's mute on the watching tab stops it; a sharer and watcher on separate user-data-dirs, or separate browsers, never loop. [What two tabs on one device do](08-two-tabs-on-one-device.md) ruled out a warning to members and left this as a testing hazard.

Candidates: the README's testing notes, `scripts/real-media/`'s header, the owner's checks in `scripts/owner-checks.sh`, or nowhere. The smallest place that the people who hit it (the owner, testers, agents driving two members on one machine) would actually read wins. Decide, and write the build ticket if it is anything but nowhere.

## Answer

One sentence in `CLAUDE.md`, under "Working in the repo", carried as a checkbox on [Screen audio only from a tab or one application](../../v1-build/issues/52-screen-audio-only-from-a-tab-or-application.md); no build ticket of its own, and nothing in the README or the scripts.

- `CLAUDE.md` is the one place every agent reads, the MONSTRAO agent included (it pulls `v1-build`), and the owner too; the README's "Working on graeae" section points there, and the rest of the README is for people running an instance.
- `scripts/owner-checks.sh` cannot loop: every Windows step that shares and listens puts the watcher in a second browser (Brave or Zen), and the Linux member is a separate Chromium.
- `scripts/real-media/` cannot loop: each member has its own profile (`~/.cache/graeae-real-media/<label>`), and Linux Chromium has no window audio.
- Nowhere was weighed: the people who hit it know it now, but the next agent driving two members in one Windows browser would find it again the hard way, and the sentence costs nothing.

The sentence:

> Sharing a window of a browser that also holds a watching graeae tab (another profile or the same one) sends that tab's sound back out, and it loops until the watching tab is muted. To share and watch on one Windows machine, use two browsers, as `scripts/owner-checks.sh` does.
