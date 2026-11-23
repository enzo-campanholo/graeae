# 56: A long-watching tab stops receiving new shares

**Status:** needs-triage

**Blocked by:** none

**What was seen:** in ticket 55's Windows run (2026-11-23, `evidence/windows-2026-11-23`, `docs/evidence/windows-2026-11-23/audio-*`), Win Watcher stayed on one media connection through about 27 shares in "Windows evidence". Those were ticket 55's checks 2, 3, 4 and 6, then a Chrome tab share with audio. Each share left an audio and a video inbound stream on that connection (mids up to 53), and each was received. After that, it received nothing from the next three shares: a Chrome window share, a Helium tab share and a Helium window share. In each, the sender's `outbound-rtp` audio and video advanced (about 104 kB of Opus and 2 MB of video in 25 s), but none of the watcher's inbound streams advanced and no new one appeared. After a reload of the watcher, each repeat was received at once, on a connection holding one audio and one video stream.

**Not yet known:** whether this is graeae or the agent's harness. For example, a watch command may never have been sent, or may have gone to a stale tile. The watcher's readings files hold only stats, so they cannot tell these apart. The instance's and tabs' log lines for the window can: Win Watcher's `watch.*` and media-server calls around `at` 1795437146342 (the Chrome window trial), and the two Helium trials after it. Workers Logs keeps them for 3 days only, until about 2026-11-26, so pull them (CLAUDE.md, Logs) before then.

**If it is graeae:** see whether it follows the count of streams on one connection, the time the connection has been open, or a stream that ended without being removed.

## Comments
