# 16: Viewer's audio controls

**What to build:** A viewer hears every watched share that has screen audio, mixed, and sets each one's volume, mutes it, or chooses "hear only this one".

Spec: [The room's screen](../spec.md#the-rooms-screen). User stories 35 to 40.

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 15

**Status:** resolved

- [x] Every watched share with audio plays at once; there is no automatic ducking
- [x] Hover controls gain mute, volume and "hear only this one"
- [x] "Hear only this one" mutes the other watched shares
- [x] The volume a viewer sets for a member is remembered on that device and applied the next time they watch that member
- [x] Mute is not remembered
- [x] A share with no audio is labelled "video only" and has no audio controls
- [x] Seam 2 journeys cover the controls and the remembered volume across a reload

## Comments

**Done** on `ticket/16-viewers-audio-controls`, against the fakes. `pnpm test` (359 Seam 1 tests, then 29 Seam 2 journeys), `pnpm typecheck` and `pnpm lint` pass. No migration, and no change to the protocol or the instance: what a tab hears is the tab's own. The owner was away, so the impeccable skill's questions were not asked; the UI follows `DESIGN.md`, whose Stage Tile section now describes the controls.

- **Where it lives.** `Hearing` (`src/app/lib/hearing.ts`) holds each member's volume and the set of muted shares, and `Room.svelte` makes one per room page. A tile is "sounding" when the room lists it with `audio: true`, so a webcam and a video-only screen get no audio controls. `WatchedPicture` takes `volume` and `muted` and sets them on its `<video>`; the element's volume is the square of the control's (`gain`), so the control's lower half stays usable.
- **The controls** (`ShareAudio.svelte`) lead the tile's pill, before the quality choice: a mute button whose speaker shows the volume, a 64px range input (`step` 5, named "Volume of Kai's screen"; 40px on a picture under 400px wide, through a container query on the picture, so four columns on a small window still fit), and "Hear only Kai's screen" while another watched share has sound. In the strip only mute is shown, at 24px. Labels follow the sharer's own audio switch: they say the action ("Mute …" / "Unmute …"), with no `aria-pressed`.
- **Decisions.** The volume is kept per member, in `localStorage` under `graeae:volume:<member id>` as a whole percentage, written as the control moves; anything unreadable there means full volume. Mute belongs to one watch of one share: it is forgotten when the share leaves the stage, so a share watched again, or after a reload, is heard. Moving a muted share's volume unmutes it. "Hear only this one" is an action, not a mode: it unmutes this share and mutes the other watched shares with sound; pressed again while this is the one heard (it then reads "Hear every share again" on raised-2) it unmutes them all. A share that joins the stage afterwards is heard, since nothing is ducked by itself. A muted share's caption reads "screen · muted", so its silence is visible without hovering (my addition; the spec asks that nobody comes back to a silent friend without knowing why). Webcams are video only by definition and their caption stays "webcam", not "video only"; "video only" marks a screen share that ended up with no sound, as ticket 15 had it.
- **Ticket 15's muted fallback.** When the browser refuses sound on a page nobody has clicked, the picture plays muted and a "Click for sound" pill sits on its bottom-left corner. The first click or key press anywhere on the page (`pointerdown` and `keydown` on the document, which grant the page activation) plays it again with sound. In the strip the pill is an icon alone. The fake media client gives no picture, so Seam 2 cannot reach this path (a probe found headless Chromium's `play()` on a made-up stream never settles); it is in the owner's checks below.
- **Tests.** `test/browser/audio.spec.ts` (members Dani, Eli and Fabi): two screens with sound both heard at full volume; a whole-screen share reading "video only" with no audio controls, and a webcam with none; each volume its own; mute and unmute with the caption; "hear only" both ways, and the volume unmuting; mute in the strip; "hear only" gone with one share with sound; mute forgotten and the volume kept when a share is watched again; and, in the second journey, a volume kept and a mute forgotten across a reload.

**For the owner, with real media (no box waits on it):** after ticket 13's deploy, with two members sharing tabs that play sound, check that both play at once, that the volume control sounds even across its range, and that "hear only" and mute act at once. Then reload the watching page and click a name without clicking anything else first: if Chrome refuses the sound, the tile shows "Click for sound", and a click anywhere brings the sound in.
