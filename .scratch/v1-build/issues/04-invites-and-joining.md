# 04: Invites and joining

**What to build:** The owner opens the owner page from the gear, types a display name and presses "Create and copy link". The invited person opens the link, presses "Join as <display name>" and lands in the room as a member on a remembered device.

Spec: [People, devices and invites](../spec.md#people-devices-and-invites), [Other pages](../spec.md#other-pages) (owner page, Invites).

UI: build with the impeccable skill, following `DESIGN.md`.

Blocked by: 03

Status: resolved

- [x] The gear shows only to the owner and opens the owner page; a member requesting any owner route or action is refused
- [x] Invites section: a form with display name and room ticks, and the button "Create and copy link"; the link is copied at the press and also shown with a copy-again button
- [x] Pending invites are listed with rooms and expiry, each with copy and cancel; no ready-made message
- [x] An owner's invite lasts 7 days and is single-use
- [x] Opening an invite shows one button; only the press uses the invite up, remembers the device and makes the person a member with access to the invite's rooms
- [x] Merely fetching the invite's address (as a link preview does) uses nothing up
- [x] New members get access to the first room unless the invite says otherwise (only one room exists until ticket 08)
- [x] Until the press, the person is visible to the owner alone, as a pending invite
- [x] A used, expired or cancelled invite gives the "nothing here" page
- [x] Seam 1 tests for every rule; a Seam 2 journey from creating an invite to the new member standing in the room

## Comments

**Done** on `ticket/04-invites-and-joining`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass.

- Migration `0002-access-and-invites.sql`: `access` (member, room), `invite` (code, display name, made, expires) and `invite_room`. The owner still has every room by rule and has no `access` rows. It is tested on an instance set up on 0001 alone (`test/migrations.test.ts`).
- Routes: `GET /invite/<code>` (the app page, or "nothing here"), `GET /api/invites/<code>` (`{ name }`), and `POST /api/invites/<code>`, which is the press. It answers `{ to }` like setup does and sets the device cookie. Owner only: `GET /owner` and `/owner/people|invites|rooms|usage`, `GET` and `POST /api/owner/invites` (`{ name, rooms? }` gives `{ invite }`), and `DELETE /api/owner/invites/<code>` (204). Every refusal is the one "nothing here" answer, members included. The answer types are in `src/shared/api.ts`.
- An invite's address is `/invite/<code>`, where the code is 128 random bits in base64url (22 characters). **The code is stored as it is, not hashed**, because the owner can copy a pending invite's link again. A used or cancelled invite's rows are deleted. An expired one is refused at once and deleted the next time the owner lists invites.
- Only `POST` uses an invite. `GET` and `HEAD` use nothing, so a link preview cannot burn one. The press checks and uses the invite with nothing awaited in between, so two presses at the same moment cannot both join (tested).
- If the invite says nothing about rooms, the new member gets the first room. If it names rooms, it must name one or more of the instance's rooms, each once. An empty list, an unknown room, a name that is blank or over 40 characters (counted in code points and trimmed) are all refused. The form starts with the first room ticked and will not send without a room.
- Pressing an invite on a browser that is already remembered forgets that browser's old device, whoever it belonged to, as setup does. `People.newDevice` now does this for both setup and joining.
- Clipboard: "Create and copy link" passes a `ClipboardItem` holding a promise at the press, so the link reaches the clipboard once the invite is made and the press still counts. Browsers without one fall back to `writeText`. If the copy fails, the panel says "link is ready" with a "Copy" button instead of "on your clipboard". The panel shows the whole link, wrapped, rather than in a cut-off input.
- Expiry reads "expires in 7 days", rounded to the nearest day, hour or minute (`timeLeft` in `src/app/lib/words.ts`). It shows no date and no day of the week.
- The owner page asks `/api/me` before showing anything and shows "nothing here" to anyone but the owner. Pages reached inside the app are never fetched from the instance, so the server's refusal alone would not cover them.
- New pieces: a themed `Checkbox` (`src/app/lib/components/ui/checkbox`, on bits-ui), `src/app/lib/clipboard.ts`, and `andList` in `words.ts`. Ticket 09 can reuse the checkbox for its room ticks.
- For ticket 07 ("Add a device") and ticket 09 ("Let back in"): an invite for an existing member needs a `member_id` (and a 10-minute life for Add a device) on `invite`. `People.join` makes a new member every time for now.
- For ticket 05: until the room has presence, nothing shows a pending person anywhere but the owner's Invites section. The Seam 1 test only checks that members are refused the owner's list.
