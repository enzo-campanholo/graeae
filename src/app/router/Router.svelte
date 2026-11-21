<script lang="ts">
  import type { Component } from "svelte";
  import Swap from "$lib/components/Swap.svelte";
  import { tabLog } from "$lib/log.ts";
  import Overlay from "$lib/prototype-overlay/Overlay.svelte";
  import { isOverlay, location, match, type Params, type Route } from "./router.svelte.ts";

  let { routes, fallback }: { routes: readonly Route[]; fallback: Component } = $props();

  function pick(pathname: string) {
    const found = match(routes, pathname);
    const params = found?.params ?? {};
    return {
      Page: (found?.route.component ?? fallback) as Component<{ params: Params }>,
      params,
      view: found?.route.view?.(params) ?? pathname,
      page: found?.route.path ?? "nothing here",
    };
  }

  // PROTOTYPE (prototype/overlay): at an overlay address the page under it stays mounted
  // as the router's page, and the overlay's page draws over it.
  const overlaid = $derived(isOverlay(location.pathname));
  const current = $derived(pick(overlaid ? new URL(location.under ?? "/", window.location.origin).pathname : location.pathname));
  const over = $derived(overlaid ? pick(location.pathname) : null);

  // Each page the router chooses, for the page's log.
  $effect(() => {
    tabLog.info("page.route", { ...tabLog.where(location.pathname), shows: over?.page ?? current.page });
  });
</script>

<Swap key={current.view} value={current}>
  {#snippet children({ Page, params })}
    <!-- A page that takes no props ignores the params it is given. -->
    <Page {params} />
  {/snippet}
</Swap>

{#if over}
  <Overlay kind={over.page === "/you" ? "you" : "owner"}>
    <Swap key={over.view} value={over}>
      {#snippet children({ Page, params })}
        <Page {params} />
      {/snippet}
    </Swap>
  </Overlay>
{/if}
