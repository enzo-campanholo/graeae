# 38: A clear way to "You" from inside a room

**What to build:** From inside a room, your own settings ("You") are reachable by something other than clicking your own name in the people list.

Owner's note (2026-11-18): "Accessing your profile from inside a room is still weird. If there are multiple rooms to select from it gets clearer, but clicking on your name in the list should not be the only way of doing this."

**Blocked by:** none

**Status:** resolved

## Open questions

- Where: the bar's header next to the gear (as on the room list, which shows "You" beside the gear), or the foot of the bar?
- Members have no gear. Their way in has to work too.

## Comments

### 2026-11-18: round 1, three options

The owner asked to see the options before anything is built.

**Where to look.** `.impeccable/review/captures/t38-r1/index.html` (not committed), shot in the real app on the samples (`?sample`), dark and light, at 1920x953 and 1366x768:
- **`owner-bar`:** the owner, whose header has home and the gear.
- **`member-bar`:** a member with one room, whose header has neither, so the right of the header is empty today.
- **`owner-rail` and `member-rail`:** the same two with the bar folded.

Each shot is labelled `--now`, `--a`, `--b` or `--c`, and `owner-bar--c-menu` / `member-bar--c-menu` show C's menu open. To try them by hand, the options are on branch `t38-options`. Run `pnpm dev:fake-media` there and open `/r/den?sample&option=a` (or `b`, `c`, `now`; add `&as=member` for the member). The choice is kept until another `?option=`. `scripts/capture/options.config.ts` reshoots the set.

In all three, your own name in the list still opens "You" as it does now, except in B, where your row moves to the foot. Every way in opens "You" in a new tab, as the gear does, so the room carries on.

- **A, a "You" link in the header, as on the plain pages.** "You", in the plain pages' small muted text, sits in the header's right side: left of the gear for the owner, alone for a member. The room list and "You" page already show it there, so the three surfaces agree. It is wider than an icon, so both sides of the header grow from 68px to 76px to keep the room's name centred, and the name has 16px less room before it truncates. Folded, the rail shows "You" under its toggle.
- **B, you at the bar's foot.** Your row leaves the "Here" list and becomes the bar's last line, under the share buttons: avatar, name, "· you", the icons of your shares from another device, and a "You" button (user-cog icon) at its end. The list is then only the others. Its count still includes you, which is open to change. The header is unchanged. The foot is 48px taller, which comes out of the list's space. Folded, your avatar sits under the rail's share buttons and opens "You".
- **C, your avatar as a menu in the header.** Your avatar takes the header's right corner, as an account menu usually does, and the gear folds into it. The menu holds your name with "Owner" or "Member", then "You", "Owner page" (owner only), and the appearance (Dark / Light / Match system), so the commonest "You" setting takes no new tab. A member gets the same corner as the owner. The cost: the owner page goes from 1 click to 2. Folded, the avatar sits under the rail's share buttons and its menu opens to the right.

**Not in any option yet:** the room list and "You" page are not changed. Whatever is chosen for the room may want them to follow, for example C's avatar replacing their "You" link. The click counts from ticket 32 (watch, webcam, screen) and the 1080p promise are untouched by all three, since none changes the bar's width or the stage.

**Waiting on the owner:** what you like and dislike in each. Round 2 combines those.

### 2026-11-18: round 1's verdict, and round 2, C beside C-plus

**What the owner said of round 1.** They lean to C.

**What the agent added.** C was the agent's pick too:
- It is the only option where the owner and a member get the same corner.
- An avatar in the top corner is where people look for their own account.
- It moves nothing else, and the appearance is in reach without leaving the room.
- A's text link reads as a label beside a centred title, and takes width from the name (which ticket 43 is already unhappy with).
- B adds 48px to the foot, which is tightest at 1366x768 with both shares live.

C's one real cost is the owner page going from 1 click to 2.

**Round 2: C beside C-plus.** Shots in `.impeccable/review/captures/t38-r2/index.html` (not committed): `--c` and `--c2` for the owner's and the member's bar and rail, both menus open, the tooltip, and the list of rooms under each. On branch `t38-options`, the new one is `?option=c2`.

