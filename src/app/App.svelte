<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Invite from "./pages/Invite.svelte";
  import NothingHere from "./pages/NothingHere.svelte";
  import OwnerAddress from "./pages/OwnerAddress.svelte";
  import Room from "./pages/Room.svelte";
  import Rooms from "./pages/Rooms.svelte";
  import You from "./pages/You.svelte";
  import Router from "./router/Router.svelte";
  import type { Route } from "./router/router.svelte.ts";

  // Every page at its final address. Any address this table does not match shows the
  // one "nothing here" page.
  const routes: Route[] = [
    { path: "/", component: Rooms },
    { path: "/r/:room", component: Room },
    { path: "/you", component: You },
    { path: "/invite/:invite", component: Invite },
    { path: "/owner", component: OwnerAddress },
    { path: "/owner/:section", component: OwnerAddress },
  ];
</script>

<Tooltip.Provider>
  <Router {routes} fallback={NothingHere} />
</Tooltip.Provider>
