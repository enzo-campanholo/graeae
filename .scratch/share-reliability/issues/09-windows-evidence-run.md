# Windows evidence run on MONSTRAO

Type: task
Status: ready-for-human
Blocked by: 01, 03, 04, 05, 11
Map: ../map.md

## Question

Not a decision: the Windows facts that the tab-share fix, the codec choice and the audio loop wait on, gathered by an agent on the owner's Windows desktop (MONSTRAO) driving Chrome and Helium itself on the real GPU against `graeae-test`. The owner pastes a prompt and lets it run.

Waits for the owner to say MONSTRAO is free; this server cannot reach it. Until then it stays `ready-for-human`.

When unblocked, a session here writes the prompt into this file under **Prompt for MONSTRAO**, from the answers of Why a shared tab falls back to software encoding, A better codec at 12 Mbps and What window audio picks up on Windows, and Readings in the logs. The prompt must let that agent, alone:

- pull `v1-build` from origin and run what it needs (`scripts/real-media/` or its own Playwright), with an invite to `graeae-test` the session here makes;
- the tab encoder: share a tab, a window and a screen and record the capture size and encoder named for each, before and after resizing, and with the candidate fix;
- the codec candidate: what the research asks it to measure;
- the audio: the two-profile loop in Helium, and the watch-party case (share a Helium window with sound while watching another member's share with sound in the same graeae tab), read from audio levels or tones, not by ear;
- the upload estimate: a WebRTC event log from the owner's Chrome during a game share, with and without fix A from [Why Chrome's upload estimate sits low](02-upload-estimate-sits-low.md), and what Measure the upload estimate from this server could not show;
- push its findings to a branch `evidence/windows-<date>` with a short Markdown report, which a session here reads and links from the answer.

The owner's part: open the agent on MONSTRAO, paste the prompt, approve what it asks, and say when it is done.

## Prompt for MONSTRAO

The owner pastes this short message, with the six invite links the session here gives them in its reply (never in this file: an invite lets a browser in):

> You are on MONSTRAO, my Windows desktop. In the graeae repo, `git fetch origin` and check out `v1-build` at its latest. Read `.scratch/share-reliability/issues/09-windows-evidence-run.md`, the section "Instructions for the MONSTRAO agent", and carry it out alone; ask me only for what it says only I can do. The invites, one per member, each usable once: Win Chrome `<link>`, Win Watcher `<link>`, Win Firefox `<link>`, Helium One `<link>`, Helium Two `<link>`, Win Spare `<link>`.

### Instructions for the MONSTRAO agent

You gather Windows facts for decisions made on another machine, which has no GPU and cannot reach this one. You decide nothing and change nothing in graeae's code. Read first: this file's Question and Comments, then the answers of tickets 01, 03, 04, 11 and 02 in this folder, and the four research docs they name, with `git show research/<name>:docs/research/<file>.md` (the branches are on origin). Those docs say in detail what to measure; this section says how, here.

**The instance.** `https://graeae-test.cloudflare-item736.workers.dev`, on build `74cb885` (every change since is outside `src/`). The invites put each member in the room "Windows evidence", which nobody else is in. Shares there cost the owner's usage: keep each run as long as its check needs and no longer.

**Rules.**
- Never touch the owner's own browser profiles. Every browser you start gets its own user-data-dir; `member.ts` keeps them in `~/.cache/graeae-real-media/<label>`. Delete those you made at the end.
- Never write an invite address, a cookie or anything from `/setup` into a file you push. `member.ts` prints the invite address once on joining: drop those lines.
- Never share the entire screen while the owner may be using it; ask first. Prefer a window of `content.html`.
- Keep sound quiet (tones at a low output volume), and read sound from statistics and tone frequencies, never by ear.
- One member per browser on its own user-data-dir, except where the Helium checks below say otherwise.

