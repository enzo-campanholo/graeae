<script lang="ts">
  import type { Component } from "svelte";
  import { location, match, type Route } from "./router.svelte.ts";

  let { routes, fallback }: { routes: readonly Route[]; fallback: Component } = $props();

  const current = $derived(match(routes, location.pathname));
</script>

{#if current}
  <current.route.component params={current.params} />
{:else}
  {@const Fallback = fallback}
  <Fallback />
{/if}
