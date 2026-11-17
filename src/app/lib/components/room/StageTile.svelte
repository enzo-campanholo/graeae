<script lang="ts">
  // One watched share on the stage: the picture at its own shape, with the member's
  // name and the kind of share beneath it. In the grid, and as the focused share, it is
  // as wide as its column allows or as tall as its row allows, whichever is less; in the
  // strip beneath a focused share it is a small, fixed height, and a click on it focuses
  // it. Its controls sit on the picture's corner and show while the pointer is on the
  // tile or a control has the keyboard's focus. Any tile can go fullscreen, from its
  // button or a double-click on the picture. A share that goes out at two qualities has
  // the viewer's choice of quality among its controls, and its caption carries a small
  // "720p" mark while it arrives at the lower quality.
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import LayoutPanelTop from "@lucide/svelte/icons/layout-panel-top";
  import Maximize from "@lucide/svelte/icons/maximize";
  import Minimize from "@lucide/svelte/icons/minimize";
  import type { Snippet } from "svelte";
  import type { ShareKind } from "$lib/share.js";
  import type { QualityChoice as Quality } from "../../../../shared/socket/index.ts";
  import IconButton from "../IconButton.svelte";
  import QualityChoice from "./QualityChoice.svelte";

  let {
    name,
    kind,
    videoOnly = false,
    quality = null,
    lower = false,
    aspect = 16 / 9,
    place = "grid",
    onstop,
    onfocus,
    onunfocus,
    children,
  }: {
    name: string;
    kind: ShareKind;
    /** A screen share with no screen audio: its caption says "video only". */
    videoOnly?: boolean;
    /** A share at two qualities: the one this tab watches it at, and how to choose another. Null for one quality. */
    quality?: { value: Quality; onchoose: (quality: Quality) => void } | null;
    /** A share at two qualities that arrives at the lower one: its caption carries the "720p" mark. */
    lower?: boolean;
    /** The picture's width over its height, once the video reports it. */
    aspect?: number;
    /** In the grid, the one focused share, or in the strip beneath it. */
    place?: "grid" | "focused" | "strip";
    /** Stop watching this share. */
    onstop?: () => void;
    /** Focus this share: from the grid's control, or a click on it in the strip. */
    onfocus?: () => void;
    /** Back to the grid, from the focused share. */
    onunfocus?: () => void;
    children?: Snippet;
  } = $props();

  const share = $derived(`${name}'s ${kind}`);
  const size = $derived(place === "strip" ? "icon-xs" : "icon-sm");

  let picture = $state<HTMLDivElement | null>(null);
  let fullscreen = $state(false);

  function onfullscreenchange() {
    fullscreen = !!picture && document.fullscreenElement === picture;
  }

  /** Fills the screen with the picture, or gives the screen back if it already has it. */
  function toggleFullscreen() {
    if (!picture) return;
    const change = fullscreen ? document.exitFullscreen() : picture.requestFullscreen();
    // A browser that refuses (no user gesture, or not allowed) leaves the tile as it was.
    change.catch(() => {});
  }
</script>

<svelte:document {onfullscreenchange} />

<figure class={["tile grid min-w-0 gap-1.5", place]} style:--aspect={aspect}>
  <div
    bind:this={picture}
    class="picture bg-letterbox relative overflow-hidden rounded-lg"
    style:aspect-ratio={aspect}
    role="presentation"
    ondblclick={toggleFullscreen}
  >
    {@render children?.()}
    {#if place === "strip" && onfocus}
      <!-- The whole picture focuses this share; the controls sit above it. -->
      <button
        type="button"
        class="hover:bg-fg/6 absolute inset-0 cursor-pointer rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label="Focus {share}"
        onclick={onfocus}
      ></button>
    {/if}
    <div class={["controls bg-raised/90 absolute flex gap-0.5 rounded-md p-0.5", place === "strip" ? "top-1 right-1" : "top-2 right-2"]}>
      <!-- Too small to choose from in the strip: focus the share to choose. -->
      {#if quality && place !== "strip"}
        <div class="mr-1"><QualityChoice {share} value={quality.value} onchoose={quality.onchoose} /></div>
      {/if}
      {#if place === "grid" && onfocus}
        <IconButton label="Focus {share}" {size} side="bottom" onclick={onfocus}><LayoutPanelTop /></IconButton>
      {:else if place === "focused" && onunfocus}
        <IconButton label="Back to the grid" {size} side="bottom" onclick={onunfocus}><LayoutGrid /></IconButton>
      {/if}
      <IconButton
        label={fullscreen ? "Leave fullscreen" : `Show ${share} fullscreen`}
        {size}
        side="bottom"
        onclick={toggleFullscreen}
      >
        {#if fullscreen}<Minimize />{:else}<Maximize />{/if}
      </IconButton>
      {#if onstop}
        <IconButton label="Stop watching {share}" {size} side="bottom" onclick={onstop}><EyeOff /></IconButton>
      {/if}
    </div>
  </div>
  <figcaption class="flex h-5 min-w-0 items-baseline gap-1.5 px-0.5">
    <span class="text-soft truncate font-medium">{name}</span>
    <span class="text-dim truncate text-xs">{kind}{#if videoOnly}<span aria-hidden="true">&nbsp;·</span> video only{/if}</span>
    {#if lower}
      <span class="mark bg-raised text-muted-foreground shrink-0 self-center rounded-[4px] px-1 text-[11px] leading-4 font-medium tabular-nums"
        ><span class="sr-only">Received at&nbsp;</span>720p</span
      >
    {/if}
  </figcaption>
</figure>

<style>
  /* In the grid and focused: 12px between tiles, and 26px of caption under each picture. */
  .tile {
    width: min(
      (100cqw - (var(--cols) - 1) * 12px) / var(--cols),
      ((100cqh - (var(--rows) - 1) * 12px) / var(--rows) - 26px) * var(--aspect)
    );
    animation: arrive 240ms var(--ease-out);
  }
  /* In the strip: a small, fixed height. */
  .tile.strip {
    width: calc(96px * var(--aspect));
  }
  /* Fullscreen: the picture alone, filling the screen on the letterbox. */
  .picture:fullscreen {
    aspect-ratio: auto !important;
    border-radius: 0;
  }
  /* Out of the picture's way until the pointer or the keyboard is on the tile. */
  .controls {
    opacity: 0;
    transition: opacity 150ms var(--ease-out);
  }
  .picture:hover .controls,
  .controls:focus-within {
    opacity: 1;
  }
  @media (hover: none) {
    .controls {
      opacity: 1;
    }
  }
  .mark {
    animation: mark 180ms var(--ease-out);
  }
  @keyframes mark {
    from {
      opacity: 0;
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
    .mark {
      animation: none;
    }
  }
</style>
