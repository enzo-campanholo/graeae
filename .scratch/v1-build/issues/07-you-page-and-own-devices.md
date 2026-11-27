# 07: "You" page and own devices

**What to build:** A member clicks their own row in the bar and reaches the "You" page, where they change their display name, see their devices, forget any of them, and press "Add a device" to get a 10-minute invite to open on another browser.

Spec: [People, devices and invites](../spec.md#people-devices-and-invites), [Other pages](../spec.md#other-pages).

UI: build with the impeccable skill, following `DESIGN.md`.

Blocked by: 05

Status: resolved

- [x] The "You" page is the same for every member and the owner
- [x] Changing the display name reaches present members live
- [x] The device list shows browser, operating system and last use for each device
- [x] "Add a device" shows a single-use invite valid for 10 minutes; opening it on another browser shows the same one-button page and makes that browser a device of the same member
- [x] No approval step on the old device, no limit on devices, no QR code
- [x] A member forgets any of their own devices without the owner
- [x] A forgotten device that has a room open has its connection closed and its page becomes the plain "nothing here" page, with no message
- [x] An owner's device added this way carries full owner powers
- [x] Seam 1 tests; a Seam 2 journey adding a second browser and forgetting it

## Comments

**Done** on `ticket/07-you-page-and-own-devices`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass, after merging `v1-build` with ticket 08 in it.

- **Migration `0003-invites-for-a-member.sql`** adds `member_id` (who an invite is for, when they already exist) and `kind` (`'owner'` or `'device'`, default `'owner'`) to `invite`. The owner's pending list shows `kind = 'owner'` alone, so a member's "Add a device" links stay private to them. It is tested on an instance set up on 0001–0002 holding an owner and two pending invites (`test/migrations.test.ts`). **Ticket 09** can make "Let back in" an `'owner'` invite with a `member_id`. It will then show in the owner's list. `People.join` already takes an invite with a `member_id` as a new device of that member; "Let back in" still has to forget their other devices at the press.
- **Routes** (any remembered device, the owner included; refusals are the one "nothing here" answer): `GET /you` (the app page), `POST /api/me/name` with `{ name }` (1 to 40 characters trimmed, as in an invite; answers `Me`), `POST /api/me/devices` (answers `{ invite: { code, expiresAt } }`, `DeviceInviteAnswer`), `DELETE /api/me/devices/<id>` (204; another member's device or an unknown id is refused). `GET /api/me` is unchanged.
- **Add a device** makes a 22-character code like the owner's, valid 10 minutes, single use. Its link is `/invite/<code>`, the same page and press as the owner's invite. The page reads "Join as <current display name>". The press makes the browser another device of the same member, so an owner's device added this way is an owner device, with no approval and no limit. A member whose invite is used after they are gone gets nothing: an invite for a member who no longer exists is no invite.
- **Rename** sends `people.renamed` (from ticket 05) to every tab of every room of the member, their own tabs too. It also calls ticket 08's `relist` for each room where they are present, so the lists of rooms show the new name.
- **Forgetting** changes storage first, then `Signaling.closeDevice(id)` closes every socket tagged with the device, room tabs and list tabs alike. Each tab first gets `{ type: "gone" }` (added to `ServerMessage` and `ListMessage`), then a close with code 4404. The room hears `presence.left` if that was the member's last tab there. **Why the message:** under `vite preview` the instance's close frame often never reached Chromium, while ordinary frames did. The spec's cut-off step 5 says "tell the affected tabs, and close", so the tab is told. On `gone`, the room and list clients show "nothing here" and close their end. On any close they did not start themselves, they also ask `/api/rooms…` and show "nothing here" if refused. **Ticket 09** can reuse `closeDevice` for the owner forgetting a device. For removal, it can do the same by `member:<id>` tag.
- Forgetting the device you are on is allowed. It answers with `Set-Cookie: __Host-device=; Max-Age=0`, and the page becomes "nothing here". The page asks first, inline in the row ("Coming back on this browser will take a new invite." with Keep / Forget this device). Other devices are forgotten at the press, since adding one back takes a single invite.
- **The page** (`src/app/pages/You.svelte`): display name with Save (shows "Saved" for a moment; a refused name says why), devices as "Chrome on Windows" with "This device" or "Last used 3 days ago" (`deviceLabel` and `timeAgo` in `words.ts`), and "Add a device", which copies the link at the press like the owner's "Create and copy link" and shows it with "Copy again" and "expires in 10 minutes", then "That link has run out". The device list reloads when the window gets focus again, and the link panel goes once a new device shows up. The gear shows for the owner. The sample under `?sample` now uses the `MeAnswer` shape.
- **Left as it was:** setup and pressing an invite on a browser that is already remembered forget that browser's old device, as before, but do not close its open tabs. Ticket 21 (sweep) or 09 may want `closeDevice` there too.
- The Seam 1 harness now gives a 204 a null body (it logged a warning on every `DELETE`), and a test tab has `closed()`.
- **Seam 2:** `test/browser/you.spec.ts` (default project): Fia renames from "You" and the owner's bar follows. Fia adds a second browser through the link and presses Join. The new device shows up on the first browser. Forgetting it turns its open room into "nothing here" and moves Fia to "Not here" in the owner's bar. One full `pnpm test` run timed out in this journey (30 s, with no failing step shown) and did not happen again in six runs since. I could not tell whether it was this machine's load or the preview proxy; if it recurs, the trace is in `test-results/`.


**Code review fix:** the open point above is fixed. Using the setup secret again and pressing an invite on a browser that is already remembered now cut off the devices they forget, through the cut-off routine (see ticket 28's code review comment).
