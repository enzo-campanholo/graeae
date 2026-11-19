# 42: The empty stage says little, and offers no way to share

**What to build:** The empty stage fills its space with something useful. When no one is sharing, it offers sharing (screen and webcam) as well as saying so.

Owner's note (2026-11-18): "If you are not watching anything this appears, the only option is to watch everything. If nobody is sharing anything, it only shows a text… First, it looks weird because there is little stuff around… Second, if no one is sharing it is probably because that person is going to start sharing, which means we probably should have the share button there as well. This would maybe make it more cluttered, since we have the share button somewhere else as well, but I still want to see it."

**Blocked by:** 34

**Status:** needs-triage

## Open questions

- The share buttons on the stage stand beside the bar's own, not instead of them. Same keys (S), same flow, same click counts.
- "Not watching anything" with shares live: a few large choices (each live share, plus "Watch everything") rather than one button?

## Comments

### 2026-11-19: round 1, three options

The owner chose to see options first, as in tickets 40 and 41.

**What is wrong now.** The empty stage holds one 15px line ("No one is sharing yet."), or two lines and a "Watch everything" button, in the middle of a stage that is about 1570x920 at 1920x953. Nothing on it shares.

**Where to look.** `.impeccable/review/captures/t42-r1/compare.html` (not committed). It sets the whole room in each option side by side, two by two, with switches for:
- **State:**
  - **People here, no one sharing** (a new `?sample=quiet`).
  - **You alone** (`?sample=alone`).
  - **Four shares live, none watched,** with your webcam live (the existing `?sample=none`).
  - **Seven shares live, none watched** (`?sample=many`).
  - **No one sharing, the bar folded.**
- **Theme:** dark and light.
- **Size:** 1920x953 and 1366x768.

A click on a shot opens it at full size. To try them by hand, check out branch `t42-options` (`51fb458`), run `pnpm dev:fake-media` and open `/r/den?sample=quiet&option=a` (or `b`, `c`, `now`). The choice is kept until another `?option=`. `scripts/capture/options.config.ts` reshoots the set.

In all three:
- The stage's share buttons are secondary, so Share screen in the bar stays the room's one filled button.
- Share screen's S is in its tooltip, as in the bar.
- The buttons call what the bar's do, so the click counts are the bar's.
- The heading moves up to the title step (17px, foreground).

- **A, large choices in the middle.**
  - **No one sharing:** the heading, one line ("Share your screen or webcam, and whoever is here can watch it."), and two 224x136 raised cards, Share screen and Share webcam, each a 28px icon over its label.
  - **Shares live:** "You're not watching anything yet." and a card per live share (the sharer's avatar and the kind's icon, the name, and "screen" or "webcam" in dim), up to four to a row, then a large "Watch everything" with the eye.
  - **Gains:** the largest targets, and the ticket's open question as asked (each live share and "Watch everything").
  - **Cost:** the cards repeat the bar's share icons in another shape, and seven shares make two rows of cards. With shares live, nothing offers sharing.
- **B, the stage's own shape.**
  - **No one sharing:** a faint 16:9 frame where one share would sit, at the size a single share takes, holding the heading and the two share buttons (44px).
  - **Shares live:** a frame for each live share where its tile would sit, in the stage's own column table, captioned with the name and kind like a tile, with the kind's icon and "Watch" in the middle. A line at the top says "You're not watching anything yet. Click a share to watch it.", with "Watch everything" at its right.
  - **Gains:** the stage shows what it holds and where things will go, and it is filled at any size.
  - **Cost:** a frame you click becomes a real tile and the other frames go at once, since the stage is then no longer empty. An unwatched frame could be read as a share that failed to load. Seven frames at 1366x768 are small.
- **C, the room as a lobby.**
  - A raised card per person here: a 64px avatar and the name (clicking either follows them), then a "Watch screen" / "Watch webcam" button for each live share, or "Not sharing anything".
  - Your own card comes last, with "· you" and Share screen / Share webcam (or "Webcam live").
  - Above the cards, the heading: "No one is sharing yet.", "No one else is here yet." when you are alone, or "You're not watching anything yet." Under them, "Watch everything" while shares are live.
  - **Gains:** the stage says who is here and offers sharing in every state, beside the shares you could watch.
  - **Cost:** it repeats the bar's list of people, larger. Five people make two rows at 1366x768.

**Small things in every option.**
- With only your own share live, the heading reads "Only you are sharing." where it now reads "No one is sharing yet."

**Not in any option:**
- **Following someone who shares nothing** and **the used-up usage budget** keep today's words and size.
- **The rail** is unchanged. The stage offers the same buttons with the bar folded.

**For the build, whichever is chosen:**
- **The first-time screen notice.** On a device's first Share screen, the notice opens in the bar's foot (or floating by the rail). Pressed on the stage, that is far from the click. Should the notice open on the stage when the stage's button is pressed?

**Rules kept.** Ticket 32's click counts (1 to watch a member, 1 to share a webcam, 3 to share a screen) and the 1080p promise hold in all three. The empty stage shows no share, and the bar's width does not change.

**Waiting on the owner:** what you like and dislike in each. Round 2 combines those.
