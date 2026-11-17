<script lang="ts">
  // The stage: an inset panel filling the rest of the room, holding the shares you
  // watch in a grid of 1 column for one share, 2 for up to four, 3 for up to six and
  // 4 beyond. The tiles are sized from the whole stage and packed together in its
  // middle. With a share focused, that one takes the stage and the others drop to a
  // strip beneath it. With nothing to show it shows `empty`.
  //
  // While the room's connection is lost the stage keeps playing what it shows, and after
  // about 3 seconds a small "Reconnecting…" sits at its top, over the pictures.
  import type { Snippet } from "svelte";
  import Mark from "../Mark.svelte";

  let {
    count,
    children,
    focused,
    strip,
    empty,
    reconnecting = false,
  }: {
    count: number;
    /** The grid's tiles. */
    children?: Snippet;
    /** The focused share, which replaces the grid. */
    focused?: Snippet;
    /** The other watched shares, beneath the focused one. Each is an item of a list. */
    strip?: Snippet;
    empty?: Snippet;
    /** The room's connection has been lost for about 3 seconds and is reconnecting. */
    reconnecting?: boolean;
  } = $props();

  const columns = $derived(count <= 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4);
  const rows = $derived(Math.ceil(count / columns));
</script>

<main class="bg-stage relative min-w-0 flex-1 rounded-xl p-3" aria-label="Stage">
  <!-- Always in the page, so a screen reader hears the note appear. -->
  <div class="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center" role="status">
    {#if reconnecting}
      <p class="note bg-raised/90 text-soft flex h-7 items-center gap-2 rounded-md px-2.5 text-xs">
        <Mark size="sm" loading />Reconnecting…
      </p>
    {/if}
  </div>
  {#if count === 0}
    <div class="grid h-full place-items-center">{@render empty?.()}</div>
  {:else if focused}
    <div class="flex h-full flex-col gap-3">
      <div class="area min-h-0 flex-1" style:--cols={1} style:--rows={1}>
        <div class="grid h-full place-content-center">{@render focused()}</div>
      </div>
      {#if strip && count > 1}
        <ul class="flex shrink-0 justify-center-safe gap-3 overflow-x-auto" aria-label="Other shares">
          {@render strip()}
        </ul>
      {/if}
    </div>
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
  /* Arrives as the screen notice does: 180ms, rising 4px. */
  .note {
    box-shadow: 0 4px 16px -4px rgb(0 0 0 / 0.4);
    animation: arrive 180ms var(--ease-out);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .note {
      animation: none;
    }
  }
</style>
