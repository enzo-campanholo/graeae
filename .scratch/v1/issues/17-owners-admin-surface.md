# Owner's admin surface

Type: prototype
Status: resolved
Branch: prototype/owners-admin-surface (prototype in `prototype/owners-admin-surface/`, run with `./dev.sh`; throwaway, never merged; published privately at https://claude.ai/artifact/K36bdwK6wDn1G9MYtkfWcD)
Blocked by: 12
Map: ../map.md

## Question

Where in the app, and through what screens, does the owner administer the instance?

The actions are fixed by [People and rooms](06-people-and-rooms.md) and [Getting in](10-getting-in.md): create an invite with a display name and rooms, see and cancel pending invites, let a member back in, remove a member from a room or from the instance, grant and take away access to a room, see and forget any member's devices, and create and rename rooms.

Decide, with something concrete to react to:

- Whether these live inside the room view, on a separate owner page, or both, building on the layout from [Room experience](12-room-experience.md).
- The flow for inviting someone, from pressing a button to having a link to paste into Discord.
- What removal asks the owner to confirm, given that it takes effect within about 2 seconds.
- Where a member's own screens sit: their device list, "Add a device" and changing their display name.

From [Room experience](12-room-experience.md): the room is a left bar listing people (present members, then members with access who are not present) beside a stage. The prototype to build on is variant D on the branch `prototype/room-experience`.

From [Usage budget](14-usage-budget.md): the owner's surface also holds a usage meter (GB used, the usage budget, projected month-end), the budget and reset-day settings, and the confirm for raising the budget, which names the maximum added cost.

## Answer

Settled with the user on 2026-11-16 by reacting to a clickable prototype built on the room from [Room experience](12-room-experience.md). The prototype is on the throwaway branch `prototype/owners-admin-surface` (commit `6dbf27d`, in `prototype/owners-admin-surface/`, run with `./dev.sh`) and published privately at https://claude.ai/artifact/K36bdwK6wDn1G9MYtkfWcD. The winner is its variant B, "Owner page". Variant A (row menus and popovers hanging off the bar) was the least liked: it scatters information everywhere. Variant C (a panel beside the stage) lost to B as well.

**Where it lives**

- The owner administers the instance on a separate owner page. The room is the same for every member; the only difference for the owner is a gear in the bar's header that opens the owner page.
- Nothing owner-only hangs off the people bar. The bar is about one room, while most owner actions are about the whole instance, and mixing them leaves the owner unsure what an action applies to.
- The owner page has four sections: People, Invites, Rooms and Usage.
- People lists every member of the instance with their access to each room, device count and last visit. Picking a member shows their room access as one tick per room, their devices with "Forget", "Let back in" and "Remove from graeae".
- Rooms renames rooms, shows each room's fixed address, and creates rooms.
- Usage holds the meter (GB used, the usage budget, projected month-end), the budget and reset-day settings, and the confirm for raising the budget that names the maximum added cost, as fixed by [Usage budget](14-usage-budget.md). A small meter stays visible in the owner page's navigation.
- The 80% warning the owner gets, and the 95% warning everyone present gets, show as a strip above the stage. The owner's strip links to Usage.

**Inviting**

- On Invites the owner types a display name, ticks the rooms, and presses one button, "Create and copy link". The link is on the clipboard at that press and is also shown, with a button to copy it again.
- No ready-made message is offered: the bare link is what gets pasted into Discord.
- Pending invites are listed beside the form with their rooms and expiry, each with copy and cancel.

**Removal**

- Every removal asks for a confirm, with no exception: from one room or from the instance, whether the member is present or not. A wrong removal is painful to correct, and a stray click on a single room could otherwise go unnoticed.
- The confirm is a modal dialog. It says what will happen: whether the member is present and what they are sharing, that it stops within about 2 seconds, which rooms they keep, and, for removal from the instance, that their devices are forgotten and coming back takes a new invite.
- Removing from one room is done by unticking that room in the member's room access; the tick stays until the dialog is confirmed.
- No countdown and no undo.

**A member's own screens**

- A member's row for themselves in the bar leads to a "You" page: display name, their devices with "Forget", and "Add a device". It is the same for the owner and every member.
- The list of rooms at the root address carries the same link to the "You" page, and the gear for the owner, so both are reachable without being in a room.

**Back to the list of rooms**

- The link back to the list of rooms moves from the top of the stage, where it was hard to find, into the bar's header beside the room name. It shows only to a member with more than one room.

**Passed on**

- To spec assembly: the user prefers a home icon over a back arrow for returning to the list of rooms, with the room's name centred between the header's icons. Icons, exact header layout and visual polish were not decided on the prototype.

**Glossary.** No new terms. No ADR: all of this is easy to change later.
