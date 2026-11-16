# graeae v1

Label: wayfinder:map

## Destination

A v1 spec at `.scratch/v1/spec.md` for a private, open-source web app that lets a small friend group share screens (video and audio) and webcams with each other alongside their Discord voice channel. The spec locks product shape, architecture and hosting, and is ready to slice into implementation issues. The map ends at the spec; building is a separate effort.

## Notes

**Domain.** Browser real-time media (WebRTC, screen and audio capture), free-tier hosting, small-group access control.

**Skills.** Every grilling ticket calls `grilling` and `domain-modeling`. Research tickets call `research`. Prototype tickets call `prototype`.

**Targets set while charting.**

- Group: usually 4 people, sometimes 6. Design ceiling of 8.
- Screens: 1080p at 60fps, with 720p at 60fps as the floor on a weak uplink. Smooth motion matters more than sharpness.
- Webcams: 720p at 30fps.
- Simultaneous screens: 3 required, 4 wanted so everyone on a usual call can share at once.
- Uplink: assume every member has at least 20 Mbps of upload.
- Speed of entry: once set up, a member opens the URL with no login screen and is watching or sharing in a few clicks and under 15 seconds.
- Watching is opt-in per stream, and a viewer can watch several at once (someone's screen plus their webcam, or everyone's webcams).
- The app must work when the owner is not present.

**Scope boundary.** graeae carries screen video, screen audio and webcam video. Discord keeps voice and text. No microphone.

**Platforms.** The focus is Windows on Chromium-based browsers and Firefox. Nobody in the group is on macOS or Linux today; sharing at least a browser tab there would be welcome, and fuller support depends on how hard it turns out to be.

**Standing preferences.**

- License: 0BSD.
- UI: Svelte with shadcn-svelte, dropping down to Bits UI where shadcn-svelte lacks something.
- Cost: free is the aim, not a hard rule. Any non-zero cost is the user's decision, so bring it to them with the number. About one dollar a month is acceptable in principle.
- Browser-first. A desktop helper is considered only if the browser provably cannot do what is wanted and the helper would strongly improve the experience. Bring that decision to the user with its trade-offs.
- Hosting: the domain is registered and managed at Cloudflare and the account is on the free Workers plan.
- Open source: deployable by others from the README with nothing hardcoded, and no support promise.
- Subagents: use Haiku, Sonnet or Opus 5.5 by task complexity. Use Fable 5.2 only when necessary.

**Vocabulary.** Use the terms in `GLOSSARY.md` at the repo root: instance, owner, member, device, display name, room, access, present, share, screen share, screen audio, webcam share, watch, stage, invite, setup secret, usage, usage budget.

## Decisions so far

<!-- one line per closed ticket: gist, then the link -->

- [Audio capture capabilities](issues/01-audio-capture-capabilities.md): Chromium on Windows 11 shares a tab's audio or a single application's audio natively; no browser can share the desktop minus Discord, which only a desktop helper could add; Firefox captures no screen audio at all.
- [App hosting on free tiers](issues/04-app-hosting-on-free-tiers.md): the Cloudflare free plan fits the app, signaling and state with wide headroom; a plain Svelte single-page app deploys as one Worker, while SvelteKit currently needs a second Worker for the Durable Object.
- [Remembered-device access](issues/05-remembered-device-access.md): an invite link that sets a long-lived cookie is the only option that stays silent for months; passkeys always show a dialog, Cloudflare Access caps sessions at 1 month, and Discord sign-in still relies on the app's own cookie.
- [Media transport options](issues/03-media-transport-options.md): direct browser-to-browser exceeds the 20 Mbps upload floor; Cloudflare's media server is free to 1,000 GB a month (about 34 hours at the example load) and $39 a month at 60 hours; a self-hosted server on Oracle's free tier is $0 with the most upkeep.
- [Capture and encoding quality](issues/02-capture-and-encoding-quality.md): Chromium on Windows can reach 1080p60 with hardware H.264 once the app overrides several defaults; Firefox encodes in software and cannot capture screen audio, so a Firefox sharer is the weak case; all of it is unmeasured.
- [People and rooms](issues/06-people-and-rooms.md): one owner and equal members, each a person with remembered devices; several permanent rooms with access granted per room and the owner in all of them; members can share, watch and add their own devices with the owner absent.
- [Screen audio offer](issues/07-screen-audio-offer.md): browser-only, no desktop helper; Chromium sharers send a tab's audio or one application's audio, on by default; whole-screen shares and all Firefox shares are video-only; whole-system sound is never captured, so Discord voices are not echoed.
- [Media transport choice](issues/08-media-transport-choice.md): every share goes through Cloudflare's media server in the owner's account, with no direct mode; $0 expected at about 385 GB a month against 1,000 free; 4 simultaneous screens promised pending proof; graeae enforces its own usage budget because Cloudflare has no cap.
- [Platform promises](issues/09-platform-promises.md): Windows 11 on Chrome, Helium, Vivaldi or Brave is supported in full; Windows Firefox watches at parity but shares video-only with no quality promise; Chromium on macOS and Linux shares a tab with audio and is checked by hand; everything else, phones included, is never blocked and never tested.
- [Getting in](issues/10-getting-in.md): a single-use invite link with a one-button confirm page sets a cookie that keeps a device remembered for 400 days from its last visit; members add and forget their own devices; the owner re-invites after total loss; removal lands in about 2 seconds; a deploy-time setup secret makes and recovers the owner.
- [App hosting and framework](issues/11-app-hosting-and-framework.md): everything on Cloudflare's free plan as one Worker on one hostname; a plain Svelte single-page app built with Vite, not SvelteKit; one Durable Object per instance holds all state; a deployer needs no domain; free for a stranger pending the media server check.

