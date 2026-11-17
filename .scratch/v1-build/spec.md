# graeae v1

Status: ready-for-agent
Map: [map.md](../v1/map.md)
Tickets: [issues/](issues/), numbered in dependency order

This spec assembles the 24 decisions on the map. Where two tickets disagree, the later one wins, and the "Superseded along the way" list under Further Notes says which. Terms are the ones in the glossary at the repo root.

## Problem Statement

A group of friends, usually 4 and sometimes 6, spends its evenings in a Discord voice channel and wants to show each other their games and their faces while they talk. Discord's own screen sharing does not give them what they want: smooth 1080p at 60 fps, several screens live at once, and the freedom to watch one friend's screen beside another's webcam.

They do not want another service to sign in to. Whatever replaces Discord's sharing has to open from a link with no login screen and be showing a share within a few clicks and 15 seconds, and it has to work on the nights the person who set it up is not there.

The person who sets it up wants to pay nothing, wants to be certain no surprise bill can arrive, and wants to hand the code to anyone else who would like the same thing for their own friends.

## Solution

graeae is a private, open-source (0BSD) web app. An owner deploys one instance to their own Cloudflare account on the free plan and lets friends in with single-use invites. Each friend's browser is remembered as a device for 400 days from its last visit, so afterwards opening the address is all it takes.

An instance has permanent rooms. In a room, a bar on the left lists people and a stage fills the rest. A member shares a screen (with the sound of the tab or application shared, where the browser can capture it) and a webcam. Other present members choose what to watch: click a name to watch that member, or click single icons to combine shares from several members. Discord keeps voice and text; graeae never touches a microphone.

Every share travels through Cloudflare's media server in the owner's account. A Chromium screen share is sent at 1080p60 on the sharer's hardware encoder. A second, 720p60 quality for viewers on a weak link is built but switched off, since the media server freezes it ([ticket 29](issues/29-two-qualities-as-two-tracks.md)). graeae counts usage itself and stops all watching when it reaches the owner's usage budget, which defaults to Cloudflare's free 1,000 GB a month, so the expected cost is $0.

## User Stories

### Getting in

1. As an invited person, I want to open an invite and press one button, "Join as <display name>", so that I am in my room without creating an account.
2. As an invited person, I want only the button press to use up the invite, so that a chat app's link preview cannot burn it before I open it.
3. As an invited person, I want to land straight in my room after joining, so that I am watching within seconds of the first click.
4. As a member, I want my device remembered for 400 days from my last visit, so that I never see a login screen while I keep using graeae.
5. As a member, I want every visit to renew that period, so that a device I use never expires.
6. As a member with access to one room, I want the instance's root address to take me straight into it, so that I pick nothing.
7. As a member with access to several rooms, I want a list of my rooms showing who is present and how many shares are live in each, so that I can choose where to go.
8. As a member, I want that list to update live without making me present anywhere, so that I can look before I enter.
9. As a member, I want to press "Add a device" on a remembered device and open a 10-minute invite on the new one, so that I add my laptop without asking the owner.
10. As a member, I want a list of my devices with browser, operating system and last use, so that I can recognise each one.
11. As a member, I want to forget any of my devices myself, so that a browser I no longer use loses its way in.
12. As a member who cleared their browser, I want to add it again from another of my devices, so that I am back without the owner.
13. As a member who lost every device, I want the owner to send me a fresh invite that keeps my display name and access, so that I return as the same person.
14. As a member who lost every device, I want that fresh invite to forget all my previous devices, so that a lost or stolen browser stops working.
15. As a member, I want to change my display name on a "You" page, so that I am shown by the name my friends use.
16. As a member, I want the "You" page reachable from my own row in the bar and from the list of rooms, so that I find it whether or not I am in a room.
17. As the owner, I want a visitor to get the same "nothing here" page for a room that does not exist, a room they have no access to, and a used, expired or cancelled invite, so that the instance reveals nothing about itself.

### The room

18. As a member, I want a bar listing present members first and then, dimmed, the members who have access but are not present, so that I see who is here and who could be.
19. As a member, I want each present member's row to show a screen icon and a webcam icon only while that share is live, so that I see at a glance what can be watched.
20. As a member, I want every present member's bar to show a new share the moment it is live, so that I never refresh.
21. As a member, I want the bar to collapse to a thin rail of initials that still switches to a member in one click and keeps the share buttons, so that the stage gets the room when I want it.
22. As a member with several rooms, I want a link back to the list of rooms in the bar's header beside the room's name, so that I can change rooms.
23. As a member, I want to be present in a room while any of my devices has it open, background and minimised tabs included, so that tabbing into my game does not make me vanish.
24. As a member, I want to be listed once however many devices I have the room open on, so that the bar shows people, not browsers.
25. As a member, I want to be present in two rooms at once on two tabs, so that I can follow both.
26. As a member, I want changes to names, rooms and access to reach me live, so that what I see is always current.

### Watching

27. As a member, I want nothing watched on arrival and a stage that says so and offers "Watch everything", so that I choose what uses my bandwidth.
28. As a viewer, I want to click a member's name and have the stage replaced by everything they share, so that one click watches a person.
29. As a viewer, I want to click a single screen or webcam icon to add that share to the stage or take it off, leaving the rest alone, so that I can watch one member's screen with another's webcam.
30. As a viewer, I want clicking the name of the member I am already watching alone to change nothing, so that clicking again to be sure never empties my stage.
31. As a viewer, I want shortcuts for all webcams, everything and nothing, so that the common combinations are one click.
32. As a viewer, I want watched shares laid out in an even grid that grows with their number, so that every share gets a fair size.
33. As a viewer, I want to focus one share so that it is large with the others in a strip beneath it, and to click one in the strip to focus that instead, so that I follow one share closely without losing the rest.
34. As a viewer, I want a fullscreen button on every watched share and double-click to do the same, so that I can fill my monitor.
35. As a viewer, I want controls on hover for mute, volume, hear only this one, focus, fullscreen and stop watching, so that everything about a share is on the share.
36. As a viewer, I want every watched share with screen audio to play at once, mixed, each with its own volume and mute, so that I balance them myself.
37. As a viewer, I want "hear only this one" to mute the others, so that I can pick one sound quickly.
38. As a viewer, I want the volume I set for a member remembered on that device, so that a loud friend stays turned down.
39. As a viewer, I want mute not to be remembered, so that I never return to a silent friend without knowing why.
40. As a viewer, I want a share with no audio labelled "video only", so that I do not wonder whether my sound is broken.
41. *(Switched off by build ticket 17, as are 42 and 43; ticket 29.)* As a viewer on a weak link, I want to receive a screen share at 720p60 by myself while the other viewers keep 1080p, so that my connection harms nobody else.
42. As a viewer, I want a choice of "Auto", "1080p" or "720p" on each watched screen share, so that I can ease the load on my machine or spend less usage.
43. As a viewer, I want a small "720p" mark on a share I am receiving at the lower quality, so that I know why it looks softer.
44. As a viewer, I want a share that is not watched to show no live picture anywhere, so that nothing is spent on thumbnails.
45. As a viewer on Firefox, I want to watch everything with screen audio exactly as a Chromium viewer does, so that my browser choice costs me nothing as a viewer.
46. As a member, I want to watch my own share from another of my devices without being listed as a viewer, so that I can check how it looks.

