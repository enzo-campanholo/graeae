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

  // Every page at its final address. Any address this table does not match shows the
  // one "nothing here" page.
  const routes: Route[] = [
    { path: "/", component: Rooms },
    { path: "/r/:room", component: Room },
    { path: "/setup", component: Setup },
    { path: "/you", component: You },
    { path: "/invite/:invite", component: Invite },
    // One view: the owner page swaps its sections itself.
    { path: "/owner", component: OwnerAddress, view: () => "owner" },
    { path: "/owner/:section", component: OwnerAddress, view: () => "owner" },
  ];
</script>

<Tooltip.Provider>
  <Router {routes} fallback={NothingHere} />
</Tooltip.Provider>
