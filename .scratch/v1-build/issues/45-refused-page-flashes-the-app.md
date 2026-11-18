# 45: A refused visitor sees the app's page before "nothing here"

**What to build:** A browser the instance does not know gets the plain "nothing here" page from the first frame, never a glimpse of the app's own pages.

Owner's note (2026-11-18, on `graeae-test`, from a NixOS browser that is not a device while the owner's device is a Windows browser): "The rooms appear for a brief moment and then we get the warning about Nothing here. None of the names of the rooms actually appear, but the screen does."

Spec: [17](../spec.md) and "One plain page for every refused address" (`spec.md`, "Nothing here" page). The instance must reveal nothing about itself. No data leaks here, but the page still shows that this address is an app with a list of rooms, and the switch reads as a glitch.

**Blocked by:** none

**Status:** needs-triage

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