### Sharing

47. As a sharer, I want "Share screen" to go straight to the browser's picker, so that sharing a screen is 3 clicks.
48. As a sharer on a device for the first time, I want a short notice, once, that a tab or a game's window sends sound and a whole screen is video only, so that I pick the right thing.
49. As a sharer on Chromium, I want the sound of the tab or the single application I share sent along by default, so that my friends hear my game and not my Discord.
50. As a sharer, I want an audio on and off control on my own live screen share, so that I can go silent without stopping the share.
51. As a sharer, I want graeae's own sound always left out of what I capture, so that my friends never hear their own shares coming back.
52. As a sharer whose share ended up video only, I want one line beside my own share saying so, so that I know my friends hear nothing.
53. As a sharer on Firefox, I want the first-time notice to tell me that my screen share is video only, may be less smooth, and that a Chromium browser does better, so that I know before I start and am told only once.
54. As a sharer, I want "Share webcam" to start at once with no dialog, so that it is one click.
55. As a sharer, I want a small preview of each of my own shares at the foot of the bar, with the names of the members watching it and a stop button, so that I know what I am sending and to whom.
56. As a sharer, I want to be the only one who sees who is watching my share, so that watching stays unselfconscious for everyone else.
57. As a sharer with one share already live, I want starting the same kind of share on another device to offer to stop it there and share from here, so that I move machines without hunting for the old tab.
58. As a sharer who handed over, I want the old device to say "Now sharing from your other device", so that I know why it stopped.
59. As a viewer of a share that is handed over within the same room, I want to be carried over to the new share after a short gap, so that I do nothing.
60. As a sharer, I want my share to stop when I press stop, use the browser's own "stop sharing" bar, close the shared tab or window, or leave, so that every way of stopping works.
61. As a sharer on a 144 Hz monitor, I want a dismissible note on my own share when capture settles near 48 fps, telling me that 120 Hz gives 60, so that I can fix choppy motion.
62. As a sharer whose share is software encoded, I want a quiet note saying so, so that I understand a cost to my game.
63. *(The step-down and its note are switched off by build ticket 18; ticket 30.)* As a sharer on a weak upload, I want resolution to give way before frame rate and a dismissible note that my upload cannot carry 1080p, so that motion stays smooth and I know why it is softer.
64. As a sharer, I want graeae never to end my share for quality reasons, so that a bad minute does not cost me my viewers.
65. As a sharer on a larger monitor, I want my screen scaled down to 1080p, so that my upload stays inside 20 Mbps.

### Dropped connections

66. As a member whose connection drops, I want to stay present for a 30-second grace period with nothing torn down, so that a blip costs nothing.
67. As a member, I want my browser to reconnect by itself, so that I do nothing.
68. As a member, I want a small "reconnecting" mark on another member's name, or on their share's icon, after about 10 seconds of silence from them, so that I know what is going on without being alarmed by short drops.
69. As a viewer whose connection drops, I want the stage to keep playing and show "Reconnecting…" after about 3 seconds, so that I keep watching while it recovers.
70. As a viewer of a sharer whose connection dropped while their media still flows, I want to keep watching, and new viewers to be able to start, so that the sharer's blip is invisible.
71. As a viewer who returns after the grace period ran out, I want my stage restored to what I was watching where those shares are still live, so that I do not rebuild it.
72. As a sharer who returns after the grace period ran out, I want my share to start again by itself with no picker if my tab still holds the capture, so that I do not have to notice it stopped.
73. As a member, I want a graeae update or a Cloudflare restart during a session to show at most a "reconnecting" flicker, so that the owner can deploy without ruining the evening.

### The owner

74. As the owner, I want a gear in the bar's header and on the list of rooms that opens a separate owner page, so that administration is one place and the room stays the same for everyone.
75. As the owner, I want to type a display name, tick rooms and press "Create and copy link", so that an invite is on my clipboard ready to paste into Discord.
76. As the owner, I want pending invites listed with their rooms and expiry, each with copy and cancel, so that I can resend or withdraw one.
77. As the owner, I want an invited person to appear in no room until they press the button, so that an unanswered invite leaves no trace.
78. As the owner, I want a People section listing every member with their access to each room, device count and last visit, so that I see the whole instance.
79. As the owner, I want a member's access shown as one tick per room, so that granting and taking away access is one click and a confirm.
80. As the owner, I want every removal to ask in a modal that says whether the member is present, what they are sharing, that it stops within about 2 seconds, and which rooms they keep, so that I never remove someone by a stray click.
81. As the owner, I want removal from the instance to say that the member's devices are forgotten and that coming back takes a new invite, so that I know it is final.
82. As the owner, I want a removed member's shares and watching to stop within about 2 seconds on every device, and their page to become the plain "nothing here" page, so that removal is immediate and silent.
83. As the owner, I want to be warned if graeae could not confirm a cut-off after 1 minute, so that I know when removal may not have fully landed.
84. As the owner, I want to see and forget any member's devices, so that I can act on a report of a lost laptop.
85. As the owner, I want "Let back in" on a member, so that someone who lost every device gets a fresh invite in one press.
86. As the owner, I want to create rooms, rename them and see each room's fixed address, so that each friend group has a standing place whose link never breaks.
87. As the owner, I want access to every room and to be present like anyone else, so that I am a member and never a hidden watcher.
88. As the owner, I want every one of my devices to carry full owner powers, so that I administer from wherever I am.
89. As the owner, I want members to open rooms, watch, share and add their own devices while I am absent, so that the group does not depend on me being there.

