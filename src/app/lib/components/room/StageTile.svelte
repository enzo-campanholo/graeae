<script lang="ts">
  // One watched share on the stage: the picture at its own shape, with the member's
  // name and the kind of share beneath it. Its size comes from the stage: as wide as
  // its column allows, or as tall as its row allows, whichever is less.
  import type { Snippet } from "svelte";
  import type { ShareKind } from "$lib/share.js";

  let {
    name,
    kind,
    aspect = 16 / 9,
    children,
  }: {
    name: string;
    kind: ShareKind;
    /** The picture's width over its height, once the video reports it. */
    aspect?: number;
    children?: Snippet;
  } = $props();
</script>

<figure class="tile grid min-w-0 gap-1.5" style:--aspect={aspect}>
  <div class="bg-letterbox relative overflow-hidden rounded-lg" style:aspect-ratio={aspect}>
    {@render children?.()}
  </div>
  <figcaption class="flex h-5 items-baseline gap-1.5 px-0.5">
    <span class="text-soft truncate font-medium">{name}</span>
    <span class="text-dim text-xs">{kind}</span>
  </figcaption>
</figure>

<style>
  /* 12px between tiles, and 26px of caption under each picture. */
  .tile {
    width: min(
      (100cqw - (var(--cols) - 1) * 12px) / var(--cols),
      ((100cqh - (var(--rows) - 1) * 12px) / var(--rows) - 26px) * var(--aspect)
    );
    animation: arrive 240ms var(--ease-out);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.985);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      animation: none;
    }
  }
</style>
