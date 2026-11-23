# 56: A long-watching tab stops receiving new shares

**Status:** ready-for-human (built and deployed; until ticket 55's check 7 on MONSTRAO watches 32 shares on one connection)

**Blocked by:** none

**What was seen:** in ticket 55's Windows run (2026-11-23, `evidence/windows-2026-11-23`, `docs/evidence/windows-2026-11-23/audio-*`), Win Watcher stayed on one media connection through about 27 shares in "Windows evidence". Those were ticket 55's checks 2, 3, 4 and 6, then a Chrome tab share with audio. Each share left an audio and a video inbound stream on that connection (mids up to 53), and each was received. After that, it received nothing from the next three shares: a Chrome window share, a Helium tab share and a Helium window share. In each, the sender's `outbound-rtp` audio and video advanced (about 104 kB of Opus and 2 MB of video in 25 s), but none of the watcher's inbound streams advanced and no new one appeared. After a reload of the watcher, each repeat was received at once, on a connection holding one audio and one video stream.

**Not yet known:** whether this is graeae or the agent's harness. For example, a watch command may never have been sent, or may have gone to a stale tile. The watcher's readings files hold only stats, so they cannot tell these apart. The instance's and tabs' log lines for the window can: Win Watcher's `watch.*` and media-server calls around `at` 1795437146342 (the Chrome window trial), and the two Helium trials after it. Workers Logs keeps them for 3 days only, until about 2026-11-26, so pull them (CLAUDE.md, Logs) before then.

**If it is graeae:** see whether it follows the count of streams on one connection, the time the connection has been open, or a stream that ended without being removed.

## Comments

### 2026-11-23: diagnosed from the logs, and fixed

**It is graeae.** The logs are pulled into `.logs/graeae-test-1795432000000-1795438500000.jsonl`: 7,334 lines, with `at` from 11:37 to 12:36 UTC. Win Watcher's media connection keeps the media sections of every pull. When a pull ends, its sections stay on the connection, inactive, and the media server gives each new pull new mids rather than reusing them. So the answer grew about 2,340 bytes a share: 62,411 bytes at 52 sections, 64,751 at 54 (the Chrome tab share with audio, answered), and 67,091 at 56 (the Helium tab share). `checkRequest` passed on no SDP over `SDP_MAX`, 64 KiB, and the instance ignored a request it did not pass without writing a line. It wrote the `ws.in` at 1795437117501, then nothing: no `renegotiate`, and no `media.answered`.

Of the ticket's three options, it is the streams that ended without being removed, through the count of sections they leave on one connection. It is not the time the connection had been open: shares up to 19 minutes in were answered, and the failure falls exactly at 65,536 bytes.

On the tab, `negotiate` runs one negotiation at a time, and the answer's `request` waits for `answered` with no end. Every later negotiation queued behind it:
- the Chrome window share's `watch.asked` (1795437146757) never went out on the socket;
- the Helium window share was never asked for at all. The Helium tab share stayed in the tab's `asking`, since its negotiation never finished, and `watch` returns early for a share already in `asking` (the same member and kind);
- Win Chrome's webcam (`watch.asked` 1795437202022) never went out either.

A reload made a new connection of two sections, and each repeat was received at once. So the cause was not the harness.

**Fix.** `SDP_MAX` is now 900 KiB, about 390 shares on one connection. It is graeae's own bound on a tab gone wrong. A Durable Object's socket takes 32 MiB in a message (developers.cloudflare.com/durable-objects/platform/limits/), not the 1 MiB first assumed here from `MAX_BATCH_BYTES`'s comment, which is now corrected. The media server states no limit on tracks in a session (developers.cloudflare.com/realtime/sfu/limits/). A media restart's offer grows the same way and is checked by the same limit.

A request the instance does not understand is now logged as `request.not-understood`, with its name (`<area>.<type>`, or null), and listed in `src/shared/log.ts`. That name comes from `requestNameOf` in `requests.ts`, which `checkRequest` now uses too. The tab's negotiations stay one at a time, with no timeout (owner's call).

**Tests.**
- `test/watching.test.ts` checks that a watcher's answer the size of one after some 200 shares (468,004 bytes) is answered, and reaches the media server.
- `test/logs.test.ts`, under the instance's own lines, checks that a request with bad fields, one with an unknown name and one with no name each leave a `request.not-understood` line.
- Both failed before the fix. An answer of the exact 67,091 bytes went from red to green.
- Typecheck passes, and lint passes on `src` and `test`. All 481 tests pass.

**Retro (2026-11-23).**
- The fake media client's offers and answers are now the size a real tab's are, a section of some 1,170 bytes for each mid the connection has used, so they grow with each share watched as a real tab's do.
- A browser journey in `test/browser/screen.spec.ts` has one tab watch 32 shares in turn on one connection. With `SDP_MAX` back at 64 KiB it fails with "share 28 could not be watched"; with the fix it passes.
- The earlier counts were of the Workers tests only; `pnpm test` runs the browser journeys too. CLAUDE.md now says so.

**Review.**
- The Standards axis asked for the log test to sit under the instance's own lines, for the event to have its own bullet and a name that does not reuse "refused" (which elsewhere means an access check), and for one source of a request's name. All three are done.
- The Spec axis found that 1000 KiB left too little room for JSON escaping (now 900 KiB), a wrong time span, and the Helium window share and the webcam left unexplained. All three are fixed above.

**Deployed.** `graeae-test` runs `b2a396c` as version `4a371c09` (2026-11-23).

**Left.** Checking it on real media: one tab watching 30 or more shares on one connection on `graeae-test`. If an evening ever outgrows about 390 shares on one connection, the next step is for the tab to rebuild its connection, which needs a ticket of its own.