### Usage and cost

90. As the owner, I want a meter showing GB used, the usage budget and the projected month-end figure, so that I see where the month is heading.
91. As the owner, I want to set the usage budget in GB with its dollar equivalent beside it, so that I know what any number above 1,000 could cost.
92. As the owner, I want raising the usage budget to take one confirm that names the maximum added cost, so that every dollar of exposure is my explicit choice.
93. As the owner, I want to set the day of the month on which usage resets, so that it matches my Cloudflare billing date.
94. As the owner, I want a warning strip above the stage at 80% of the usage budget that links to Usage, so that I can act before watching stops.
95. As a member, I want a warning at 95% of the usage budget, so that the stop does not come from nowhere.
96. As a member, I want the stage to say that the month's usage budget is used up and that the owner can raise it, so that I know watching stopped on purpose.
97. As a sharer, I want my shares to stay live through a usage budget stop, so that watching resumes the moment the owner raises the budget.
98. As the owner, I want usage that goes unreported charged at the share's maximum bitrate, so that a crashed tab can never make the count read low.
99. As the owner, I want the count to carry a 5% safety margin, so that it never reads below Cloudflare's own figure.

### Deploying

100. As a deployer, I want to go from an empty Cloudflare account to a working instance by following the README, so that I need no help.
101. As a deployer, I want the whole configuration to be five secrets in one local file, so that there is nothing else to get wrong.
102. As a deployer, I want a deploy with a missing secret to fail and name it, so that I am not left with a half-working instance.
103. As a deployer, I want to open the setup address with my setup secret and have that browser become the owner's first device with the first room created, so that setup is one visit.
104. As a deployer, I want graeae to run on the free `workers.dev` hostname with a custom hostname as an option, so that I need no domain.
105. As a deployer, I want to update with `git pull` to a tagged release and one deploy command, with migrations applied automatically, so that updating never loses my members.
106. As a deployer, I want the README to say that the expected cost is $0, that Cloudflare requires a card, what happens past 1,000 GB and that there is no support, so that I decide with the facts.
107. As the owner who lost every device or had one stolen, I want the setup secret to make a browser my device again and forget all my others, so that I can always get back in and lock a thief out.
108. As a deployer, I want the README to tell me how to rotate each secret and how to delete an instance, so that I can clean up.

### Platforms

109. As a member on Windows 11 with Chrome, Helium, Vivaldi or Brave, I want the full targets to hold, so that a failure is a bug someone fixes.
110. As a member on macOS or Linux with Chromium, I want to watch everything and to share a tab with its audio, a window or screen as video only, and a webcam, so that I can take part.
111. As a member on any other browser or a phone, I want never to be blocked, so that I get whatever my browser can do.

## Implementation Decisions

### Shape

- **One Cloudflare Worker on one hostname.** It serves the front end as static files, the HTTP API and the WebSocket, all on one origin, so the device cookie is first-party. Everything runs on Cloudflare's free plan in the same account as the media server. (ADR 0001, ADR 0002.)
- **One repository, one package, TypeScript on both sides.** One build produces the static front end and the Worker. One command runs the whole thing locally. Socket message types are shared between front end and backend by plain imports.
- **Front end.** A plain Svelte single-page app built with Vite, with its own small client-side router. Components come from shadcn-svelte, dropping down to Bits UI where shadcn-svelte lacks something. Not SvelteKit.
- **State.** One Durable Object per instance holds everything. Members, devices, rooms, access, invites, usage and the owner's settings are in its built-in SQLite. Who is present lives in its hibernating WebSocket connections. Live shares, watching and media connection records are written to its storage, so they survive a restart. No D1 and no KV.
- **Media.** Every share goes through Cloudflare Realtime SFU in the owner's account. There is no direct browser-to-browser mode. Cloudflare's TURN relay is offered to every media connection.
- **Design.** Every page is built with the impeccable skill, working from a `PRODUCT.md` and a `DESIGN.md` at the repo root. The owner sets the visual direction; shadcn-svelte is themed from it.
- **License.** 0BSD. Nothing is hardcoded to the owner's instance.

### Modules

Four deep modules carry the design. Each is described by what it does, not where it lives.

- **Instance.** The Durable Object. It owns the people-and-rooms rules (members, devices, invites, access), the room state (presence, live shares, who watches what), the cut-off routine and usage counting. Its interface is the HTTP routes and the socket protocol; nothing else reaches its storage.
- **Media layer.** The single seam between the instance and whatever media server is in use. The instance asks it to make a media connection, publish a share's tracks, pull a share's tracks for a viewer, change a viewer's quality, force-close named tracks, report which tracks a connection really has, and mint a relay credential. v1 builds one implementation, for Cloudflare. A self-hosted media server, or reading Cloudflare's own usage figure, would be added behind this seam later.
- **Room client.** The browser's side of the socket: it holds the full room state the backend sends, applies changes, sends heartbeats and byte reports, and reconnects by itself.
- **Media client.** The browser's side of media: capture (screen, screen audio, webcam), the tab's one media connection, the encoding rules, quality step-down, and the statistics the usage count and the sharer's notes are driven by.

### People, devices and invites

- An instance has exactly one owner, made by the setup secret and not transferable in the app. The owner is also a member. Everyone else is a member, all equal.
- A member has one display name, first set by the owner in the invite and changeable by the member. No avatar, no profile.
- A device is remembered by a long-lived cookie set when an invite is used, and by nothing else. No passkeys, no Discord sign-in, no Cloudflare Access.
- A device stays remembered for 400 days from its last visit, renewed on every visit. It is forgotten by disuse, by the member or the owner forgetting it, or by removal of the member from the instance.
- The instance records each device's browser, operating system and last use, for the device lists.
- An invite is single-use and for one named person. Opening it shows a page with one button; only the press uses it up, remembers the device and, for a new person, makes them a member.
- The owner's invite carries the display name and the rooms to grant and lasts 7 days. It can be cancelled before use. Until it is used it is visible to the owner alone.
- A member's "Add a device" invite lasts 10 minutes. There is no approval step on the old device, no limit on devices and no QR code.
- "Let back in" is an owner's 7-day invite for an existing member. Using it forgets all that member's previous devices and keeps their display name and access.
- A used, expired or cancelled invite, a room that does not exist, a room the visitor has no access to and the setup address without the right secret all give the same "nothing here" page.