- **C** as round 1 showed it.
- **C-plus** is C with three changes:
  - **The gear stays for the owner, beside the avatar,** so the owner page is 1 click again. The header's right side already had room for two icons. A member gets the avatar alone, as in C. "Owner page" stays in the menu too.
  - **The avatar has a "You" tooltip,** as every other icon button in the header has.
  - **The list of rooms gets the same gear and avatar menu,** in place of its "You" text link, so "You" is reached one way everywhere. From the list, the menu's links open in the same tab, as that page's links do now. The "You" page itself is unchanged, since a menu whose first item is the page you are on adds nothing.

**Building C-plus's list of rooms needs one more thing:** the list's connection doesn't carry your name today (`ListState.you` holds only `owner`). The shots use the sample's name, and on real data the avatar falls back to a plain person icon until the list sends the name.

**Waiting on the owner:** C or C-plus, or either with changes.

### 2026-11-18: chosen and built, C-plus without "Owner page" in the menu

**The owner's verdict on round 2.** C-plus. The agent suggested one change, which the owner agreed to: with the gear right beside the avatar, the menu's "Owner page" did the same thing as the gear, so it is gone. The owner and a member now get the same menu.

**Built.** `YouMenu.svelte`: your avatar as a menu, named "You" by its tooltip. It holds your name over "Owner" or "Member", then "You", then under a rule "Appearance" (Dark / Light / Match system). Picking an appearance applies it at once and leaves the menu open.
- **In a room:** the menu sits at the header's right, after the owner's gear. The gear and "You" open in a new tab, so the room carries on. Folded, the avatar sits 12px under the rail's share buttons and its menu opens to the right. Your own row still opens "You", as before.
- **The list of rooms:** the gear and the avatar replace the "You" text link, and here they open in the same tab, as the list's links do. The "You" page keeps only the gear.
- **The list's connection:**
  - `ListState.you` carries your display name, for the avatar.
  - A rename on the "You" page sends a new `you` message to your own open lists, so an avatar in another tab follows.
- **Shared code:** the appearance choices moved into `theme.svelte.ts`, so the "You" page and the menu share one list.
- **DESIGN.md and the sidecar:**
  - A new "You Menu" component entry.
  - The room, rail and plain-page entries describe it.
  - The rule inside it is listed under Tone Not Lines, its width under the One Scale Rule's hand-set sizes, and its highlight under Raised Two.

**Tests.** Test first, one slice at a time:
- **Seam 1, `list.test.ts`:** the list's state names the member, for both a member and the owner.
- **Seam 1, `you.test.ts`:** a rename reaches the member's own list as a `you` message.
- **Seam 2, `you.spec.ts` (new journey, member Ari):**
  - A member's bar has no gear. The avatar's menu names them, and has no "Owner page".
  - Light from the menu applies in the room and is checked on "You".
  - "You" opens in a new tab while Ari stays here, and the "You" page has no avatar.
  - The owner keeps the gear beside the avatar.
  - Folded, the rail's avatar opens the same menu.
- **Seam 2, `rooms.spec.ts`:** Gil's avatar on the list names Gil and leads to `/you` in the same tab, in place of the old "You" link.

Each was red before its slice and green after. `pnpm typecheck` and `pnpm lint` are clean, and `pnpm test` passes in full: 429 Workers tests and 45 browser journeys. One run in between had `stage.spec.ts`'s layout journey abort a `page.evaluate` under load. It passed alone twice and in both full runs. The samples after the build are in `.impeccable/review/captures/t38-after/` (not committed).

**Review.**
- **Standards:** two hard mismatches with DESIGN.md (the panel's corners were 8px against 12px, the items' 4px against 6px) and literal `size-4` icons, all fixed. The menu's 224px width is now listed among the One Scale Rule's hand-set sizes, and the menu's raised-2 uses are listed under Raised Two. `item` was renamed `itemClass`.
- **Spec:** the list's name could go stale in another tab after a rename, fixed as above. Your name in the room could reach the avatar as an empty string, now null, which shows the person icon. Missing: a check that the "You" page has no avatar, now in the journey.
- **Left as is:** the tooltip-around-a-trigger shape repeats `IconButton`'s, since this trigger is a menu's and not a button. `PlainPage` takes `owner` from `gear`, which is the same fact on these pages. No journey checks the tooltip's text or the owner's list page.

**Not done here.**
- **Deploy to `graeae-test`.**
- **Branch `t38-options` can be deleted,** and with it the shots in `t38-r1` and `t38-r2`.
