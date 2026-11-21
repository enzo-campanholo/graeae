# The owner page and "You" as an overlay

Type: prototype
Status: open
Blocked by: none
Map: ../map.md

## Question

How should the owner page and the "You" page look and behave when they open over the room as an overlay, instead of in a new tab?

Decided while charting: they open over the room, the stage keeps running underneath (shares and watching carry on), and graeae becomes one tab. The overlay keeps an address of its own, so a link, a reload and the back button work; from the list of rooms they open the same way. Every `target="_blank"` goes: the gear (`BarHeader.svelte`), the member's own row (`PersonRow.svelte`), "You" in `YouMenu.svelte`, and "Raise it in Usage" (`StageEmpty.svelte`, `BudgetStrip.svelte`). This reverses the spec's rule that they open in a new tab (spec, The room's screen: Bar header, Bar body) and fixes the "You" page looking empty as a full page.

Open for the prototype: its size (a sheet over the stage, a centred panel, a side panel), how it closes, whether the room underneath stays visible or dims, how the owner page's four sections (People, Invites, Rooms, Usage) sit in it, and how the "You" page fills it. Follow `DESIGN.md`, `PRODUCT.md` and the craft lens (`.impeccable/reference/craft/lens.md`).

The owner is busy: an agent builds two or three variants on the fakes (`pnpm dev:fake-media`), on a throwaway `prototype/overlay` branch, takes screenshots of each at 1920×953 and 1366×768, dark and light, and puts them in front of the owner in one sitting to pick from. The answer records the pick and the behaviour, ready to become a build ticket with the spec and `DESIGN.md` changes.