### The setup secret

- The setup address is `/setup#<secret>`. The part after `#` is never sent in the request; the page sends it to the backend itself.
- On a fresh instance, using it makes that browser the owner's first device and creates the first room.
- Using it again later makes that browser an owner device and forgets all the owner's other devices.
- An instance whose setup secret is missing or shorter than 32 characters refuses setup entirely.
- A setup page shown to someone holding the setup secret names any other missing secret, as a backstop to the deploy check.

### Rooms and access

- An instance has several rooms. Each has a name the owner can change and an address fixed at creation.
- Access is granted per room. New members get access to the first room unless the owner's invite says otherwise. The owner has access to every room.
- A room is permanent and always open. Inside it a member sees every member with access, not only those present.
- The design ceiling is 8 members present in one room at once. Access lists and the number of rooms are not limited.
- With the owner absent, members can open their rooms, watch, share and manage their own devices. Admitting and removing members and creating and renaming rooms wait for the owner.

### Presence and the signaling connection

- Each open tab holds one WebSocket to the instance and says which room it is showing. The list of rooms at the root address holds a connection too, updates live, and makes the member present nowhere.
- The backend is the single source of truth. A browser gets the full room state on connecting and on every reconnect, then changes as they happen. Nothing is replayed.
- The browser sends a heartbeat every 5 seconds. There is no idle detection.
- A clean leave (tab closed, reload, navigating away) ends that tab's presence at once, along with any share it was sending.
- A lost connection gets a grace period of 30 seconds from the last heartbeat heard. During it the member stays present and nothing is torn down.
- A page that reconnects within its grace period is the same tab, with its shares, watching and media connection, even while the backend still holds the old connection open, as it does after most real network drops. A page opened afresh (a reload, the tab opened again) is a new tab.
- After about 10 seconds of silence, other members see a "reconnecting" mark: on the member's name when they have no connected device left in the room, on a share's icon when the lost device is the one sending it. A second device dropping while another stays connected shows nothing.
- When a grace period runs out, the backend closes that tab's shares and watching.
- A backend restart treats everyone as in their grace period. Shares and watching survive it.
- Removal and the usage budget stop apply during a grace period exactly as otherwise.

### Shares

- A share is live from the moment the backend has registered it with the media server.
- One screen share and one webcam share per member across the whole instance, not per room and not per device.
- Starting a share of a kind that is already live offers a hand-over. The backend registers the new share first, then closes the old one and moves each viewer in the same room (close the old pull, create the new one). If the new share fails to register, the old one carries on. A hand-over into a different room ends the share in the first room and carries nobody.
- A sharer who returns after their grace period ran out has the share start again by itself if the tab still holds the capture, unless they started it from another device meanwhile. Their previous viewers are not carried over, since for them the share ended.
- A screen share is video together with its screen audio as one unit. A webcam share is video only.
- If media falters while the signaling connection is fine, the share stays live for 30 seconds while the browser tries to recover, then ends. Once the browser gives the media connection up, the tab restarts it through the backend, and again after each restart that finds no path, until it recovers or the 30 seconds run out.
- Watching belongs to a device, since each device has its own stage. A watching member is named to the sharer once however many devices they watch on.

### Screen audio

| Shared surface | Chromium on Windows 11 | Firefox |
|---|---|---|
| Tab | The tab's audio | Video only |
| Window | Only that application's audio | Video only |
| Whole screen | Video only | Video only |

- The whole system's sound is never captured, on any platform.
- graeae asks the browser's picker to have its audio checkbox ticked. graeae has no audio toggle of its own before the picker; the sharer's own live share has an audio on and off control.
- The sharing page's own audio is always excluded from a capture, with no setting.
- Screen audio is sent in stereo with echo cancellation, noise suppression and automatic gain switched off.
- Sharing Discord itself with audio would echo voices. That is left to the sharer: no detection, no warning, no block.

### Encoding and quality

All numbers are fixed. Neither the sharer nor the owner gets a setting.

| Share | Qualities | Codec | Maximum bitrate |
|---|---|---|---|
| Chromium screen share | 1080p at 60 fps (720p at 60 fps as well, switched off) | H.264 baseline profile (`42001f`) | 12 Mbps (and 4 Mbps) |
| Firefox screen share | 1080p at 30 fps | VP9 | 6 Mbps |
| Webcam share | 720p at 30 fps | Same rule as a Chromium screen share | 1.5 Mbps |

