# 42: The empty stage says little, and offers no way to share

**What to build:** The empty stage fills its space with something useful. When no one is sharing, it offers sharing (screen and webcam) as well as saying so.

Owner's note (2026-11-18): "If you are not watching anything this appears, the only option is to watch everything. If nobody is sharing anything, it only shows a text… First, it looks weird because there is little stuff around… Second, if no one is sharing it is probably because that person is going to start sharing, which means we probably should have the share button there as well. This would maybe make it more cluttered, since we have the share button somewhere else as well, but I still want to see it."

Blocked by: 34

Status: resolved

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

### 2026-11-19: chosen and built, A

**The owner's verdict on round 1.** A, large choices in the middle.
- **C is out:** too much useless information.
- **B** was the other contender. The agent leaned to A because B's live state reads as shares that failed to load, and its other frames vanish at the first click.
- **The first-time notice opens on the stage** when the stage's Share screen is pressed. The agent argued for it and the owner agreed. Whoever presses the stage's button rather than the bar's is likely new, and so the one the notice is for. In the bar's foot, about 800px away, it would read as a button that did nothing.

**Built.**
- **`StageEmpty.svelte`, as A:**
  - A heading at the title step in foreground, then one muted line.
  - **No one else sharing:** "No one is sharing yet." ("Only you are sharing." while a share of yours is live, from this tab or another) and two large choices, Share screen and Share webcam.
  - **Shares live:** "You're not watching anything yet." and a choice per share others have live, by name, a screen before a webcam. Each is named "Watch Bia's screen", as the row's icon is, and a click watches that one share. A large secondary "Watch everything" (eye) follows.
  - **Unchanged:** following a member who shares nothing, and the used-up usage budget, keep today's words and size.
- **`StageChoice.svelte`:** the choice itself.
  - A raised 224x136 card (`--choice`, `--choice-h` in the scale block), 8px corners, raised-2 and foreground under the pointer.
  - A 28px icon over the label. For a share, the sharer's avatar and the share's icon over the name and a dim kind.
  - A keyed choice names its key in its tooltip and `aria-keyshortcuts`.
- **The stage's share choices are the bar's buttons in another place:**
  - The same names and states ("Starting", "Screen live", "Webcam live", resting muted rather than dimmed).
  - The same flow, so the same click counts and the hand-over offer.
  - Raised rather than filled, so the bar's Share screen stays the room's one filled button.
  - `shareLabels` and the `Sharing` type in `$lib/share.ts` now hold the labels for both places.
- **Where the panel opens (`Room.svelte`, `FootPanel.svelte`):**
  - What a press asks first (the first-time notice, or the hand-over offer, which is the same panel) opens where the button pressed was: the bar's foot, beside the rail, or the stage.
  - On the stage it floats 12px under the choices, centred, at the bar's inside width with the tooltip's drop, so nothing moves.
  - The S key asks in the bar, as before.
  - If the stage stops offering sharing while the panel is open (someone else starts sharing, say), the panel moves to the bar and stays open.
  - `FootPanel`'s `floating` became `place` (`foot`, `rail`, `stage`).
- **The docs:**
  - **DESIGN.md:** a section "The Empty Stage", plus the panel's stage place in Screen Notice and Hand-over Offer. Raised, Title, the shapes, the icon sizes and the One Scale Rule's hand-set list name the choices.
  - **The sidecar:** a "Stage Choice" component.
  - **`ignore.md`:** a line for this call, naming its cost (the stage repeats the bar's buttons and icons, larger).

**Tests.** Test first, at Seam 2, in `stage.spec.ts`:
- **"While no one shares, the empty stage offers sharing as the bar does, the screen's first-time notice beside it."**
  - It checks the heading, then one click on the stage's Share webcam shares the webcam.
  - It checks "Only you are sharing." and "Webcam live", disabled.
  - Share screen carries `aria-keyshortcuts="S"`. Its notice is in the stage and not in the bar, and going on shares the screen.
  - Once someone else shares, the stage offers their share and no sharing.
- **"With shares live, the empty stage offers each one by name, and a click watches that one alone."** The row's icon lights.
- Both were red on the missing heading and green once built.

The stage's buttons carry the bar's names, so every journey that found a share button page-wide now finds it in the bar. That is `inBar(page)` in `test/browser/app.ts`, across 13 journeys and `journeys.capture.ts`. The capture now also shoots `room--stage-notice` and `room--choices`.

`pnpm typecheck` and `pnpm lint` are clean. The Workers tests (431) and the browser journeys (52) passed in full. As in tickets 40 and 41, `dist/graeae/.dev.vars` was deleted between the build and `playwright test` (ticket 46). The shots after the build are in `.impeccable/review/captures/t42-after/` (not committed), set against `t41-after`.

**Review.**
- **Standards:**
  - The share buttons' labels were written twice: now `shareLabels`.
  - Their four states travelled as an inline type: now `Sharing`.
  - Vague names (`asked`, `asking`, `stagePanel`) became `pressedOn`, `askFirst` and `askFirstOnStage`.
  - The new journey built its own bar locator beside `inBar`.
  - `kind` became a `ShareKind`.
  - DESIGN.md did not mention the avatar stepping back under the pointer.
  - All fixed.
- **Spec:** the choices' icons used a 1.5 stroke where the system's is 1.75; now 1.75. This ticket file is now updated.
- **Left as is:**
  - `stageOffers` in `Room.svelte` mirrors the branch of `StageEmpty` that shows the share buttons, from outside it. A comment says so.
  - No journey covers the hand-over offer on the stage, the bar folded, or a share of yours live from another device. They run on the same code as the bar's, which the hand-over and screen journeys cover.
  - The 8px corner in `StageChoice`'s own style stays a literal, as the shapes in DESIGN.md name it.

**Rules kept.** Ticket 32's click counts (1 to watch a member, 1 to share a webcam, 3 to share a screen) and the 1080p promise hold. The empty stage shows no share, the bar's width is unchanged, and the journeys that measure them pass.

### 2026-11-19: deployed and closed

**Deployed to `graeae-test`** on 2026-11-19, from `65036c5` (version `4be9c00a`).
- The live page loads the new build at once: the script `index-CVIoRIbx.js`, which carries "Only you are sharing." and "Pick a share to watch it" and none of the fakes, and the stylesheet `index-CYIBQCVh.css`, which carries `--choice: 224px`.
- The secrets were left as they were, since no `.secrets` file was uploaded.

**Cleaned up.**
- Branch `t42-options` is deleted, so `?option=` and `?sample=quiet`, `alone` and `many` no longer exist anywhere.
- The round 1 shots (`t42-r1`) are deleted, so the round 1 comment above describes what was shown, not files to open.
- `t42-after` stays.

**Still open, not this ticket's:** the fake-media build copying `.dev.vars` into `dist/graeae/` (ticket 46).
