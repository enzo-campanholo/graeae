# Quality proof

Type: prototype
Status: resolved
Blocked by: 08, 15
Map: ../map.md

## Question

Does the transport chosen in [Media transport choice](08-media-transport-choice.md) deliver 1080p 60fps gameplay between the group's real machines while a game is running?

Build the smallest throwaway page that shares a screen over the chosen transport, and test it with the user and at least one friend, ideally one on Firefox.

It has to answer:

- The resolution, frame rate and bitrate actually received, measured from the browser's own statistics, while the sharer plays a demanding game.
- The effect on the sharer's game performance.
- Whether Chromium to Firefox and Firefox to Chromium both work at that quality.
- Whether the result holds with 3 screens shared at once, and with 4. 4 is the promise; if a viewer cannot decode three other 1080p60 screens smoothly, it drops to 3.
- Whether Cloudflare's media server passes 8 to 15 Mbps at 1080p60 untouched, and whether any member needs the relay to connect.
- Whether single-application audio from [Screen audio offer](07-screen-audio-offer.md) works for a game in exclusive fullscreen, a game started through a launcher, and on each of Helium, Vivaldi and Brave. A failure adds a caveat to the spec; it does not reopen that decision.
- From [Platform promises](09-platform-promises.md): whether Helium, Vivaldi and Brave each reach 1080p60 with hardware H.264 at their default settings. A browser that fails drops from Supported to Limited with its gap named.
- What a Firefox sharer actually delivers while a game runs. No quality is promised there, so this is a measurement, not a pass or fail.
- Whether a game in exclusive fullscreen freezes in the capture. If it does not, the borderless-mode caveat is dropped.
- From [Media server access control](16-media-server-access-control.md): how long a forced track close takes to stop a viewer's picture, and whether revoking a relay credential cuts a relay already in use. Removal promises about 2 seconds; Cloudflare documents no figure.
- From [Usage budget](14-usage-budget.md): after the friend session, compare the bytes viewers received (the `recv` rows in the log) with the egress on the media server's Analytics tab for the same period, and note whether relayed watching shows up on both the media server and the relay. graeae's count must not read more than 5% below Cloudflare's.

If the proof fails, reopen the transport decision with what was learned.

## Comments

**2026-11-16, prototype built, not yet run on real machines.**

- The prototype is on the branch `prototype/quality-proof` (worktree `~/.t3/worktrees/graeae/prototype-quality-proof`), in `prototype/quality-proof/`. `./run.sh` deploys it as a Worker named `graeae-quality-proof` and prints a link with an access key; `./run.sh delete` removes it.
- It is one page: share a screen with a chosen codec and bitrate, watch any live share, and read the browser's statistics every 2 seconds. Every browser's statistics are logged centrally and "Download log" returns them as JSON. The page carries the test plan, one step per item in the question.
- The backend routes were checked on a local dev server. Publishing and watching through the media server have not been exercised: that needs the application secret and real browsers.
- The relay tests need a TURN key, which does not exist yet (dashboard, Realtime, TURN Server). Without one the relay controls stay disabled and those two items stay open.
- One difference from the v1 design: each share and each watched share uses its own connection, where v1 will likely use one connection per member.