- **Hardware encoding.** Chrome on Windows hardware encodes H.264 baseline, main and high profile (Quality proof; baseline and high again in ticket 17); constrained baseline (`42e01f`) and the browser's default choice (VP8) are software. On a share sent at two qualities the media server answers main and high with VP8, and given every H.264 profile it picks constrained baseline; offered baseline (`42001f`) alone, it takes it, and both qualities stay on the hardware encoder (ticket 17, measured on the owner's RTX 5070 Ti). Firefox decodes baseline and cannot decode main or high. The media server also picks its own favourite among the codecs offered, whatever their order: offered baseline and VP8, it answers VP8. So a browser offers the first codec of the plan it has, alone: H.264 baseline, or VP8 on a browser without it, so that a share always starts. A Firefox screen share offers VP9 alone.
- **One codec per share.** Every share uses a codec both Chromium and Firefox decode. Never HEVC, and no per-viewer codec choice.
- **Frame rate.** Capture is asked for 120 fps and the sender is limited to 60. Capture follows the monitor's refresh rate on Windows 11 (48 fps at 144 Hz, 60 at 120 Hz, over 120 on some machines), so both halves are needed.
- **Two qualities are switched off** (`TWO_QUALITIES` in `src/shared/encoding.ts`), so every Chromium screen share is one 1080p60 quality at 12 Mbps, with no quality choice and no "720p" mark. Two qualities are two encodes sent as simulcast. The owner's check on Cloudflare (ticket 17) kept both on the hardware encoder with the game's frame rate unchanged, but a viewer of the 720p quality of an H.264 share froze for about half the time, in Chromium and Firefox alike, while 1080p and VP8's 720p did not. Ticket 29 tries two tracks of one quality each.
- **With two qualities on,** a viewer on a weak link is stepped down to 720p60 by the media server, alone, and the viewer's "Auto / 1080p / 720p" choice sets the preferred quality on the media server mid-watch. The sharer tells the instance it sends two qualities when it starts the share, so the instance's side stays tested while the switch is off.
- **Every share has a single quality** while the switch is off, so a weak viewer can pull one down for everyone. Accepted.
- **A sharer on a weak upload.** The share scales down to 720p60 (with two qualities, the 1080p quality stops first and every viewer gets 720p60). If that does not fit, frame rate drops to 30. Below 720p30 the browser degrades as it sees fit. The browser has no setting for a resolution floor, so the media client watches the share's statistics and steps it down itself. Bitrate, frame rate and scale are changed on the live share without renegotiating.
- **The step-down is switched off** (`STEP_DOWN` in `src/app/lib/media/sending.ts`), and with it the note that the upload cannot carry 1080p: the browser alone gives up what it must, resolution first. The owner's check on Cloudflare (ticket 18) found the browser's estimate of the upload at 5 to 10 Mbps for minutes on a 288 Mbps upload, with nothing lost, reading the same as under a 10 Mbps cap, so every step down and every note was false. Left alone, Chrome also scales a game share below 720 lines in spells of 15 to 60 seconds, and encodes it in software there. Ticket 30 looks for a sign that tells a weak upload apart.
- **Upload budget.** 12 + 1.5 = 13.5 Mbps for a screen and a webcam (17.5 with two qualities), inside the assumed 20 Mbps floor.

### Media connections and records

- Each tab with a room open holds one media connection, used for both what it shares and what it watches. It is made the first time that tab shares or watches, not on opening the room.
- Only the backend talks to the media server, and only it holds the media server secret. A browser never receives or sends a media server identifier: it asks for "this member's screen" or "this member's webcam" and the backend builds the pull from its own records. (ADR 0003.)
- The backend records, per media connection: device, room and the media server's identifier for it. Per share: member, device, room, kind, its video track and, for screen audio, its audio track. Per watch: the viewing device's media connection, the share watched and the pulled tracks.
- The backend picks every track name and writes the record to storage before calling the media server. A crash mid-call leaves a record with nothing behind it, never a track with no record.
- A record is dropped only after the forced close for it has returned.

### Checks on every request

- **To share:** a remembered device, access to the room, this tab present in that room, and no other live share of that kind by the member (otherwise it is a hand-over). The usage budget does not block sharing.
- **To watch:** a remembered device, access to the room, this tab present in the room the share is live in, the share is live, and the usage budget is not at its stop.

### Cut-off

One routine serves every case:

1. Change storage first (access removed, device forgotten, budget stopped), so any new request is refused from that instant.
2. Force-close the covered shares' tracks.
3. Force-close every other member's pulls of those shares.
4. Force-close the covered pulls.
5. Tell the affected tabs over the signaling connection, and close it where the device is gone.

| Event | Shares closed | Watching closed |
|---|---|---|
| Removed from a room | Theirs in that room | Theirs in that room |
| Removed from the instance | All of theirs | All of theirs |
| Device forgotten | That device's | That device's |
| Usage budget stop | None | Everyone's |
| Grace period ran out | That tab's | That tab's |

- Every close is forced, ordinary stops and clean leaves included. There is one close path and none that depends on a browser cooperating. The browser tidies its own side when told a share or watch has ended.
- A failed forced close keeps its record and is retried on a backoff (1s, 2s, 4s, up to 30s between tries) until it succeeds or a sweep shows the track gone.
- The owner's page shows a removal as done at once. If closes are still failing after 1 minute it warns: "Couldn't confirm that <name> was cut off. Still trying."
- **Sweep.** At each cut-off and after a backend restart, the backend asks the media server which tracks the affected media connections really have and force-closes anything its records do not account for. There is no timed sweep.
- A cut-off browser may keep an empty media connection open. It carries no tracks and cannot gain any, so it is left alone and its record dropped.
- Removal from the instance also forgets all the member's devices. A removed or forgotten device's page becomes the plain "nothing here" page with no message.
- Measured: a forced close stops a picture 281 to 467 ms after the call (ten timings, sharers and viewers, direct and relayed), and the media server reports the closed tracks within about 300 ms.

### Relay

- Every media connection is offered the relay from the start, over UDP, TCP and TLS. The browser picks a direct path when one works. One member's browser is known to connect only through the relay.
- The backend mints a fresh relay credential each time a tab makes its media connection and keeps no record of it. Nothing is shared between tabs or devices.
- A credential lasts 12 hours. At 11 hours a tab on a direct path is silently handed a fresh one; a tab on the relay gets a connection restart with the fresh one, falling back to the ordinary reconnect path if the restart fails.
- Revocation is never called. The forced close is the only cut-off; expiry is the only end of a credential.
- Accepted exposure: until its credential expires, a removed device can relay unrelated traffic through the owner's account, drawing on the shared 1,000 GB and then $0.05 per GB. It cannot share, watch or reach the media server. The defences are expiry and the owner's Cloudflare billing alert.

### Usage and the usage budget

