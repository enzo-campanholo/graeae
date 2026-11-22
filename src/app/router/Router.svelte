<script lang="ts">
  import type { Component } from "svelte";
  import Overlay from "$lib/components/Overlay.svelte";
  import Swap from "$lib/components/Swap.svelte";
  import { tabLog } from "$lib/log.ts";
  import { closeOverlay, location, match, useRoutes, type Params, type Route } from "./router.svelte.ts";

  let { routes, fallback }: { routes: readonly Route[]; fallback: Component } = $props();

  // svelte-ignore state_referenced_locally
  useRoutes(routes);

  // The page, its params, and which view of it this address is (see `Route.view`).
  function pick(pathname: string) {
    const found = match(routes, pathname);
    const params = found?.params ?? {};
    return {
      Page: (found?.route.component ?? fallback) as Component<{ params: Params }>,
      params,
      view: found?.route.view?.(params) ?? pathname,
      page: found?.route.path ?? "nothing here",
      overlay: found?.route.overlay ?? null,
    };
  }

  // At an overlay's address, the page under it stays the router's page, as it was, and
  // the overlay's page draws over it. Each is picked again only when its own pathname
  // changes, so a move of the overlay's gives the page under it nothing new, not even
  // its params again.
  const pagePath = $derived(location.under === null ? location.pathname : new URL(location.under, window.location.origin).pathname);
  const current = $derived(pick(pagePath));
  const over = $derived(location.under === null ? null : pick(location.pathname));

  // Each page the router chooses, for the page's log.
  $effect(() => {
    tabLog.info("page.route", {
      ...tabLog.where(location.pathname),
      shows: over?.page ?? current.page,
      ...(over ? { under: current.page } : {}),
    });
  });
</script>

<Swap key={current.view} value={current} covered={!!over}>
  {#snippet children({ Page, params })}
    <!-- A page that takes no props ignores the params it is given. -->
    <Page {params} />
  {/snippet}
</Swap>

{#if over?.overlay}
  {#key over.overlay.name}
    <Overlay name={over.overlay.name} size={over.overlay.size} onclose={closeOverlay}>
      {#snippet children(onshow)}
        <Swap key={over.view} value={over} {onshow}>
          {#snippet children({ Page, params })}
            <Page {params} />
          {/snippet}
        </Swap>
      {/snippet}
    </Overlay>
  {/key}
{/if}
