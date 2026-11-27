# 03: Setup secret makes the owner

**What to build:** The deployer opens `/setup#<secret>` and that browser becomes the owner's first device, with the first room created; the owner lands in that room's empty shell. From then on the browser is a remembered device and needs no login. Using the setup secret again later makes a browser an owner device and forgets all the owner's other devices.

Spec: [The setup secret](../spec.md#the-setup-secret), [People, devices and invites](../spec.md#people-devices-and-invites), [Seam 2](../spec.md#seam-2-the-app-in-a-browser).

UI: build with the impeccable skill, following `DESIGN.md`.

Blocked by: 01, 02

Status: resolved

- [x] The setup page sends the part after `#` to the backend itself; it is never in a request address
- [x] First use creates the owner, their first device and the first room, and lands the owner in that room
- [x] A later use makes this browser an owner device and forgets every other owner device
- [x] A wrong secret gives the "nothing here" page, indistinguishable from any other refused address
- [x] A setup secret that is missing or shorter than 32 characters refuses setup entirely
- [x] A setup page shown to someone holding the setup secret names any other missing secret
- [x] A device is remembered by a cookie for 400 days from its last visit, renewed on every visit, and forgotten after that
- [x] The instance records each device's browser, operating system and last use
- [x] The root address takes a remembered device with one room straight into it; an unremembered browser gets "nothing here"
- [x] Seam 1 tests cover all of the above
- [x] Seam 2 harness: a real Chromium against the app running locally; setup-to-room is its first journey

## Comments

From ticket 01: `test/migrations.test.ts` shows an older schema starting on newer code, but checks it by reading a stand-in table inside the instance, because nothing over HTTP showed data then. Once this ticket adds the first real migration and an owner over HTTP, redo that check over HTTP as `CLAUDE.md` describes, and drop the direct read.

**Done** on `ticket/03-setup-secret-makes-the-owner`. `pnpm test` (Seam 1, then Seam 2), `pnpm typecheck` and `pnpm lint` pass.

- The first real migration is `0001-owner-devices-and-rooms.sql`: `member` (one owner at most, by a unique index), `device` and `room`. There is no `access` table yet: the owner has every room by rule, and ticket 04 adds access for members.
- `/setup#<secret>`: the server answers `/setup` like any refused address, since it cannot see the secret. The page reads the `#` part, takes it out of the address bar and history at once, and sends it in the body of `POST /api/setup`. A wrong, empty or missing secret, an instance secret that is unset or under 32 characters, and a malformed body all get the one "nothing here" answer. The secret is compared as SHA-256 hashes with `timingSafeEqual`.
- The answer to setup is `{ to, missing }`: `to` is the room when the owner has one, otherwise `/`. When other secrets are unset, the page names them and offers "Go to the room"; setup still makes the device, so the owner is not locked out by a missing media secret. Otherwise the page goes straight into the room.
- A later use deletes every owner device, and also the device this browser held before (whoever's it was), then remembers this browser as a new owner device.
- The device cookie is `__Host-device`: 256 random bits in base64url, `Max-Age` of 400 days, `Secure; HttpOnly; SameSite=Lax`. Only its SHA-256 is stored. Every request from a remembered device, refused addresses included, sets its last use to now and sends the cookie again for another 400 days. A device last used 400 days ago or more is deleted the first time it is seen again. Chromium accepts `__Host-` cookies on `http://localhost`, so `pnpm dev` works.
- Browser and operating system are recorded when a device is remembered and are not updated after that. They come from the `Sec-CH-UA` brand and platform hints when sent (so Brave says "Brave"), and from the User-Agent otherwise. Windows 10 and 11 cannot be told apart.
- Decisions for the owner to change if they like: the owner's display name starts as "Owner" and the first room is called "First room" (the "You" page and the Rooms section rename them later). A room address is 10 random characters from a 32-letter alphabet, because an address should say nothing about the instance.
- Routes added: `GET /` (302 into the only room, or the app page with several), `GET /r/<address>`, `GET /api/rooms`, `GET /api/rooms/<address>`, `GET /api/me` (name, owner flag, devices with browser, os, lastUsed, current). Their answer types are in `src/shared/api.ts`. Ticket 05 may replace the room answer with the socket's state. Ticket 07 can build the device list on `/api/me`.
- The page side: `src/app/lib/api.ts` (`getJson`, `postJson`, `load`). Room and Rooms show "nothing here" when the instance refuses them. Rooms goes straight into the room when there is only one. Until presence exists (ticket 05), the room's bar shows only you under "Here".
- Fixed from ticket 01: the Worker exported the string `INSTANCE_NAME`, and workerd refuses to start a built Worker that exports anything but handlers and classes. `vite preview` failed on it, and a real deploy most likely would have too. It now lives in `src/instance/instance.ts`.
- The Seam 1 harness gained `instance.browser({ userAgent, cookies })`, a browser with a cookie jar, and `startInstance({ secrets })` to unset or change a secret. Answers are read in full before they are returned, so a test can look at the status alone. Shared steps (`useSetupSecret`, `setUpOwner`, `answer`) are in `test/steps.ts`.
- Migrations are now checked over HTTP, as ticket 01 asked: an owner set up on the shipped migrations still gets into their room after a restart onto two stand-in later migrations, and the stand-ins prove the migrations run in order and once each. The direct read is gone. There is nothing before 0001 to hold data, so 0001 itself has no older-data test. Ticket 04's migration is the first that can have one.
- **Seam 2 harness:** `playwright.config.ts` and `test/browser/*.spec.ts`. It builds nothing itself: `pnpm test` builds, runs Seam 1, then Playwright; `pnpm test:browser` builds and runs Seam 2 alone. Playwright starts `vite preview` (the built app) on a free port, with the secrets in `test/browser/app.ts` and `GRAEAE_EMPTY_INSTANCE=1`, which makes the instance live in memory. Each run therefore starts on an empty instance, and journeys within a run share it. One worker, headless. The Chromium is the one `shell.nix` provides (`GRAEAE_CHROMIUM`); elsewhere, `pnpm exec playwright install chromium`. Readiness is the open port, because every address answers 404 to an unknown browser. The first journeys are setup-to-room (the secret is in no request address and in exactly one request body, and `/` then goes straight in), a wrong secret, and an unknown browser at `/`.
- Seam 1 runs with `maxWorkers: 2`.
- For `pnpm dev`, put the five secrets in a git-ignored `.dev.vars`, or set them in the environment, then open `/setup#<SETUP_SECRET>`.
