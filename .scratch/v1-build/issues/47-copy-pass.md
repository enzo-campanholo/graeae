# 47: A pass over the app's text

**What to build:** Every piece of text the app shows, read again for clarity, directness and conciseness, in that order. Orwell's six rules and the unslop checklist (https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md) apply. The voice stays as PRODUCT.md sets it, plain with some warmth, and the words stay the glossary's.

Owner's request (2026-11-19): "Let's do a pass over the text in the app. … All the text."

**Blocked by:** none

**Status:** resolved

## Comments

### 2026-11-19: done

The text was already plain and literal, so about 40 strings changed in 15 files and the rest stayed. The scope was pages, owner sections, room components, tooltips, aria labels, and the confirm lines in `removal.ts`.

- **Active voice.** Failures name the action: "Couldn't make the invite. Try again." replaces "The invite was not made." "graeae will remember this browser as yours." "Members have used 41% of the usage budget by day 12 of 30."
- **Literal words over figures.** "Your upload is too slow for 1080p, so this share is at 720p." "Encoded in software, which uses more CPU and can slow your game." "Still trying to stop what Jo was sharing and watching." replaces "Couldn't confirm that Jo was cut off." "appears in People once they press Join" replaces "shows up nowhere". "expired" replaces "run out", "limits" replaces "bounds", and "counts a little more usage than" replaces "reads a little above".
- **No colon as a connector.** The usage budget's warning and the raise confirm each split into two sentences.
- **Straight quotes.** The confirms say what the member will see: `their page there will say "Nothing here"`.
- **One name per thing.** "new one" replaces "fresh one", and "webcam share" replaces "webcam" where the share is meant.
- **Cut words.** "now" replaces "right now", "takes" replaces "will take", "They lose X." replaces "They lose X and keep no room.", and "Sharing and watching need these secrets." replaces the longer sentence about the deploy.
- **Aria.** "Stop sharing your screen" replaces "Stop your screen".

**Kept on purpose.** "Their device is forgotten" stays in the passive. It is the glossary's wording, and who forgets does not matter to the owner. "relay" stays in the Usage note, since the owner set the instance up and knows the word.

**Tests.** The journeys and the capture script that matched the old words now match the new ones. The spec's two word-for-word quotes (the removal warning and the 48 fps note) changed with them. Typecheck and lint pass, and all 431 tests in the Workers runtime pass. Of the journeys, 55 passed on the first run. Two still expected the old words; after the fix both pass.
