<script lang="ts">
  // The stage before you watch anything, which is how every tab opens. With something
  // live it says how to watch it and offers to watch it all; with nothing live it says
  // so. Following a member who shares nothing, it says their shares will show here.
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    live,
    following = null,
    oneverything,
  }: {
    live: number;
    /** The name of the member followed, if any. */
    following?: string | null;
    oneverything?: () => void;
  } = $props();
</script>

<div class="grid justify-items-center gap-3 text-center">
  {#if following}
    <div class="grid gap-1">
      <p class="text-soft font-medium">{following} isn't sharing anything right now.</p>
      <p class="text-muted-foreground">What they share next will show here.</p>
    </div>
  {:else if live > 0}
    <div class="grid gap-1">
      <p class="text-soft font-medium">You're not watching anything yet.</p>
      <p class="text-muted-foreground">Click a name to watch what that person shares, or an icon for one share.</p>
    </div>
    {#if oneverything}<Button variant="secondary" onclick={oneverything}>Watch everything</Button>{/if}
  {:else}
    <p class="text-muted-foreground">No one is sharing yet.</p>
  {/if}
</div>