- [Room experience](issues/12-room-experience.md): a left bar lists people beside a stage; clicking a name switches to that member and the icons on their row add single shares; one screen and one webcam per member; "Share screen" goes straight to the browser picker after a one-time notice; watched audio is mixed with per-share volume.
- [Media server access control](issues/16-media-server-access-control.md): only graeae's backend holds the media server secret, so every publish and pull is checked there; removal means force-closing each of the member's tracks and revoking their relay credential, since no call ends a whole session; how fast that lands is undocumented.
- [Cloudflare account check](issues/15-cloudflare-account-check.md): the media server needs a card on file but no paid plan; usage past 1,000 GB a month is billed automatically at $0.05 per GB, and that allowance is one pool shared with the relay; the application exists with its credentials in the owner's Proton Pass; a $10 account billing alert is on by default.
- [Usage budget](issues/14-usage-budget.md): graeae counts the bytes viewers report receiving, charging the maximum bitrate for gaps; one owner-set monthly budget in GB, default the free 1,000, with an owner-set reset day; warnings at 80% and 95%, then all watching stops until the owner raises it or the month resets; it bounds watched media, not relay traffic graeae never sees.
- [Owner's admin surface](issues/17-owners-admin-surface.md): a separate owner page (People, Invites, Rooms, Usage) behind a gear, the room otherwise identical for everyone; one button creates an invite and copies its link; every removal asks in a modal that states the consequences; a member's own name and devices sit on a "You" page reached from their row and from the list of rooms.
- [Signaling and room state](issues/18-signaling-and-room-state.md): a member is present while a tab has the room open; a clean leave ends presence and shares at once, a lost connection gets a 30-second grace period with a "reconnecting" mark after about 10 seconds; shares and watching survive drops and backend restarts; one screen and one webcam share per member across the instance, with viewers carried over on a hand-over.
- [Deploy story](issues/19-deploy-story.md): five required secrets and no other settings, filled into one local file and uploaded by `pnpm run deploy`; the dashboard work is a card, a media server application and a relay key; updates are `git pull` to a tagged release with automatic forward-only migrations; no backup; the README states $0 expected, a card required and no support.
- [Media layer records and relay credentials](issues/20-media-layer-records-and-relay-credentials.md): one media connection per tab, with every share and watch recorded before the media server is called; one cut-off routine covers removal, a forgotten device, the budget stop and an expired grace period; every close is forced and retried until confirmed; each device gets a 24-hour relay credential, revoked when the device or member goes.
- [Quality proof](issues/13-quality-proof.md): the transport stands; a Chromium sharer delivers 1080p60 at 12 Mbps with hardware H.264 on both machines tested (an RTX 5070 Ti and an RTX 5060 Ti, the second logged as a GTX 980 by mistake), and Firefox decodes it; one member needs the relay, which carries it; a forced close stops a picture in under half a second, while revoking a relay credential does not cut anything off; 4 screens is accepted on the owner's judgement, not measured; the usage count read 6 to 8% low.
- [Quality adaptation](issues/22-quality-adaptation.md): a Chromium screen share goes out at two qualities, 1080p60 at 12 Mbps and 720p60 at 4 Mbps, in hardware H.264, so a weak viewer drops alone; Firefox sends one VP9 stream at 1080p30 and webcams one at 720p30 and 1.5 Mbps; a weak sharer loses resolution before frame rate and a share is never ended for quality; two qualities still needs the owner's solo check; usage at the estimate rises to about 547 GB.
- [Relay and credential life](issues/23-relay-and-credential-life.md): the relay is always offered; each media connection gets its own unrecorded 12-hour credential, renewed at 11 hours by a connection restart for a tab on the relay; revocation is never called, so a removed device keeps the relay for at most 12 hours with only the billing alert behind it; relayed watching stays counted twice with no other relay allowance. Replaces the relay part of Media layer records and relay credentials.
- [Usage count accuracy](issues/24-usage-count-accuracy.md): each tab reports the running total of its connection's transport bytes received, so nothing is skipped at the start; the backend adds a fixed 5% and charges the maximum bitrate only after a tab's last report; relayed watching stays doubled; one comparison against Cloudflare's Analytics tab on the built app (pass at 0 to 10% above) is required before the figure is trusted, and it also settles the doubling.

## Not yet specified

Nothing. [spec.md](../v1-build/spec.md) is assembled and lives with its build tickets in `.scratch/v1-build/`, with the manual check list for macOS and Linux and the build-time usage comparison under its Verification heading. [Remaining browser checks](issues/21-remaining-browser-checks.md) stays open and does not block it.

## Out of scope

- Voice and microphone: Discord keeps voice, and replacing it would be a separate effort.
- Text chat: Discord covers it.
- Recording.
- Notifications when someone goes live: the group is already in a voice channel.
- Remote control of a shared screen.
- Sharing from a phone.
- Public sign-up: members are let in by the owner.
- A "Deploy to Cloudflare" button: v1 documents the command line only; the spec notes the button as a later addition that v1 must not rule out. See [Deploy story](issues/19-deploy-story.md).
- Desktop helper, and with it desktop audio minus Discord: ruled out in [Screen audio offer](issues/07-screen-audio-offer.md), since the browser covers tab and single-application audio.