**2026-11-16, first results, one machine (the owner's), not yet with a friend.**

Machine: Windows 11 26H2 (build 26300), GeForce RTX 5070 Ti, 144 Hz monitor, Persona 5 Royal holding 120 fps. Sharer on Chrome 157 and Helium 0.21.3.1 (Chromium 157); viewers on Chrome 157 and Firefox 159 on the same machine. Prototype deployed as the Worker `graeae-quality-proof`; raw figures are in its log. Research behind the two explanations: `docs/research/capture-rate-and-hardware-encode.md` on the branch `research/capture-rate` (commit `38002b1`).

- **Capture rate follows the monitor.** At 144 Hz the browser captures 48 fps whatever rate the page asks for (60, 72 and 120 all gave 48), for a window and for the whole screen, in Chrome and Helium, even with no connection at all. At 120 Hz it captures a steady 60 (59 to 61). Cause, per the research: Windows 11 24H2 and later will not deliver captured frames less than 16 ms apart and Chrome 157 never changes that, so a 144 Hz display yields every third refresh. A fix is under review upstream. The page should ask for more than 60 (120 was used) and cap the sender at 60.
- **Hardware H.264 needs the right profile.** Constrained baseline (`42e01f`) is always software (OpenH264) in Chrome on Windows. Main, high and plain baseline (`42001f`) are hardware encoded on this GPU. Offering only main and high gave the NVIDIA encoder at about 2 to 5 ms per frame. "Browser default" negotiated VP8 in software.
- **Cloudflare's media server passed it.** 1920x1080 at 60 fps and about 11 to 12 Mbps was sent with 0% loss; the bitrate cap of 12 Mbps was reached and forwarded intact to viewers.
- **Chrome and Firefox both decode the high-profile share** at 60 fps with no freezes and no dropped frames (measured at 1026x800, the game windowed). The media server describes the track to viewers as constrained baseline while forwarding high profile unchanged. It works; it is undocumented.
- **Application audio** was captured from the game's window in Helium ("Application Audio", about 32 kbps). Nobody listened to it yet.
- **Forced close lands in under half a second.** Four timings from click to last frame shown: 467, 433 and 383 ms cutting the sharer, 400 ms cutting one viewer. The sharer's browser keeps encoding and sending afterwards, unaware.
- **Relay.** No relay was needed on this network. Forced through the relay, a viewer still got 60 fps at about 12 Mbps with no freezes. After the relay credential was revoked the picture kept flowing for about 2 minutes 20 seconds and then stopped (one sample; the page's own timer misfired, so this is read from the statistics).
- **Game impact.** None seen. The game stayed locked at its 120 fps cap while sharing, with software encoding and with the NVIDIA hardware encoder (the owner's observation, saved as notes in the log). A capped game on a high-end GPU has headroom, so this does not show the cost on a weaker machine.

Still open, all needing a second machine or a friend: a viewer of a full 1080p share, 3 and 4 screens at once, application audio heard by a viewer (exclusive fullscreen, a launcher game), Vivaldi and Brave as sharers, a Firefox sharer, exclusive fullscreen capture, and whether any member needs the relay.

**2026-11-16, handoff: paused until a friend is available. Any session can resume this ticket when the owner names it.**

- **Status stays `claimed`** so other sessions skip it. It is waiting on the owner, not being worked.
- **The prototype is still deployed** as the Worker `graeae-quality-proof` on the owner's `workers.dev` subdomain. The owner has the link. The access key is in `prototype/quality-proof/.access-key` in the worktree `~/.t3/worktrees/graeae/prototype-quality-proof` (not committed).
- **Reading results.** Every browser posts its statistics every 2 seconds. `GET <worker url>/api/log?k=<key>` returns all rows as JSON; each has `kind` (`send`, `recv`, `share-start`, `watch-start`, `stop-timing`, `diagnose`, `note`), `name`, `browser`, `run` and a timestamp. `POST /api/log-clear` wipes it. The owner does not need to send files.
- **Changing the page.** Edit `public/index.html` or `src/worker.js`, commit on `prototype/quality-proof`, and ask the owner to run `./run.sh` in that folder (this machine has no Cloudflare login the agent can use; the owner logs in from their terminal). No Node is installed: use `nix shell nixpkgs#nodejs_22`.
- **Settings that work on the owner's machine:** monitor at 120 Hz, codec "H.264 main/high (hardware)", "Frame rate" 120.
- **Known flaw in the page.** The stop timer ("picture stopped N ms after the click") misfires if the watching tab is not visible. Check any timing against the `recv` rows.
- **What a friend session must cover** is the "Still open" list above. Ask each friend for their monitor's refresh rate, their GPU (the "Diagnose this machine" button records it) and their game's fps before and while sharing.
- **Added by [Media layer records and relay credentials](20-media-layer-records-and-relay-credentials.md), three more things to measure:** relay revocation repeated a few times (the one sample was about 2 minutes 20 seconds), plus whether a revoked credential can open a new relay; whether Cloudflare ever tears down a cut-off connection with no tracks left, and whether packets a cut-off sharer keeps sending are dropped; whether `GET sessions/{id}` shows a forced close immediately, since the sweep and the retry after a failed close rely on it.
- **When done:** write the `## Answer`, set `Status: resolved`, add the line to the map's Decisions so far, graduate the fog patches that waited on this ticket (Quality adaptation, Connectivity, the timing part of Securing the media layer), and ask the owner to run `./run.sh delete`.

**2026-11-16, friend session starting. Page extended first (commit `89d4aa3` on `prototype/quality-proof`), syntax-checked only, needs `./run.sh` to go live.**

- Watch tiles on a relay gain "Probe relay with this credential": it tries to open a new relay with the tile's credential and logs a `relay-probe` row (`relayCandidates`, `errors`). Press it before and after revoking.
- "Cut at source" and "Cut my watching" now ask the media server for the session's state straight after the close; the answer is in the `stop-timing` row as `sessionAfter`.
- `GET <worker url>/api/sessions?k=<key>` returns the media server's state for every live share, every watch and every session cut since the Worker last restarted, with `cutSecondsAgo`.
- `send` and `recv` rows carry `conn` (the connection state) and, per interval, `rtpBytes` (payload plus RTP headers) and `transportRecvBytes` / `transportSentBytes`, for the usage comparison.
- The log was not cleared: the one-machine rows are still in it. Separate the friend session by timestamp.

**2026-11-16, friend session, 16:12 to 16:47 UTC. Partial: the ticket stays open.**

Two people. The owner on Helium (RTX 5070 Ti, monitor at 144 Hz). The friend on a GeForce GTX 980 with a 180 Hz monitor, first in Zen 1.24.1b (Firefox based), then in a browser reporting itself as plain "Chromium 153". No "Test run" was set, so runs are told apart by time. No game fps notes were saved. Figures are from the Worker's log.

- **A Chromium sharer on a ten-year-old GPU reaches the target.** The friend's Chromium share: 1920x1080 at 57 to 60 fps, 11 to 12 Mbps, NVIDIA hardware H.264 high profile at about 5 ms per frame. The owner received 1080p at 58 fps (10th percentile 52), 2 frames dropped in 2.5 minutes. With the bitrate cap at 20 Mbps the sender peaked at 22.5 and the viewer received up to 22 Mbps, so the media server passes 20 Mbps too.
- **The friend's Chromium only ever connected through the relay over TCP**, including on the first share where "Force relay" was off. Their Zen on the same machine connected directly over UDP. So one member's browser already needs the relay, and the relay over TCP carried 1080p60 at 12 Mbps. Why that browser cannot use UDP is not known (a privacy setting in that Chromium build is the likely cause; ask).
- **The owner's shares ran at 48 fps, not 60**: the monitor was at 144 Hz and the page asked for 60, the known capture limit. The settings that give 60 (monitor at 120 Hz, "Frame rate" 120) were not used.
- **The friend's capture is not held to 60.** With 144 fps asked their Chromium captured and sent up to 124 to 131 fps. Capping the sender at 60 is needed for more than the owner's machine.
- **Firefox (Zen) as viewer of a full 1080p share:** 1920x1080 at 48 fps (all the sender gave), about 10 Mbps, no frames dropped, but 7 freezes totalling 9.6 seconds in 2 minutes 45 and 1,916 packets lost. The loss is between the media server and the friend, not at the sender (0% there). The same link pushed the owner's second share down to 720p for half of its 80 seconds.
- **Firefox (Zen) as sharer, game running, GTX 980:** H.264 negotiated constrained baseline in software, 1280x720 at 29 fps and about 3.7 Mbps, 20 ms per frame. VP9 gave 1920x1080 at 33 fps and about 4.8 Mbps. Capture itself ran at 30 to 35 fps. Upload loss reached 10 to 15%.
- **Application audio flowed both ways** (about 33 kbps, non-zero level at each viewer). Whether the viewer heard only the game is the testers' observation and is not recorded.
- **Forced close, five more timings:** 434, 443 and 281 ms cutting a viewer, 379 and 335 ms cutting the sharer. With the morning's four, nine samples between 281 and 467 ms.
- **The session's state shows a forced close at once.** Asked about 300 ms after each close, `GET sessions/{id}` already reported every closed track as `inactive`, all five times.
- **A cut-off sharer.** The browser stays "connected" and keeps capturing. With nothing acknowledging its packets, its bitrate falls on its own from 12 Mbps to about 0.02 Mbps within 30 seconds. Neither cut share was left open longer than 83 seconds, so whether Cloudflare ever tears the connection down is still open. Once the browser closed, the session answers 410 "Session appears to be disconnected".
- **Relay credential:** six probes with an unrevoked credential all opened relays (the control works). Revocation was never pressed, and the owner never watched through a forced relay.
- **graeae's count for the usage comparison:** viewers received 1,136 MB of RTP (payload plus headers) and 1,161 MB at the transport level between 16:12 and 16:47 UTC. Cloudflare's egress for the same period has not been read yet.

Still open: 3 and 4 screens at once; Vivaldi and Brave as sharers; exclusive fullscreen capture and audio; a launcher game's audio; relay revocation (three times, with the probe after); a cut share left open 5 minutes; the game's fps before and while sharing on the friend's machine; the owner's share at 60 fps to a friend; Cloudflare's egress figure; what the testers heard.

**2026-11-16, second look, 16:52 to 16:59 UTC, session still running.**

- **Owner's reports (not in the log):** a game in exclusive fullscreen did not freeze in the capture; each side heard only the game in the other's application audio; game fps was fine on both machines while sharing; the friend's browser is plain Chromium 153.
- **Three shares were live at once, but it does not prove 3 or 4 screens.** They were whole monitors showing mostly still content: one was 800x600 at about 1 fps, the others 0.3 to 0.4 Mbps on average. Each viewer watched two shares, never three, and received at most 6 Mbps in total. The 1080p60 decode load of 3 or 4 game streams was not exercised.
- **Relay revocation still not measured.** "Revoke" was pressed on two of the owner's tiles, but both were on a direct path (`srflx/udp`), so the picture rightly kept flowing; the logged stop times (59 s, 7.7 s) are the timer misreading near-still shares. A probe 16 seconds before the second revoke worked; no probe after it.
- **Usage, first comparison (dashboard read at 16:45 UTC, last 24 hours):** Cloudflare shows 1.89 GB egress and 2.67 GB ingress. The log up to 16:45 gives about 1.71 GB received as RTP (1.75 GB at the transport level) and about 2.62 GB sent as payload. Ingress agrees within 2%. Egress reads 8 to 10% below Cloudflare's, outside the 5% allowed. Known gaps in the page's count: the first 2 seconds of every watch are skipped, and padding sent by the media server is not in `bytesReceived`. Repeat with final totals after the session.

**2026-11-16, 17:00 to 17:13 UTC: relay revocation and cut-off, measured.**

- **Revoking a relay credential does not cut a relay in use at once, and the delay varies.** Clean sample (owner's Chrome watching the owner's own moving share over `relay/udp`): revoked at about 17:08:36, picture ran at 57 fps until 17:09:44 and then stopped dead, 68 seconds later; the connection failed 16 seconds after that. The morning's sample was about 2 minutes 20. A third (Helium, revoked about 17:00:07) dropped after 4 minutes 37, but the share it watched had been cut at source meanwhile, so it only shows the relay outlived 75 seconds of picture.
- **A revoked credential kept opening new relays.** Every probe after a revocation succeeded with 8 to 10 relay addresses: 45 to 55 seconds after, 4 minutes after (Helium), and 2 minutes 45 to 4 minutes 10 after (Chrome, on the credential whose relay had already died). No probe was ever refused. Revocation cannot be relied on to keep a removed device off the relay.
- **Relay over UDP carries the share.** The owner's Helium watching its own share through `relay/udp` received 1080p at up to 12.9 Mbps.
- **Forced close, tenth timing:** 455 ms cutting the sharer while the viewer was on the relay; session state showed it at once.
- **Cut-off sharer, longer run.** The friend's cut share stayed "connected" for 2 minutes 32, then failed, but every connection in that browser dropped in the same second, so it does not show Cloudflare tearing a cut connection down. By 4 minutes 39 after the cut the session answered 410.
- **Owner's decision:** the three-screen run is accepted as evidence for 3 to 4 screens; no heavier run will be done. The log shows two near-still streams per viewer, so this rests on what the testers saw.

**2026-11-16, usage comparison, dashboard read at about 17:15 UTC (last 24 hours).**

- Cloudflare: 2.41 GB egress, 2.92 GB ingress. The log to the same moment: 2.20 GB received as payload, about 2.23 GB with RTP headers, about 2.27 GB at the transport level; 2.91 GB sent as payload.
- Ingress agrees within 1%. Egress reads 6% (transport level) to 8% (RTP) below Cloudflare's, so the page's count misses the 5% limit.
- The page skips the first 2 seconds of each of 29 watches, worth roughly 3% at these bitrates. Counting from the first interval at the transport level would probably land inside 5%. That is an estimate, not a measurement.
- The relay's own traffic was not read from the dashboard.

## Answer

**The proof passes. The transport stands.** Cloudflare's media server delivers 1080p at 60 fps and 12 Mbps between the group's real machines with a game running. Measured on 2026-11-16 by the owner (RTX 5070 Ti) and one friend (GTX 980); the dated comments above hold the figures.

Item by item:

- **Received quality.** A Chromium sharer with hardware H.264 sent 1920x1080 at 57 to 60 fps and 11 to 12 Mbps; the viewer received 1080p at 58 fps with 2 dropped frames in 2.5 minutes. This held on a ten-year-old GPU at about 5 ms per frame.
- **Game performance.** No drop seen on either machine (the testers' observation; no figures saved for the friend's).
- **Chromium and Firefox.** Chromium to Firefox works at full quality: Firefox decodes the high-profile 1080p share with no dropped frames. Firefox to Chromium works at Firefox's own quality (next item).
- **Firefox sharer (a measurement, not a promise).** On the GTX 980 with a game running: H.264 is software constrained baseline at 1280x720 and 29 fps; VP9 gives 1920x1080 at 33 fps. About 4 to 5 Mbps either way.
- **3 and 4 screens. Accepted by the owner, not measured.** Three shares ran at once and looked fine, but each viewer watched two near-still streams totalling 6 Mbps at most. The decode load of 3 or 4 game streams at 1080p60 was never applied. The spec keeps 4 as the promise on the owner's judgement and says it is unproven.
- **Cloudflare passes the bitrate.** 12 Mbps was forwarded intact, and 20 Mbps too (22 Mbps received).
- **The relay is needed.** The friend's Chromium 153 only ever connected through the relay over TCP, while their Firefox-based browser on the same machine connected directly. The relay carried 1080p60 at 12 Mbps over TCP and 1080p at up to 12.9 Mbps over UDP. Every device must be given relay credentials.
- **Application audio.** Captured and heard on both sides, game only, including from a game in exclusive fullscreen (the owner's report). Not tried: a game confirmed to be started through a launcher, and Vivaldi and Brave.
- **Helium, Vivaldi, Brave.** Helium reaches 1080p60 with hardware H.264 at default settings. Vivaldi and Brave were not tested and stay Supported provisionally; see [Remaining browser checks](21-remaining-browser-checks.md).
- **Exclusive fullscreen** did not freeze in the capture (the owner's report). The borderless-mode caveat is dropped.
- **Forced close.** Ten timings, 281 to 467 ms from the call to the last frame shown, for sharers and viewers, direct and relayed. Removal's 2 seconds holds with room to spare. `GET sessions/{id}` shows the closed tracks as `inactive` within about 300 ms, every time.
- **Relay revocation is not a cut-off.** A relay in use ran on for 68 seconds in one clean sample and about 2 minutes 20 in another. A revoked credential still opened new relays every time it was tried, up to 4 minutes 10 later. Removal rests on the forced close alone.
- **A cut-off sharer** stays "connected" and keeps capturing, but its bitrate collapses to about 0.02 Mbps within 30 seconds. Whether Cloudflare ever tears the connection down, and whether it drops those packets, was not established.
- **Usage count.** Ingress matches Cloudflare within 1%. Egress as the page counts it reads 6 to 8% below, outside the 5% limit.

Found along the way, and binding on the spec:

- **Capture rate follows the monitor.** On Windows 11 24H2 and later a 144 Hz display captures at 48 fps and a 120 Hz display at 60, whatever is asked. The friend's machine captured up to 131 fps when asked for 144. So the app asks for more than 60 and caps the sender at 60, and a sharer on a 144 Hz monitor gets 48 fps until the upstream fix ships.
- **Hardware H.264 needs main or high profile.** Constrained baseline is software in Chrome on Windows, and the browser's default negotiates VP8 in software. The app must offer only main and high.
- **The media server labels the track as constrained baseline to viewers** while forwarding high profile unchanged. It works in Chromium and Firefox and is undocumented.
- **A viewer's own link is the weak point.** The friend's downlink lost packets (7 freezes in under 3 minutes in Firefox) and pushed a share to 720p, with 0% loss at the sender.

Not done, and where each went: Vivaldi, Brave and a launcher game's audio in [Remaining browser checks](21-remaining-browser-checks.md); the usage shortfall in [Usage count accuracy](24-usage-count-accuracy.md); the relay findings in [Relay and credential life](23-relay-and-credential-life.md); bitrate, codec and frame-rate rules in [Quality adaptation](22-quality-adaptation.md).

The prototype stays deployed as the Worker `graeae-quality-proof` until Remaining browser checks is done; then `./run.sh delete`.

## Comments after resolution

**2026-11-16, correction from the owner, raised in [Quality adaptation](22-quality-adaptation.md): the friend's GPU is a GeForce RTX 5060 Ti, not a GTX 980.**

- The prototype's "Diagnose this machine" reads the GPU name from WebGL. Firefox-based browsers deliberately report a generic name there, and for recent NVIDIA cards that name is "GeForce GTX 980, or similar". The friend's first diagnosis was taken in Zen, so the log recorded the stand-in. This cause is the likely one and was not re-checked against the log.
- Read every "GTX 980" and "ten-year-old GPU" above as the RTX 5060 Ti. The measurements stand; what they prove changes:
  - Hardware H.264 at 1080p60 is proven on two recent NVIDIA cards. It is not proven on an old or weak GPU.
  - The Firefox sharer's figures (720p at 29 fps in H.264, 1080p at 33 fps in VP9) come from a current machine, so they are not a weak-hardware result.
  - The effect of sharing on a game is still unmeasured on a weak machine.
