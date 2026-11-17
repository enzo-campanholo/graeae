<script lang="ts">
  // The stage before you watch anything, which is how every tab opens. With something
  // live it says how to watch it (and offers to watch it all, once that has a handler);
  // with nothing live it says so.
  import { Button } from "$lib/components/ui/button/index.js";

  let { live, oneverything }: { live: number; oneverything?: () => void } = $props();
</script>

<div class="grid justify-items-center gap-3 text-center">
  {#if live > 0}
    <div class="grid gap-1">
      <p class="text-soft font-medium">You're not watching anything yet.</p>
      <p class="text-muted-foreground">Click the icon beside a name to watch what they share.</p>
    </div>
    {#if oneverything}<Button variant="secondary" onclick={oneverything}>Watch everything</Button>{/if}
  {:else}
    <p class="text-muted-foreground">No one is sharing yet.</p>
  {/if}
</div>
