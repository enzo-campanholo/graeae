<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Invite from "./pages/Invite.svelte";
  import NothingHere from "./pages/NothingHere.svelte";
  import OwnerAddress from "./pages/OwnerAddress.svelte";
  import Room from "./pages/Room.svelte";
  import Rooms from "./pages/Rooms.svelte";
  import Setup from "./pages/Setup.svelte";
  import You from "./pages/You.svelte";
  import Router from "./router/Router.svelte";
  import type { Route } from "./router/router.svelte.ts";

  const OWNER = { name: "Owner", size: "wide" } as const;

  // Every page at its final address. Any address this table does not match shows the
  // one "nothing here" page.
  const routes: Route[] = [
    { path: "/", component: Rooms },
    { path: "/r/:room", component: Room },
    { path: "/setup", component: Setup, whenRefused: true },
    { path: "/you", component: You, overlay: { name: "You", size: "column" } },
    { path: "/invite/:invite", component: Invite },
    // One view: the owner page swaps its sections itself. "You" and the owner page draw
    // over the page they were opened from (see `Route.overlay`).
    { path: "/owner", component: OwnerAddress, view: () => "owner", overlay: OWNER },
    { path: "/owner/:section", component: OwnerAddress, view: () => "owner", overlay: OWNER },
  ];
</script>

<Tooltip.Provider>
  <Router {routes} fallback={NothingHere} />
</Tooltip.Provider>