- **What is counted.** Each tab reports, every few seconds over the signaling connection, the running total of bytes its media connection's transport has received since it opened. The backend charges the difference between reports, so nothing is skipped at the start and a lost report is made up by the next. A tab sends a final total before a connection restart, which resets the total.
- **Safety margin.** The backend adds a fixed 5% to every reported byte. It is a constant, not a setting.
- **Gaps.** Where no later total arrives (a closed or crashed tab), the backend charges each watched share's maximum bitrate from the last report until it records the watch as ended: 12 Mbps for a Chromium screen share, 6 for a Firefox one, 1.5 for a webcam.
- **Relayed watching** is counted twice, pending the comparison under Verification.
- **Not counted.** A sharer's upload, which Cloudflare does not bill. Usage is per media connection; there is no per-share or per-member breakdown.
- **The budget.** One number for the instance in GB per month, default 1,000, set by the owner in the app with the dollar equivalent beside it ($0.05 per GB past 1,000). No upper limit, no per-room or per-member quota.
- **The month** resets on a day of the month the owner sets, in UTC, default 1.
- **Warnings.** The owner at 80%, everyone present at 95%, as a strip above the stage. graeae never lowers quality on its own.
- **At the limit.** All watching stops through the cut-off routine and new watching is refused until the month resets or the owner raises the budget. Shares stay live. With the owner absent it stays stopped.
- **Changing it.** The owner may set any value at any time. Raising it takes one confirm naming the maximum added cost, and watching is allowed again at once. Setting it below what is already used stops watching immediately.
- **Who sees it.** The owner sees the meter always. Members see nothing until the 95% warning.
- **Enforcement runs on graeae's own count alone.** Cloudflare's figure is not read in v1.
- **What it does not bound.** Relay traffic graeae never sees. The app and the README say the usage budget bounds watched media, not the whole bill.

### The room's screen

- **Layout.** A bar on the left, up to about 200px wide, and the stage filling the rest. The bar collapses to a rail of initials with a toggle button and a key.
- **Bar header.** The room's name, the link back to the list of rooms (only for a member with more than one room), and the gear (only for the owner).
- **Bar body.** One list of people: present members first, each row with icons for their live shares; then members with access who are not present, dimmed. A member's own row leads to the "You" page. Shortcuts for all webcams, everything and nothing. No separate list of shares, and nothing owner-only.
- **Bar foot.** The member's own shares as small previews, each with the names of the members watching and a stop button, plus the share buttons.
- **Following a member.** Clicking a name watches everything that member shares and keeps doing so: a share they start later joins the stage by itself. Following ends when the viewer changes what they watch in any other way (a single icon, a shortcut, stop watching, another name). The shortcuts are one-off and follow nobody.
- **Stage grid.** 1 column for one share, 2 for up to four, 3 for up to six, 4 beyond. Focusing a share makes it large and drops the others to a strip beneath.
- **Notes to a sharer** appear on or beside their own share, are shown only to them, and are driven by measurement: video only; software encoded; capturing at 48 fps on a 144 Hz monitor ("Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60"); upload cannot carry 1080p (switched off with the step-down; ticket 30).
- **The first-time notice** before the picker is shown once per device. On Chromium it gives the audio tip; on Firefox it gives the Firefox line instead. It carries no borderless-mode tip.
- **Click counts to hold:** 1 to watch a member, 1 to share a webcam, 3 to share a screen (4 the first time on a device).
- No phone layout is designed.

### Other pages

- **List of rooms** (root address, members with several rooms): each room's name, the display names of members present and a count of live shares; a link to the "You" page; the gear for the owner.
- **"You" page**, the same for every member and the owner: display name, their devices with "Forget", and "Add a device".
- **Owner page**, four sections with a small usage meter always visible in its navigation:
  - **People.** Every member with their access to each room, device count and last visit. Picking one shows access as one tick per room, their devices with "Forget", "Let back in" and "Remove from graeae".
  - **Invites.** A form (display name, rooms, "Create and copy link") beside the pending invites with their rooms and expiry, each with copy and cancel. The link is copied at the press and also shown. No ready-made message.
  - **Rooms.** Rename, see each fixed address, create.
  - **Usage.** The meter (GB used, the usage budget, projected month-end), the budget and reset-day settings.
- **Removal confirm.** Every removal, from one room or from the instance, asks in a modal that states the consequences. Removing from one room is done by unticking that room; the tick stays until the modal is confirmed. No countdown and no undo.
- **"Nothing here" page.** One plain page for every refused address.

### Platform promises

Three levels. Supported: the targets hold and a failure is a bug. Limited: it works with named gaps that are not bugs. Best effort: never blocked, never tested, no fix promised, not mentioned in the app.

| Platform | Level | Watching | Sharing |
|---|---|---|---|
| Windows 11, current stable Chrome or Helium | Supported | Everything, with screen audio | Screen at 1080p60, webcam at 720p30, screen audio as above |
| Windows 11, current stable Vivaldi or Brave | Supported, not yet verified | The same | The same |
| Windows 11, current stable Firefox | Limited | Everything, with screen audio | Webcam fully promised. Screen works, video only, no quality promise |
| macOS and Linux, current stable Chromium | Limited | Everything, with screen audio | A tab with its audio; a window or whole screen as video only; a webcam. No quality promise |
| Everything else | Best effort | | |

- "Everything else" covers Windows 10, Edge, Opera and other Chromium browsers, Firefox and Safari on macOS and Linux, and every phone browser.
- The app never checks the operating system and never blocks a browser. Extra audio a picker offers on macOS or Linux is passed through, not promised.
- A gap is shown only when it matters and only to the member affected. No banner on arrival, no badge for viewers.
- **4 simultaneous screens at 1080p60 is the promise**, kept on the owner's judgement and unproven: the decode load of 3 or 4 game shares was never measured.
- A sharer on a 144 Hz monitor gets 48 fps until Chrome's upstream fix ships. This is a named caveat on the Supported level.
- Hardware H.264 at 1080p60 is proven on two recent NVIDIA cards only. The effect of sharing on a game is unmeasured on a weak machine.

### Deploying

- **One documented path**, on the command line with pnpm: clone, install, log in to Cloudflare, fill in the secrets file, run the deploy script.
- **Five secrets, all required, no defaults, and no other settings:** `SETUP_SECRET`; `SFU_APP_ID` and `SFU_APP_SECRET` for the media server application; `TURN_KEY_ID` and `TURN_KEY_TOKEN` for the relay key. Everything else the owner can change is set in the app and stored in the instance.
- The deployer copies an example secrets file to a git-ignored one and fills it in; the deploy script uploads the secrets with the code. The config declares all five as required, so a deploy with one missing fails and names it. Later deploys keep the secrets already on the Worker.
- The Worker is named `graeae`. Someone running two instances passes a different name.
- The repo's config ships with the `workers.dev` hostname only and no routes, so nobody edits a tracked file. A custom hostname is attached in the dashboard.
- **Done by hand in the Cloudflare dashboard:** add a card and activate Realtime; create a media server application; create a relay key; optionally attach a custom hostname.
- **Updating:** pull the latest tagged release and deploy. Schema changes are numbered, forward-only migrations the instance applies itself on first start after a deploy. Going back to an older version after a migration is not supported. A changelog flags any release that needs a manual step.
- **No export and no backup.** If stored state is lost, the deployer runs setup again and re-invites everyone.
- A "Deploy to Cloudflare" button is not built, and nothing in v1 may rule it out.

