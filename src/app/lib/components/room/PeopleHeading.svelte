<script lang="ts">
  // A list's heading in the bar: its label and count, or, with `actions` at its right
  // (the watch shortcuts on "Here"), the count beside the label.
  import type { Snippet } from "svelte";

  let { label, count, actions }: { label: string; count: number; actions?: Snippet } = $props();
</script>

{#snippet text()}
  <span>{label}</span>
  <span class="text-dim tabular-nums">{count}</span>
{/snippet}

{#if actions}
  <div class="flex h-control-sm items-center justify-between pr-0.5 pl-2">
    <h2 class="text-muted-foreground flex items-baseline gap-1.5 text-xs font-normal">{@render text()}</h2>
    {@render actions()}
  </div>
{:else}
  <h2 class="text-muted-foreground flex h-control-sm items-center justify-between px-2 text-xs font-normal">{@render text()}</h2>
{/if}
