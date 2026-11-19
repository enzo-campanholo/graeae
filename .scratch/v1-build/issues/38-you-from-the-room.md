# 38: A clear way to "You" from inside a room

**What to build:** From inside a room, your own settings ("You") are reachable by something other than clicking your own name in the people list.

Owner's note (2026-11-18): "Accessing your profile from inside a room is still weird. If there are multiple rooms to select from it gets clearer, but clicking on your name in the list should not be the only way of doing this."

**Blocked by:** none

**Status:** needs-triage

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