### The README

It is part of the deliverable and must contain:

- The steps from an empty Cloudflare account to a working instance: the dashboard work, clone and install, the secrets file with the command that generates a setup secret, deploy, open the setup address, set the reset day to match the Cloudflare billing date, create invites.
- Cost: expected $0; Cloudflare requires a card on file; the media server and the relay share 1,000 GB a month, then $0.05 per GB billed automatically; the usage budget defaults to 1,000 GB so no media bill arrives unless the owner raises it; the usage budget bounds watched media, not the whole bill, so keep Cloudflare's billing alert on.
- That the usage count is unverified, until the comparison under Verification passes.
- A recommendation to delete the local secrets file after the first deploy.
- The platform table, naming the best-effort platforms as untested.
- Rotating each secret, recovering the owner with the setup secret, and deleting an instance.
- One emergency stop for relay abuse: replace the relay key in the dashboard and redeploy, stated as unverified to end credentials already issued.
- No backup, and what to do after loss.
- 0BSD, no warranty, no support promise; issues and pull requests are open but may go unanswered.

## Testing Decisions

A good test here drives the app the way a browser or a member does and asserts only on what comes back: responses, socket messages, what a later request is allowed to do, what is on the page. It does not read the instance's tables, call its internal functions, or assert on how a module is arranged inside. A test that still passes after the storage schema is redesigned is a good one.

There is no prior art: the repository holds a README and an icon. The prototypes behind this spec are on throwaway branches and have no tests. The seams below are therefore new, and are placed as high as they will go.

### Seam 1: the instance's protocol (most tests live here)

Tests run the real Worker and Durable Object, with real SQLite, inside the Workers runtime, and speak to it only through its HTTP routes and its socket, as one or more browsers would. The media layer is replaced at its seam by an in-memory fake media server that keeps tracks per media connection, can be told to fail or delay a close, and answers the "which tracks does this connection have" question. Time is controlled by the test.

Assertions are made on responses and socket messages, and on the fake media server's tracks, since "no track of a removed member is left" is the external behaviour the cut-off exists for.

Covered here:

- Invites: single use, the button press as the only thing that uses one, the 7-day and 10-minute lives, cancel, "Let back in" forgetting previous devices, and the "nothing here" answer for every refused address being indistinguishable.
- Devices: the 400-day life renewed by a visit, forgetting by member and by owner.
- The setup secret: first use, later use forgetting the owner's other devices, refusal when missing or short.
- Access: per room, the owner in every room, the first room by default, owner-only actions refused to members.
- Presence: once per member across devices, two rooms at once, clean leave, the grace period, the "reconnecting" mark's timing and placement, full state on reconnect.
- Shares: becoming live, each way of ending, one screen and one webcam per member across the instance, hand-over within a room and into another room, a failed hand-over leaving the old share.
- Watching: every check on a watch request, who the sharer is told is watching, watching one's own share unlisted.
- Cut-off: each row of the cut-off table, storage changed before any close, retry on a failed close, the 1-minute warning, the sweep closing an unrecorded track, the record written before the media server call.
- Restart: live shares and watching surviving a restart of the instance.
- Usage: charging the difference between running totals, the 5% margin, the maximum-bitrate charge after a last report, the final total before a restart, relayed watching doubled, the 80% and 95% warnings, the stop, raising and lowering the budget, the monthly reset on the owner's day.
- Relay credentials: one per media connection, the 12-hour life, the hand-out at 11 hours.
- Migrations: an instance with an older schema starting on newer code with its members intact.

### Seam 2: the app in a browser

A small number of journeys run in a real Chromium against the whole app running locally, asserting on what a member sees. Media is faked at the media layer on both sides (the fake media server behind the instance, and a fake media client in the page that captures and connects nothing), so these tests cover behaviour on the page and not pictures.

Covered here: open an invite, press the button, land in the room; the bar's order and icons; click a name, click an icon, the shortcuts, the stage's grid and focus; the first-time notice appearing once; sharing and the sharer's preview with viewers' names; hand-over's message; the removed member's page becoming "nothing here"; the owner page's invite flow and removal modal; the usage strips and the stopped stage; the list of rooms and the "You" page.

### Not automated: real media

