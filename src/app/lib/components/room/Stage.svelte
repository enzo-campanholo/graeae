<script lang="ts">
  // The stage: an inset panel filling the rest of the room, holding the shares you
  // watch in a grid of 1 column for one share, 2 for up to four, 3 for up to six and
  // 4 beyond. The tiles are sized from the whole stage and packed together in its
  // middle. With nothing to show it shows `empty`.
  import type { Snippet } from "svelte";

  let { count, children, empty }: { count: number; children?: Snippet; empty?: Snippet } = $props();

  const columns = $derived(count <= 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4);
  const rows = $derived(Math.ceil(count / columns));
</script>

<main class="bg-stage min-w-0 flex-1 rounded-xl p-3" aria-label="Stage">
  {#if count === 0}
    <div class="grid h-full place-items-center">{@render empty?.()}</div>
  {:else}
    <div class="area h-full" style:--cols={columns} style:--rows={rows}>
      <div class="grid h-full place-content-center gap-3" style:grid-template-columns="repeat({columns}, auto)">
        {@render children?.()}
      </div>
    </div>
  {/if}
</main>

<style>
  .area {
    container-type: size;
  }
</style>
