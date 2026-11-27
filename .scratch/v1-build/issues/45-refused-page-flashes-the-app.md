# 45: A refused visitor sees the app's page before "nothing here"

**What to build:** A browser the instance does not know gets the plain "nothing here" page from the first frame, never a glimpse of the app's own pages.

Owner's note (2026-11-18, on `graeae-test`, from a NixOS browser that is not a device while the owner's device is a Windows browser): "The rooms appear for a brief moment and then we get the warning about Nothing here. None of the names of the rooms actually appear, but the screen does."

Spec: [17](../spec.md) and "One plain page for every refused address" (`spec.md`, "Nothing here" page). The instance must reveal nothing about itself. No data leaks here, but the page still shows that this address is an app with a list of rooms, and the switch reads as a glitch.

Blocked by: none

Status: resolved

## What is known (not yet confirmed)

A first look at the code, not checked on `graeae-test`:

- A refused address answers the app's own `index.html` with status 404 (`src/instance/answers.ts`, `appPage(…, 404)`), so the whole app starts. The page cannot read its own status.
- At `/` the app draws the Rooms page: the header with the mark and "You", the "Rooms" heading, and skeleton rows. Ticket 33's hold-back keeps the rows out of sight for 300ms, but not the header and heading. It then opens the list's socket. Only when that fails does it ask `/api/rooms`, get refused, and switch to "nothing here" (`list-client.svelte.ts`, `connection.svelte.ts`). That takes a socket attempt and then a round trip.
- The room (`/r/<address>`) and "You" probably do the same: each draws its shell before learning it is refused. The owner page already waits on `/api/me` behind the loading mark.

## Open questions

- Should the instance tell the page it is refused from the start? For example, the 404 answer could carry a marker the app reads before drawing, or be the "nothing here" page alone. Either way it must not differ from any other refused address (spec 17).
- Or should each page hold its shell until the instance has answered? That is slower for members, every time.
- Check every page a stranger can reach: `/`, `/r/<address>`, `/you`, `/owner`, `/invite/<used code>`, `/setup` with a wrong secret.

## Comments

**2026-11-18, from ticket 33's whole pages.** The list of rooms now holds itself out of sight until it has its list or is refused, for up to 300ms. A refusal that arrives within that time shows "nothing here" first. A slower one still shows the Rooms page, now with no skeleton, before "nothing here". Not checked on `graeae-test`, and the other addresses are not looked at yet.

### 2026-11-19: built, the instance marks its refused page

**Chosen.** The first of the open questions: the instance tells the page it is refused from the start. Holding every page until the instance answers would have cost members a wait on every visit.

**Built.**
- `nothingHere` (`src/instance/answers.ts`) marks the app's page with `data-refused` on `<html>` (`REFUSED_MARK`, `src/shared/api.ts`). Every refusal still answers through it alone, so the answers stay identical byte for byte (`test/nothing-here.test.ts`, `test/invites.test.ts`). The mark says no more than the 404 does, but the page can read it before it draws. A page a visitor is let into never carries it.
- The router (`src/app/router/router.svelte.ts`) shows "nothing here" at the address the page was loaded at when it carries the mark. It checks before any page mounts, so there is no shell, no socket and no question to the instance. A move to another address within the page is the instance's to answer again.
- The setup page is the one route shown on a refused page (`whenRefused` in `App.svelte`). The instance refuses `/setup` to everyone, because the secret never reaches it in the address, and the page then moves into the room within the same page.
- A `?sample` under `pnpm dev` ignores the mark, so the samples still draw for a browser the instance does not know (`pnpm capture`'s samples project).

**What a stranger sees now**, with every answer from the instance slowed past the hold-back:
- `/`, `/r/<address>`, `/you`, `/owner`, `/owner/<section>` and `/invite/<made-up, used, expired or cancelled code>`: "nothing here" from the first frame, and nothing else ever.
- Before, `/` read "graeae Rooms" first, the room showed its share buttons and its loading mark, and `/you` showed its whole form. The owner page and the invite showed the loading mark.
- `/setup#<wrong secret>`: the one exception, since only sending the secret tells the page. It is blank for the hold-back, shows the loading mark until the instance refuses, then shows "nothing here". It never shows a page of the app's. `/setup` with no secret shows "nothing here" at once, as before.

**Tests.** Test first, at Seam 2, in `test/browser/nothing-here.spec.ts`. It slows every `/api/` answer to 600ms, records the page's text and loading mark from before its scripts run, and checks that only "nothing here" ever appears. Without the fix all six addresses failed, as listed above. The setup exception has its own test. Typecheck, lint, 431 tests in the Workers runtime and 60 journeys pass. The journeys ran by hand with `dist/graeae/.dev.vars` deleted (ticket 46).

**Review.**
- **Spec:** found that `?sample` under `pnpm dev` showed "nothing here" to a browser the instance does not know, which broke the capture's samples. Fixed: both samples failed without the fix and pass with it. Also found the setup exception was untested and this comment missing. Both are covered now.
- **Standards:** `api.ts`'s header now names the mark, the test's delay is named after the hold-back, and the test's setup is one helper.
- **Left as is:** `match` reads the refused address from the module, as the module already reads `window`. That keeps the rule in one place for every caller.

**Not done:** not deployed to `graeae-test`, and not checked there from a browser that is not a device. Both done below.

### 2026-11-19: deployed and closed

**Deployed to `graeae-test`** on 2026-11-19, from `163c36d` (version `c6bd98e5`), with `pnpm run deploy --name graeae-test`. The secrets were left as they were, since no `.secrets` file was uploaded.

**Checked on `graeae-test`, as a browser the instance does not know:**
- `/`, `/r/a-room`, `/you`, `/owner`, `/owner/people`, `/invite/not-a-real-invite`, `/setup` and `/api/rooms` each answer 404 with the same page, byte for byte. That page carries `data-refused` and loads the new script, `index-DKxViFNZ.js`, which has none of the fakes.
- `nothing-here.spec.ts`, run in a headless Chromium against the live instance over the real network (still with its 600ms slowdown), passes all seven tests. Every address shows only "nothing here", and the wrong setup secret shows the loading mark at most.

**Not checked on `graeae-test`:** a member's own pages, since this machine is not one of the instance's devices. Locally every journey a member takes passes. Only `nothingHere` adds the mark, and pages a visitor is let into never go through it.

**Cleaned up.** Nothing is left behind: no branch, no capture sets (the sample check's were deleted), and no temporary config.

**Still open, not this ticket's:** the fake-media build copying `.dev.vars` into `dist/graeae/` (ticket 46).
