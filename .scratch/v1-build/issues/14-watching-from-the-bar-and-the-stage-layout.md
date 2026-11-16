# 14: Watching from the bar and the stage layout

**What to build:** Clicking a member's name replaces the stage with everything they share. Shortcuts watch all webcams, everything or nothing. Watched shares fill an even grid, any one can be focused or made fullscreen, and each has its controls on hover.

Spec: [The room's screen](../spec.md#the-rooms-screen). User stories 27 to 35.

UI: build with the impeccable skill, following `DESIGN.md`. Layout source: `prototype/room-experience`, variant D.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Clicking a member's name replaces the stage with everything that member shares
- [ ] The viewer then follows that member: a share the member starts later joins the stage by itself
- [ ] Following ends when the viewer changes what they watch in any other way: a single icon, a shortcut, stop watching, or another name
- [ ] The shortcuts are one-off: a share started after "everything" or "all webcams" does not join by itself
- [ ] Clicking the name of the member already watched alone changes nothing and never empties the stage
- [ ] Shortcuts in the bar: all webcams, everything, nothing
- [ ] On arrival the empty stage offers "Watch everything"
- [ ] Grid: 1 column for one share, 2 for up to four, 3 for up to six, 4 beyond
- [ ] Focusing a share makes it large with the others in a strip beneath; clicking one in the strip focuses that one
- [ ] Every watched share has a fullscreen button, and a double-click does the same
- [ ] Hover controls on a share: focus, fullscreen, stop watching (audio controls arrive in ticket 16)
- [ ] The collapsed rail still switches to a member in one click and keeps the share buttons
- [ ] Seam 2 journeys cover name click, icon toggle, each shortcut, grid and focus
- [ ] In a maximised browser on a 1080p monitor, a single watched 16:9 share is limited by height, not by the bar
