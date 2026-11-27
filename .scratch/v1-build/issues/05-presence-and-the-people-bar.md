# 05: Presence and the people bar

**What to build:** Two members open the same room and see each other in the bar: present members first, then, dimmed, the members who have access but are not present. The bar updates live as people arrive, leave and change their display names.

Spec: [Presence and the signaling connection](../spec.md#presence-and-the-signaling-connection), [The room's screen](../spec.md#the-rooms-screen).

UI: build with the impeccable skill, following `DESIGN.md`.

Blocked by: 04

Status: resolved

- [x] Each open tab holds one WebSocket to the instance and says which room it is showing; the instance uses hibernating connections
- [x] The socket is refused for an unremembered device and for a room the member has no access to
- [x] Socket message types are shared between front end and backend by plain imports
- [x] A tab gets the full room state on connecting, then changes as they happen
- [x] A member is present while at least one of their devices has the room open, and is listed once however many devices that is
- [x] Two tabs on two rooms make a member present in both
- [x] A clean leave (tab closed, reload, navigating away) ends that tab's presence at once
- [x] The bar lists present members first, then absent members with access, dimmed; the owner appears like anyone else
- [x] The collapsed rail shows initials
- [x] A member's own row is marked as theirs (it leads to the "You" page in ticket 07)
- [x] Seam 1 tests drive several sockets; a Seam 2 journey with two browsers
- [x] The shared socket message types are laid out by area (presence, people, shares, usage), so tickets built in parallel rarely edit the same definitions

## Comments

**Done** on `ticket/05-presence-and-the-people-bar`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass. No migration: presence lives only in the sockets.

- **The socket.** A tab on `/r/<address>` opens `GET /api/socket/<address>` (`roomSocketPath` in `src/shared/socket/index.ts`). An unremembered browser, a room without access, a room that does not exist and a request without `Upgrade: websocket` all get the one "nothing here" answer. The instance accepts with `ctx.acceptWebSocket` (hibernating), tagged `room:<address>`, `member:<id>` and `device:<id>`, and keeps `{ id, member, device, room }` as the socket's attachment. Ticket 07 (forgetting a device) and 09 (removal) can find a device's or member's sockets by tag with `ctx.getWebSockets(tag)`.
- **The protocol** is in `src/shared/socket/`, one file per area: `room.ts`, `people.ts`, `presence.ts`, `shares.ts`, `usage.ts` (the last two are empty placeholders). Each area holds its slice of the state (`XState`), its changes (`XChange`), what a tab may ask of it (`XRequest`) and `applyX(state, change)`. `index.ts` holds the envelope and changes only for a new area: the instance sends `{ type: "state", state: RoomView }` first, then `{ type: "<area>", change }`; a tab sends `{ type: "<area>", request }`. A new kind of change goes in its area's union and its `applyX`. `unknownChange` (`area.ts`) makes a forgotten case fail to compile.
- **Presence.** A member is present while any of their open sockets is on the room; `presence.arrived` goes out when their first tab opens and `presence.left` when their last tab closes, to the room's other tabs only. A clean close ends presence at once, and so does a socket error for now: ticket 06 turns an unclean close into the grace period. The instance answers the browser's close frame itself in `webSocketClose`; without it the browser's close never finishes. Nothing is sent by a tab yet, and the instance ignores any message it does not understand.
- **People.** The state lists every member with access, the owner included (`People.membersOf`), and `you: { id, owner }`. Pressing an invite sends `people.added` to the tabs of each room the new member got access to, so a member arriving straight from an invite shows up already known. `people.renamed` is defined and applied by the page but nothing sends it yet: **ticket 07** sends it to every room of the member when they change their display name.
- **Several devices.** Seam 1 shows a member present once with two tabs in one browser and a third browser holding a copy of the same device's cookie. A real second device needs "Add a device" (ticket 07); presence is counted per member, so nothing changes for it.
- **Two rooms.** To test presence in two rooms, this ticket adds `POST /api/owner/rooms` with `{ name }` (owner only; 1 to 40 characters trimmed, as a display name; answers `{ room }`, type `CreateRoomAnswer`) and `createRoom` in `test/steps.ts`. `addMember` takes rooms too. **Ticket 08** builds the Rooms section on this route and adds renaming (a `room` area change, `renamed`).
- **The page.** `src/app/lib/room-client.svelte.ts` is the room client: one per room page, it opens the socket, holds `view` and applies messages with `applyMessage`. Leaving the page (another address in the app, reload, closing the tab) closes the socket. A socket that closes before any state makes the client ask `GET /api/rooms/<address>`; a refusal there shows "nothing here", since a browser cannot see why a socket upgrade failed. **Ticket 06** adds the heartbeat and reconnecting to this class; today a dropped socket leaves the page as it was.
- **The bar.** "Here" lists the other present members by name (alphabetical), then your own row ("· you", a link to `/you`); "Not here" lists absent members with access, alphabetical and dimmed. The rail shows the present members other than you as initials. Decision: alphabetical rather than order of arrival, so rows do not move about as people come and go; the owner may prefer otherwise.
- The `GET /api/rooms/<address>` route stays, used only for the refusal check above.