**Tools.** Node and pnpm (`pnpm install` in the repo). `scripts/real-media/member.ts` (`pnpm real-media`; its header lists every option and command) drives one member in a real browser through Playwright:
- `GRAEAE_CHROMIUM=<path to chrome.exe or helium.exe>` picks the browser; without it, Playwright's own Chromium. Record each browser's exact version.
- `--pick <window title>` lets the picker choose a window by itself (`--auto-select-desktop-capture-source`; on Windows a Chrome window's title ends in " - Google Chrome"), `--pick tab:<title>` a tab.
- `content <kind> <title>` opens `content.html` (game, document, tone or portrait, and a tone in Hz) in a window of its own. Give it no size or place: those need `xdotool`, Linux only, as do `stopbar` and `desktop.sh`. Size the window another way if a check needs a size, or open `content.html?kind=game&title=<t>&fps=60&tone=<Hz>` yourself.
- `sample <ms>` then `unsample <file>` records every reading a check needs, one JSON a line: per connection the estimate (`availableOutgoingBitrate`), round trip and bytes; per sent picture the size, frame rate, target, `limitedBy`, `resolutionChanges`, encoder, `hardware` (`powerEfficientEncoder`), codec, key frames, `qpSum`, `encodeTime`, and `capture` (the track's surface, size, rate and label at that reading); per received stream frames decoded and received, dropped, freezes, size, rate, decoder, codec, and for sound `audioLevel` and `audioEnergy`. Sample every 1000 ms (250 ms around a start or a fall).
- Fixes, without touching graeae (`scripts/real-media/fixes.js`): `--start-bitrate 6000` (fix C), `--max-bitrate 20000` (fix A), `--degradation maintain-resolution`, `--content-hint <hint>`, and `--codec H264:6400` (offers H.264 high alone; it says in the console when the browser has none to send, and graeae's own codecs go out instead). `--chromium-arg` passes flags, such as `--webrtc-event-logging=<dir>` or `--force-fieldtrials=...`.
- The 720p step of ticket 01's fix 2, through `eval`: set every screen sender's `scaleResolutionDownBy` to 1.5 and back to 1 two seconds later:
  `eval (async (scale) => { const tracks = new Set(window.__realMedia.captures.filter((c) => c.method === "getDisplayMedia").map((c) => c.track)); for (const pc of window.__realMedia.connections) for (const s of pc.getSenders()) if (tracks.has(s.track) && s.track.kind === "video") { const p = s.getParameters(); for (const e of p.encodings) e.scaleResolutionDownBy = scale; await s.setParameters(p); } return scale; })(1.5)`
- Where `member.ts` cannot do a check (two profiles in one Helium, Firefox), write your own Playwright or Puppeteer script, reusing `page.js` and `fixes.js` as init scripts.
- `chrome://gpu` from each browser: save it as text.

**The members.** Win Chrome shares and Win Watcher watches, both in Chrome. Win Firefox watches in the installed Firefox, not Playwright's own build: drive it through WebDriver BiDi (Puppeteer with `browser: "firefox"` and its `executablePath`), or, failing that, ask the owner for the few clicks it needs. Helium One and Helium Two are two profiles of one Helium. Win Spare replaces any member whose invite goes wrong. If WSL is installed, a Linux Chromium watcher from it is welcome for the codec check; otherwise say it was not run.

**The checks**, in this order, each written up as soon as it is done:

1. **Fresh starts** (this file's comment from ticket 11). Win Chrome shares a 1600x900 or larger `content.html` game window, Win Watcher watching. 8 starts for each of three settings: as today; `--start-bitrate 6000`; `--degradation maintain-resolution`. A `reload` before each start, so each opens a new media connection. For each: the first frame's size and encoder, then size, encoder, `hardware`, bitrate and estimate at 10 s and 25 s.
2. **The tab encoder** (ticket 01's answer, "For the Windows evidence run"). 3 minutes or more each: a window, the entire screen (ask first) and a tab, as today; the tab while resized, with devtools opened, fullscreen, and switched away from and back; the tab with `--degradation maintain-resolution`; the same with the 720p step whenever the encoder reads software at 360 lines or more. At each turn to software, what came just before it: a size change, a height under 360, or nothing. Whether the size keeps falling in software. Which hardware encoder is named.
3. **The codec** (ticket 03's answer, "For the Windows evidence run"). Win Chrome shares with `--codec H264:6400`, then without, on the same game clip and a desktop scroll, 5 minutes each, Win Watcher and Win Firefox watching. The answer's codec and fmtp, encoder and `hardware`; at each watcher, frames decoded and per second, freezes, key frames, dropped frames, decoder; `qpSum / framesEncoded` and encode time, high against baseline; a fast-scene screenshot of each at the watcher; whether CABAC and the 8x8 transform are on (the doc says how to read them from the PPS; say so if you could not); and whether a 144 fps `content.html` game holds its frame rate with high.
4. **Window audio** (ticket 04's answer, "For the Windows evidence run"). Helium One and Helium Two in one Helium process, as the doc sets out. The audio track's `capture.label` for a tab, a window and the entire screen, in Helium and in Chrome. Which tones each window share carries. The two-profile loop, how long it outlives its source, graeae's mute stopping it, a separate user-data-dir not looping, a second same-profile graeae tab looping. The watch party: Helium One shares a Helium window with a tone while watching Win Chrome's share of a 523 Hz tone in the same graeae tab; whether 523 Hz reaches Win Watcher in Helium One's share. Note the Windows version and build.
5. **The upload estimate** (ticket 02's answer and ticket 11's "What this run could not show"). Win Chrome shares a game window for 10 minutes with `--chromium-arg=--webrtc-event-logging=<dir>`, then 10 minutes with `--max-bitrate 20000` as well, Win Watcher watching. Every fall in the estimate: whether a size change came with it, what the event log says it came from (delay, loss or a report from the media server), and how long it took to come back to 12 Mbps. Any freeze or padding at the watcher under fix A. If the owner is at the machine and willing, the same with a real game they play for 10 minutes: offer it, never ask twice.

**The report.** On a branch `evidence/windows-<YYYY-MM-DD>` from `v1-build`, a file `docs/evidence/windows-<YYYY-MM-DD>.md`: MONSTRAO's GPU and driver, Windows version, each browser's version, then one section per check with a table of its readings and what it shows, and a closing list of what could not be done and why. Beside it, `docs/evidence/windows-<YYYY-MM-DD>/` with the readings files, the `chrome://gpu` texts and the screenshots, if under 50 MB in all (otherwise the readings only, and say so); never the event logs' raw files if over 20 MB. Push the branch; open no pull request. Then tell the owner, in one line, that it is pushed.

**Clean up.** Close every browser you started and delete the user-data-dirs you made. Leave the members on `graeae-test`: a session on the other machine removes them.

## Comments

**2026-11-22, from [Measure the upload estimate from this server](11-measure-upload-estimate.md).** The prompt should add the fresh-start check that [A share that opens small](13-a-share-that-opens-small.md) waits on.
- **The check.** 8 fresh starts of a game window share, each on a new media connection (a reload between). For each, record the first frame's size and encoder, and the size, encoder and bitrate after 10 and 25 s.
- **Three settings.** As today; with `x-google-start-bitrate=6000`; and with "maintain-resolution". `scripts/real-media/member.ts` takes `--start-bitrate` and `--degradation` (`fixes.js`); the agent's own Playwright can copy `fixes.js`.
- **The point.** On this server, 8 of 8 starts as today opened at 480x270 and never grew. On Windows, a first frame under 360 lines goes to OpenH264 on purpose, so that may be the owner's 854x480 spells.
- **The event log should also say** whether the owner's falls come with a size change or without one.

**2026-11-22, the prompt written.** The owner said MONSTRAO is free. The prompt is above, under Prompt for MONSTRAO; the ticket stays `ready-for-human` until the agent there pushes its branch, and a session here then reads it, writes the answer and resolves this.
- **On `graeae-test`.** An owner device was made with `/setup` through `curl`, which forgot the owner's other devices there; the owner gets back in with `/setup#<secret>`. A room "Windows evidence" was made, and six invites into it only: Win Chrome, Win Watcher, Win Firefox, Helium One, Helium Two and Win Spare, given to the owner in chat, never written here. They work for 7 days. The other members, rooms and the pending invite were not touched. A throwaway "Probe C" was made and removed twice for the checks below.
- **`scripts/real-media/`.** `--codec <codec>` (`fixes.js`) offers one video codec instead of the page's own: `VP8`, `AV1` or `H264:<profile-level-id prefix>`. Checked here on the real media server: `VP8` and `H264:4200` were offered and answered as asked, and `H264:6400`, which Chromium on Linux cannot send, said so and left graeae's own baseline. The sampler (`page.js`) now also reads the height, `resolutionChanges`, `hardware`, codec, key frames, `qpSum`, `encodeTime` and the capture's surface, size, rate and label at each reading, and on what it receives the rate, key frames, decoder, codec and `audioLevel`/`audioEnergy`; checked on a share here.
- **When this resolves**, the members Win Chrome to Win Spare are removed in People, and the room "Windows evidence" with them if nothing else needs it.
