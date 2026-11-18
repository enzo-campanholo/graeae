<script lang="ts">
  // One view of a `Swap`: on screen, or on its way, mounted but out of sight and out of
  // reach until it swaps in. Its components take holds on its gate while they mount. The
  // view is one element either way, so swapping in moves nothing and mounts nothing again.
  import type { Snippet } from "svelte";
  import { provideView, viewShown, type Gate } from "../swap.svelte.js";

  let { gate, shown, children }: { gate: Gate; shown: boolean; children: Snippet } = $props();

  // A view inside another is on screen only while that one is too.
  const outer = viewShown();
  // svelte-ignore state_referenced_locally
  provideView(gate, () => shown && outer());

  // Runs once the view's components have mounted, and taken their holds.
  $effect(() => gate.mounted());
</script>

<div class={shown ? "shown" : "on-its-way"} inert={!shown} aria-hidden={shown ? undefined : "true"}>
  {@render children()}
</div>

<style>
  .shown {
    display: contents;
  }
  /* Laid out as it will be, so it swaps in as it is, but nowhere on the page. */
  .on-its-way {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 0;
    overflow: hidden;
    visibility: hidden;
  }
</style>
