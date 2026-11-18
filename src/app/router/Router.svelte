<script lang="ts">
  import type { Component } from "svelte";
  import Swap from "$lib/components/Swap.svelte";
  import { location, match, type Params, type Route } from "./router.svelte.ts";

  let { routes, fallback }: { routes: readonly Route[]; fallback: Component } = $props();

  // The page, its params, and which view of it this address is (see `Route.view`).
  const current = $derived.by(() => {
    const found = match(routes, location.pathname);
    const params = found?.params ?? {};
    return {
      Page: (found?.route.component ?? fallback) as Component<{ params: Params }>,
      params,
      view: found?.route.view?.(params) ?? location.pathname,
    };
  });
</script>

<Swap key={current.view} value={current}>
  {#snippet children({ Page, params })}
    <!-- A page that takes no props ignores the params it is given. -->
    <Page {params} />
  {/snippet}
</Swap>
