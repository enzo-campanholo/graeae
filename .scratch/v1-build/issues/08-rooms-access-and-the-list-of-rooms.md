# 08: Rooms, access and the list of rooms

**What to build:** The owner creates a second room and renames rooms on the owner page, and invites grant access per room. A member with several rooms sees a live list of them at the root address; a member with one still goes straight in.

Spec: [Rooms and access](../spec.md#rooms-and-access), [Other pages](../spec.md#other-pages).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 05

**Status:** resolved

- [x] Rooms section: create a room, rename a room, see each room's address; the address is fixed at creation and survives a rename
- [x] The invite form's room ticks grant access to exactly those rooms
- [x] The owner has access to every room, including ones created later
- [x] A room that does not exist and a room the visitor has no access to give the same "nothing here" page, for a stranger and for a member alike
- [x] The root address shows a member with several rooms a list: each room's name and the display names of the members present (the count of live shares arrives with ticket 10)
- [x] The list updates live and makes the member present nowhere
- [x] The list carries a link to the "You" page, and the gear for the owner
- [x] The bar header's link back to the list shows only to a member with more than one room
- [x] A rename reaches present members live
- [x] No deleting of rooms
- [x] Seam 1 tests; a Seam 2 journey through the list

## Comments

**Done** on `ticket/08-rooms-access-and-the-list-of-rooms`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration: a room's name was already its own column.

- **Routes.** `PATCH /api/owner/rooms/<address>` with `{ name }` renames a room (1 to 40 characters trimmed, as a display name) and answers `{ room }` (`RenameRoomAnswer`). `GET /api/owner/rooms` answers `{ rooms }` (`OwnerRoomsAnswer`), every room oldest first, for the Rooms section. Both are owner only. A member, a room that does not exist and a bad name all get the one "nothing here" answer. There is no route that deletes a room.
- **Rename, live.** Tabs on the room hear `{ type: "room", change: { type: "renamed", name } }` (the room area's first change), and the bar header and the tab title follow.
- **The list's socket** is `GET /api/socket` (`LIST_SOCKET_PATH` in `src/shared/socket/list.ts`, its own small protocol beside the room's). It sends `{ type: "state", state: { you: { owner }, rooms: [{ address, name, present }] } }` first, then `{ type: "rooms", change: { type: "listed", room } }` whenever a room's line changes: replaced when listed, added at the end when new. `present` is display names, alphabetical. The instance computes a line once and sends it to every list whose member has access (`Instance.relist(address)`). It is called on arrival and on leaving (Signaling now takes a `presenceChanged` callback), on a rename and on a new room. List sockets are tagged `list`, `member:<id>` and `device:<id>`, and their attachment has `list: true` and no room. So they never count as presence, and tickets 07 and 09 close them along with a device's or member's room tabs when they cut off by tag.
- **The bar's link back.** `people.you` now carries `rooms`, how many rooms the member has access to, and the header shows the house only when it is more than one. A new change, `{ type: "people", change: { type: "access", rooms } }`, goes to that member's room tabs alone (`Signaling.toMember`). Making a room sends it to the owner's tabs today. **Ticket 09** sends it when it grants or takes away access, and should `relist` the room too (and send `listed` to a member newly given access: their list gets the line added).
- **For ticket 07:** when a member changes their display name, call `relist` for each of their rooms, since the list shows the names of those present.
- **For ticket 10:** add the live share count to `ListedRoom` and `relist` when a share starts or ends. The page already shows "N shares live" when a line has a `live` above 0. Today it fills `live: 0`.
- **For ticket 06:** the list client (`src/app/lib/list-client.svelte.ts`) mirrors the room client. It needs the same heartbeat and reconnecting, and the instance's grace period should leave list sockets out of presence as it is now.
- **Pages.** The owner page's Rooms section (`src/app/pages/owner/Rooms.svelte`) has a "Room name" form with "Create room" beside "Every room". Each row shows the room's name, its address as `host/r/<address>`, "Copy link", and "Rename". Rename opens an inline field in the row (Enter saves, Escape cancels) that says the address stays. The list of rooms (`src/app/pages/Rooms.svelte`) now runs on its socket. It still goes straight into a member's only room, and it shows "No one here" or the names present, joined as "A, B and C".
- Decisions the owner may change: the Rooms section shows the address without the scheme (`graeae.example/r/abc…`), and copy puts the full `https://` link on the clipboard. A new room grants access to the owner alone; members get it through an invite (and ticket 09's ticks).
- Fixed while building: typing a new room name while the last one was still being made used to wipe the text when the answer came back. Now only the name that was sent is cleared. The Invites form has the same race and was left alone: it is not this ticket's.
- **Seam 2:** `test/browser/rooms.spec.ts` runs as its own Playwright project ("several rooms"), which depends on the default one. Journeys share one instance, and once the owner has two rooms, setup and the root address take the owner to the list. A later journey that needs the owner in one room must run in the default project. A journey that adds rooms must run in "several rooms" or later.
