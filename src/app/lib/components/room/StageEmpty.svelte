<script lang="ts">
  // The stage before you watch anything. With something live it offers to watch it all;
  // with nothing live it says so.
  import { Button } from "$lib/components/ui/button/index.js";

  let { live, oneverything }: { live: number; oneverything?: () => void } = $props();
</script>

<div class="grid justify-items-center gap-3 text-center">
  {#if live > 0}
    <p class="text-muted-foreground">Click a name to watch what they share.</p>
    {#if oneverything}<Button variant="secondary" onclick={oneverything}>Watch everything</Button>{/if}
  {:else}
    <p class="text-muted-foreground">No one is sharing yet.</p>
  {/if}
</div>
