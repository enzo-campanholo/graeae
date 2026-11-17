# 14: Watching from the bar and the stage layout

**What to build:** Clicking a member's name replaces the stage with everything they share. Shortcuts watch all webcams, everything or nothing. Watched shares fill an even grid, any one can be focused or made fullscreen, and each has its controls on hover.

Spec: [The room's screen](../spec.md#the-rooms-screen). User stories 27 to 35.

UI: build with the impeccable skill, following `DESIGN.md`. Layout source: `prototype/room-experience`, variant D.

**Blocked by:** 11

**Status:** resolved

- [x] Clicking a member's name replaces the stage with everything that member shares
- [x] The viewer then follows that member: a share the member starts later joins the stage by itself
- [x] Following ends when the viewer changes what they watch in any other way: a single icon, a shortcut, stop watching, or another name
- [x] The shortcuts are one-off: a share started after "everything" or "all webcams" does not join by itself
- [x] Clicking the name of the member already watched alone changes nothing and never empties the stage
- [x] Shortcuts in the bar: all webcams, everything, nothing
- [x] On arrival the empty stage offers "Watch everything"
- [x] Grid: 1 column for one share, 2 for up to four, 3 for up to six, 4 beyond
- [x] Focusing a share makes it large with the others in a strip beneath; clicking one in the strip focuses that one
- [x] Every watched share has a fullscreen button, and a double-click does the same
- [x] Hover controls on a share: focus, fullscreen, stop watching (audio controls arrive in ticket 16)
- [x] The collapsed rail still switches to a member in one click and keeps the share buttons
- [x] Seam 2 journeys cover name click, icon toggle, each shortcut, grid and focus
- [x] In a maximised browser on a 1080p monitor, a single watched 16:9 share is limited by height, not by the bar

## Comments

**Done** on `ticket/14-watching-from-the-bar-and-the-stage-layout`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration, and no change to the protocol or the instance: everything here is the page's. The owner was away, so the impeccable skill's questions were not asked; the UI follows `DESIGN.md`, which gained the focus layout and the tile's controls.

- **Following lives in the tab** (`RoomClient.following`), not in the instance. Watching already belongs to the tab, and following is only a rule about what the tab asks to watch next, so it needs no record and no message. It survives a reconnect, since the client outlives its socket, and ends when the followed member is no longer present (a clean leave, or a grace period running out). It does not survive a reload.
- **The client's interface** is now `follow(member)`, `pick("webcams" | "everything" | "nothing")`, `toggle(share)` and `unwatch(share)`; `watch` is private. A name, a pick, an icon and "stop watching" all go through one rule: the stage becomes exactly the chosen shares, each missing one is asked for and each extra one is stopped. A share still being asked for when the viewer picks otherwise is stopped once its negotiation ends (`unwanted`), so a quick name-then-name never leaves the first member's share on the stage.
- **Decisions.** "Webcams" and "Everything" replace the stage rather than add to it (the prototype added), since story 31 calls them combinations: after "Webcams" you watch the webcams and nothing else. Neither includes your own shares from another device; those stay one icon away on your own row. Clicking the name of a member who shares nothing follows them and empties the stage, which then says "Rui isn't sharing anything right now. What they share next will show here." Clicking the followed name again changes nothing, as the spec asks; it does not unfollow.
- **The stage.** The column table stays as the spec fixes it (1, 2 up to four, 3 up to six, 4 beyond). Ticket 02's reviewer suggested choosing columns from the stage's size; it was declined again, because the spec and this ticket's box both state the table. Focus is the page's (`focusedKey` in `Room.svelte`), forgotten when that share leaves the stage. The focused share is sized like a grid of one; the strip's pictures are 96px high. Each tile's controls (focus or "Back to the grid", fullscreen, stop watching) sit in a raised pill on the picture's corner; a strip tile is a button that focuses it, with fullscreen and stop watching in its pill. Fullscreen is the picture element's own, and a double-click toggles it. **Ticket 16** adds mute, volume and "hear only this one" to the same pill (`StageTile.svelte`). The pill's tooltips do not show in fullscreen, since they render outside the fullscreen element; the buttons keep their names.
- **The empty stage** now reads "Click a name to watch what that person shares, or an icon for one share." and offers "Watch everything".
- **The 1080p promise** is checked in Seam 2: at 1920x953 a single watched 16:9 share is narrower than the stage and as tall as it allows.
- **Tests.** `test/browser/stage.spec.ts`, three journeys (members Rui to Zoe, Lia and Noa): a name, the same name again, following through a stop and restart, and its end by another name, an icon, and "stop watching"; "Watch everything" on arrival, each shortcut, a shortcut ending following and being one-off itself, and the rail following in one click with its share buttons; the grid's 1, 2, 3 and 4 columns, focus and the strip, fullscreen by button and double-click, and the 1080p check. Only webcams can be shared from a browser yet, so "Webcams" and "Everything" cannot be told apart in Seam 2; **ticket 15** should add a screen share to the shortcut journey. Measurements wait for the tiles' arrival animation to finish first, or they read the 98.5% scale. The journeys close their pages before their browsers, so each member leaves cleanly: a closed browser leaves its member reconnecting with a live webcam, which broke `watching.spec.ts`'s "No one is sharing yet." The grid journey has a 2-minute limit, since seven members join and share first. With eight browsers it is the heaviest journey, and under load from other agents (load average 12 to 17 on this 8-core machine) it failed twice. Every page stays connected, and the owner tab's socket went quiet for over 30 seconds, so the instance ended its presence and its stage. Each page's own work was measured at about 1 ms a second, so nothing on the page spins. At normal load it passed every time (4 repeats alone, and the full suite).

**Found on the way, not fixed (outside this ticket):** `Connection.send` (`src/app/lib/connection.svelte.ts`) drops a message sent before the room's socket is open. "Share webcam" is on the page before the room arrives, so a click in that moment sends `connect` into nothing and the button stays at "Starting" for good, with no "didn't start" note. It showed up as a flaky Seam 2 join under load; the journeys now wait for the member's own row before sharing. A fix belongs with sharing or dropped connections (**ticket 22**, or 28): queue messages until the socket opens, or fail the share when the connection is not open.
