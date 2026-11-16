# Room experience

Type: prototype
Status: resolved
Branch: prototype/room-experience (prototype in `prototype/room-experience/`, run with `./dev.sh`; throwaway, never merged)
Blocked by: 06
Map: ../map.md

## Question

What does a member see and do from opening the URL to watching and sharing, and how do they watch several shares at once?

Build a rough clickable prototype with fake streams, using Svelte with shadcn-svelte, and react to it with the user.

It has to answer:

- The path from opening the URL to watching a share, and to sharing a screen or webcam, counted in clicks and seconds against the "few clicks, under 15 seconds" target.
- How live shares are listed and how a viewer picks one, several, or all (someone's screen plus their webcam; everyone's webcams at once).
- How the layout adapts from one share to many, and what focusing one share looks like.
- What a sharer sees about their own shares and who is watching.

- How many shares one member may send at once, across one device or several.
- The list of rooms a member with several sees at the root address, showing who is present in each.
- Where a member sees who has access to the room, as distinct from who is present.
- How a viewer hears screen audio: volume and mute for each share, and what happens when several watched shares carry audio at once.
- The share dialog from [Screen audio offer](07-screen-audio-offer.md): audio on by default with a toggle to share silently, and the notice that a share is video-only (whole screen, or any share from Firefox).
- From [Platform promises](09-platform-promises.md): the share dialog shows a Firefox sharer one line (video only, possibly less smooth, a Chromium browser does better) and tips sharers to run games in borderless mode. Gaps are shown only to the member affected. No phone layout is designed.

The room model comes from [People and rooms](06-people-and-rooms.md): a member with one room lands straight in it, a member is present once however many devices they use, and a screen share carries its audio as one unit.

## Answer

Settled with the user on 2026-11-16 by reacting to a clickable prototype with fake streams. The prototype is on the throwaway branch `prototype/room-experience` (commit `fea5445`, in `prototype/room-experience/`, run with `./dev.sh`) and published privately at https://claude.ai/artifact/YEKYWZ1RnWx2irzUXzm8dQ. The winner is its variant D, "People sidebar". Variant B (a wall of posters) was rejected; A (a separate list of shares) and C (a stage with a bottom dock) lost to D, which took A's grid and C's idea that people are the unit.

**The room**

- A bar on the left and a stage filling the rest. The bar is one list of people: present members first, each row carrying that member's shares, then the members who have access but are not present, dimmed. There is no separate list of shares: in the prototype the user clicked names instead of the shares listed above them, and expects others to do the same.
- The bar sits beside the stage, not below it. In a maximised browser on a 1080p monitor a 16:9 share is limited by height, so a bar of up to about 200px costs a single share nothing, while a bottom bar shrinks it.
- The bar collapses to a thin rail of initials with a toggle button and a key. The rail still switches to a member in one click and keeps the share buttons.

**Watching**

- Clicking a member's name goes to that member: the stage is replaced by everything they share, screen and webcam. This is the default because it is what a click on a name is expected to do.
- Each row has a screen icon and a webcam icon, shown only when that share is live. Clicking one adds that share to the stage or takes it off, leaving the rest alone. This is how a viewer watches one person's screen with another's webcam. No right-click menu and nothing to learn: the icons are always visible.
- Clicking the name of the member already watched alone changes nothing. It never empties the stage, since people click a name again to make sure they are on it.
- The bar has shortcuts for all webcams, everything, and nothing. A viewer stops watching one share from its own controls.
- Nothing is watched on arrival. The stage says so and offers "Watch everything". From opening the URL, one click watches a member.
- A share that is not watched shows no live picture anywhere. A thumbnail would be watched media.

**The stage**

- Watched shares fill an even grid: 1 column for one share, 2 for up to four, 3 for up to six, 4 beyond.
- Focusing a share makes it large and drops the others to a strip beneath it. Clicking one in the strip focuses that one instead.
- Every watched share has a fullscreen button, and a double-click does the same.
- Controls appear on hover over a share: mute, volume, hear only this one, focus, fullscreen, stop watching.

**Screen audio for the viewer**

- Every watched share with audio plays at once, mixed. Each has its own volume and mute, plus "hear only this one", which mutes the others. No automatic ducking: switching by name makes several audible screens rare, and manual controls are predictable.
- The volume a viewer sets for a member is remembered on that device. Mute is not remembered, so nobody returns to a silent friend without knowing why.
- A share with no audio is labelled "video only" for the viewer.

**Sharing**

- One screen share and one webcam share per member at a time, across all their devices. Starting a screen share on a second device while one is live offers to stop it there and share from here. The same holds for the webcam.
- "Share screen" goes straight to the browser's picker. The first time on a device, a short notice comes first, once: share a tab or the game's window to send sound, a whole screen is video only, run games in borderless mode. A Firefox sharer sees the Firefox line there instead of the audio tip. After that first time, nothing stands between the button and the picker.
- graeae has no audio toggle of its own before the picker. This replaces the "visible toggle to share silently" from [Screen audio offer](07-screen-audio-offer.md): the browser's picker already has an audio checkbox, which graeae asks to have ticked, and the sharer's own share has an audio on and off control once it is live.
- When a share ends up video only (whole screen, or Firefox), the sharer sees one line saying so next to their own share. Viewers see only "video only".
- "Share webcam" starts at once with no dialog.
- Counted in the prototype: 1 click to watch, 1 click to share a webcam, 3 clicks to share a screen (button, pick, confirm in the browser's picker), 4 the first time on a device.
- A sharer sees each of their own shares as a small preview at the foot of the bar, with the names of the members watching it and a stop button.

**Several rooms**

- The prototype showed the root address for a member with several rooms as a plain list: each room's name, the display names of the members present, and a count of live shares. Inside a room, a "Rooms" link goes back. The user reviewed it afterwards and accepted it as is. A member with a great many rooms may need more (search, ordering); that is not designed for v1.

**Passed on**

- To [Signaling and room state](18-signaling-and-room-state.md): the room state must carry who is watching each share, so a sharer can see it; and it must enforce one screen share and one webcam share per member across devices, including the hand-over from one device to another.
- To [Owner's admin surface](17-owners-admin-surface.md): the layout to build on is the left bar and stage. The bar already lists everyone with access, which is where per-member owner actions could attach.
- To spec assembly: exact sizes, the collapse key, and visual polish were not designed. The prototype's bar is too narrow for its two share buttons.

**Glossary.** Added **Watch** and **Stage**. No ADR: all of this is easy to change later.
