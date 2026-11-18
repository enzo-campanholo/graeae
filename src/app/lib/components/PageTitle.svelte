<script lang="ts">
  // The tab's title, set by the page on screen only: a page on its way (see
  // `$lib/swap.svelte.ts`) leaves the title alone until it swaps in.
  import { viewShown } from "../swap.svelte.js";

  let { title }: { title: string } = $props();

  const shown = viewShown();
</script>

<svelte:head>
  {#if shown()}<title>{title}</title>{/if}
</svelte:head>
