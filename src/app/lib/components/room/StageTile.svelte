<script lang="ts">
  // One watched share on the stage: the picture at its own shape, with the member's
  // name and the kind of share beneath it. Its size comes from the stage: as wide as
  // its column allows, or as tall as its row allows, whichever is less. Its controls sit
  // on the picture's corner and show while the pointer is on the tile or a control has
  // the keyboard's focus.
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import type { Snippet } from "svelte";
  import type { ShareKind } from "$lib/share.js";
  import IconButton from "../IconButton.svelte";

  let {
    name,
    kind,
    aspect = 16 / 9,
    onstop,
    children,
  }: {
    name: string;
    kind: ShareKind;
    /** The picture's width over its height, once the video reports it. */
    aspect?: number;
    /** Stop watching this share. */
    onstop?: () => void;
    children?: Snippet;
  } = $props();
</script>

<figure class="tile grid min-w-0 gap-1.5" style:--aspect={aspect}>
  <div class="bg-letterbox relative overflow-hidden rounded-lg" style:aspect-ratio={aspect}>
    {@render children?.()}
    {#if onstop}
      <div class="controls absolute top-2 right-2 flex gap-1">
        <IconButton
          label="Stop watching {name}'s {kind}"
          variant="secondary"
          size="icon-sm"
          side="bottom"
          class="bg-raised/90"
          onclick={onstop}
        >
          <EyeOff />
        </IconButton>
      </div>
    {/if}
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
  /* Out of the picture's way until the pointer or the keyboard is on the tile. */
  .controls {
    opacity: 0;
    transition: opacity 150ms var(--ease-out);
  }
  .tile:hover .controls,
  .controls:focus-within {
    opacity: 1;
  }
  @media (hover: none) {
    .controls {
      opacity: 1;
    }
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
    .controls {
      transition: none;
    }
  }
</style>
