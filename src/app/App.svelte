<script lang="ts">
  import NothingHere from "./pages/NothingHere.svelte";
  import Router from "./router/Router.svelte";
  import type { Route } from "./router/router.svelte.ts";

  // Pages join this table as later tickets build them. Any address it does not
  // match shows the one "nothing here" page.
  const routes: Route[] = [];
</script>

<Router {routes} fallback={NothingHere} />
