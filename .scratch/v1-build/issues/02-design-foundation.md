# 02: Design foundation

**What to build:** The visual direction for graeae, set by the owner with the impeccable skill, and the empty shells every later ticket fills in. After this, an implementer building any page has a `PRODUCT.md`, a `DESIGN.md`, themed components and a shell to put its work in, and does not invent a look.

This ticket is driven by the owner, because the direction is a matter of taste.

Spec: [The room's screen](../spec.md#the-rooms-screen), [Other pages](../spec.md#other-pages), [Left to the build](../spec.md#left-to-the-build). Primary sources for layout: the prototype branches `prototype/room-experience` (variant D) and `prototype/owners-admin-surface` (variant B).

**Blocked by:** 01

**Status:** ready-for-human

- [ ] `PRODUCT.md` at the repo root, written with impeccable's `init` from the spec and the glossary
- [ ] `DESIGN.md` at the repo root, recording the chosen direction and its tokens
- [ ] shadcn-svelte is themed from those tokens
- [ ] Room shell: a bar on the left (header, body, foot) that collapses to a rail with a toggle button and a key, and an empty stage filling the rest
- [ ] The bar is wide enough for its two share buttons (the prototype's was not)
- [ ] Bar header layout: the room's name centred between a home icon for the list of rooms and the gear
- [ ] Shell for the plain pages: the list of rooms, the "You" page, the one-button invite page, the owner page with its four-section navigation
- [ ] The "nothing here" page in its final form
- [ ] No phone layout
- [ ] Each shell is reachable at its final address, so tickets built in parallel can link to each other's pages
- [ ] In a maximised browser on a 1080p monitor, a single 16:9 share on the stage is limited by height, not by the bar
