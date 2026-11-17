<script lang="ts">
  import type { Component } from "svelte";
  import { location, match, type Params, type Route } from "./router.svelte.ts";

  let { routes, fallback }: { routes: readonly Route[]; fallback: Component } = $props();

  const current = $derived(match(routes, location.pathname));
</script>

{#if current}
  <!-- A page that takes no props ignores the params it is given. -->
  {@const Page = current.route.component as Component<{ params: Params }>}
  <Page params={current.params} />
{:else}
  {@const Fallback = fallback}
  <Fallback />
{/if}