Nothing automated talks to Cloudflare's media server or relay, and nothing automated judges picture or sound. Capture, encoding, the two qualities, step-down, screen audio and the relay are proven by hand on a deployed instance, using the lists under Verification. The media client's rules (which codec is offered, the sender's frame-rate limit, when to step down) are kept thin enough to read against this spec.

### Verification before v1 is called done

Done by the owner on the built app unless noted.

**Usage comparison.** Run one real session of at least 2 GB, then read the media server's egress for the same period on Cloudflare's Analytics tab. graeae's figure reading 0 to 10% above Cloudflare's passes. Outside that, change the margin and run it again. In the same sitting read the relay's analytics with one viewer on the relay: if relayed watching is billed once, drop the doubling. Until it passes, the README says the count is unverified.

**macOS and Linux, one pass each in current stable Chromium.** Record the browser and operating system versions.

1. Open an invite, press the button, land in the room.
2. Reload: the device is still remembered.
3. Watch a Windows Chromium member's screen share: picture and screen audio.
4. Watch a webcam share.
5. Share a tab playing sound: a Windows viewer sees and hears it.
6. Share a window: the viewer sees it, and the sharer sees the "video only" line unless the picker offered audio.
7. Share the whole screen: the same.
8. Share a webcam.
9. Stop a share from graeae and from the browser's own "stop sharing" control: it ends for the viewer both ways.

A failure outside the named gaps is fixed or added to the platform table as a gap.

**Still open from the prototype** (tracked in [Remaining browser checks](../v1/issues/21-remaining-browser-checks.md), on the throwaway quality-proof prototype):

- Vivaldi and Brave each share at 1080p60 with hardware H.264. A browser that fails drops to Limited with its gap named.
- Single-application audio for a game started through a launcher. A failure adds a caveat.
- ~~Both qualities stay on the hardware encoder with the game's frame rate unchanged.~~ Passed in build ticket 17 (RTX 5070 Ti, Chrome on Windows 11, CS2), but two qualities are switched off for the media server's freezes, as set out under Encoding and quality.
- An expired relay credential and a relay in use; a connection restart with a fresh credential without a visible blip. If the restart fails, a tab on the relay reconnects once at 11 hours.

**Measured once something is built.**

- That one Durable Object stays under the free plan's daily duration quota with the 5-second heartbeat and the byte reports (the 42% estimate predates both).
- Which CPU limit applies to a free-plan Durable Object.
- That a deploy leaves a dashboard-attached custom hostname in place. If not, the README documents the deploy flag for it.

## Out of Scope

- Voice and microphone. Discord keeps voice.
- Text chat.
- Recording.
- Notifications when someone goes live.
- Remote control of a shared screen.
- Sharing from a phone, and any phone layout.
- Public sign-up. Members are let in by the owner.
- A desktop helper, a virtual audio device, and with them desktop audio minus Discord.
- A direct browser-to-browser mode, and a self-hosted media server. The media layer seam leaves room for the second.
- Passkeys, Discord sign-in and Cloudflare Access.
- A second owner, co-admins, guests, avatars and profiles.
- Per-room or per-member usage quotas, and a per-member usage breakdown.
- Reading Cloudflare's own usage figure. Noted as a later addition behind the media layer seam.
- A "Deploy to Cloudflare" button and an interactive setup script.
- Export, backup, and going back to an older version after a migration.
- Windows 10, Edge and the other best-effort platforms as anything more than "never blocked".
- Search or ordering in the list of rooms.
- Automatic ducking of screen audio, a QR code for adding a device, a ready-made invite message, an undo for removal.

## Further Notes

### Targets this was designed to

- Group of usually 4, sometimes 6; a ceiling of 8 present in a room.
- Every member has at least 20 Mbps of upload.
- From opening the address to watching or sharing: a few clicks and under 15 seconds.
- Usage at the owner's estimate (30 hours a month, 1 screen and 1 webcam live, each watched by 3): about 547 GB, 55% of the free 1,000 GB. One relayed member in four adds roughly 140 GB while relayed watching is doubled.
- A heavy night is the thing to watch. By the same formula the tickets use (bitrate in Mbps, times viewers, times hours, times 0.45), 4 screens and 4 webcams each watched by 3 comes to about 73 GB an hour at 12 Mbps. That figure is recomputed here; the tickets' 51 GB an hour assumed 8 Mbps.

### Left to the build

Not designed, and free for the implementer to settle without reopening a decision:

- Exact sizes, icons, the key that collapses the bar, and visual polish. The owner prefers a home icon over a back arrow for returning to the list of rooms, with the room's name centred between the header's icons. The prototype's bar was too narrow for its two share buttons.
- The software codec offered last.
- The form of an invite's address and of the device cookie's value, beyond being unguessable.
- How often byte reports are sent ("every few seconds").
- How a reset day of 29, 30 or 31 behaves in a shorter month.
- Whether a room can be deleted. No ticket decided it, so v1 creates and renames only.

### Superseded along the way

- The "visible toggle to share silently" from Screen audio offer was replaced in Room experience: the browser picker's own checkbox, plus an on and off control on the live share.
- The borderless-mode tip from Platform promises and Room experience was dropped by Quality proof: exclusive fullscreen did not freeze in the capture.
- The 24-hour per-device relay credential and its revocation, from Media layer records and relay credentials, were replaced by Relay and credential life.
- The 8 Mbps screen bitrate behind the 385 GB estimate was replaced by 12 Mbps in Quality adaptation.
- The "fixed overhead if graeae under-counts" in Usage budget was set at 5% by Usage count accuracy, and the reported figure became a running total per media connection.
- The friend's GPU in Quality proof is an RTX 5060 Ti, not a GTX 980.
- H.264 high profile, then main, from Quality proof and Quality adaptation, was replaced by baseline profile (`42001f`) in build ticket 17. Quality proof sent one quality; with two, the media server answers main and high with VP8. The media server relabels baseline as constrained baseline to viewers, as it did high profile (under Unverified facts).
- The two qualities for a Chromium screen share from Quality adaptation are switched off by build ticket 17, for the media server's freezes on the lower one; ticket 29 tries them as two tracks.
- The step-down on a weak upload and its note, from Quality adaptation, are switched off by build ticket 18: the browser's estimate of the upload could not tell a weak upload from a healthy one; ticket 30.

### Unverified facts the design rests on

- The media server describes a baseline (`42001f`) track to viewers as constrained baseline (`42e01f`) while forwarding it unchanged. It works in Chromium and Firefox and is undocumented.
- The media server offers a viewer Opus without `stereo=1`, and forwards a sharer's stereo Opus unchanged once the viewer's answer asks for stereo. It works in Chrome (build ticket 15) and is undocumented.
- Why a viewer of an H.264 share's lower simulcast quality freezes. Ticket 17's dumps point to the media server's padding while it probes for bandwidth; Cloudflare documents nothing of it.
- How the media server judges that a viewer needs the lower quality is undocumented.
- Whether Cloudflare ever tears down a cut-off media connection with no tracks, and whether it drops packets a cut-off sharer keeps sending. A cut-off sharer's bitrate collapses by itself within 30 seconds.
- Whether Cloudflare's allowance follows the calendar month or the billing date, hence the owner-set reset day.
- Whether the account's billing alert counts Realtime charges before the invoice.

### Sources

- Decisions: the tickets linked from [map.md](../v1/map.md), 01 to 24.
- ADRs: [0001 plain Svelte, not SvelteKit](../../docs/adr/0001-plain-svelte-not-sveltekit.md), [0002 one Durable Object per instance](../../docs/adr/0002-one-durable-object-per-instance.md), [0003 the backend is the only gate to the media server](../../docs/adr/0003-backend-is-the-only-gate-to-the-media-server.md).
- Prototypes, on throwaway branches and never merged: `prototype/room-experience` (variant D), `prototype/owners-admin-surface` (variant B), `prototype/quality-proof`.
