<script lang="ts">
  // One-off picks for the whole room, as three icons at the right of the "Here" heading:
  // every webcam, everything, nothing. They follow nobody. Each is named by its tooltip
  // ("Watch every webcam", "Watch everything", "Watch nothing"), and the group is "Watch".
  // The one whose pick the stage holds rests lit, as a pressed control; none is while the
  // stage holds anything else. "Nothing" is a closed eye, not the eye-off that stops
  // watching one share on a tile.
  import EyeClosed from "@lucide/svelte/icons/eye-closed";
  import Eye from "@lucide/svelte/icons/eye";
  import Video from "@lucide/svelte/icons/video";
  import type { Component } from "svelte";
  import type { Shortcut } from "$lib/room-client.svelte.js";
  import IconButton from "../IconButton.svelte";

  let { picked = null, onpick }: { picked?: Shortcut | null; onpick?: (what: Shortcut) => void } = $props();

  const shortcuts: { what: Shortcut; label: string; icon: Component }[] = [
    { what: "webcams", label: "Watch every webcam", icon: Video },
    { what: "everything", label: "Watch everything", icon: Eye },
    { what: "nothing", label: "Watch nothing", icon: EyeClosed },
  ];
</script>

<div class="flex items-center gap-0.5" role="group" aria-label="Watch">
  {#each shortcuts as shortcut (shortcut.what)}
    {@const lit = shortcut.what === picked}
    <IconButton
      label={shortcut.label}
      size="icon-xs"
      pressed={lit}
      class={lit ? "bg-raised-2 text-fg hover:bg-raised-2" : "text-faint"}
      onclick={() => onpick?.(shortcut.what)}
    >
      <shortcut.icon />
    </IconButton>
  {/each}
</div>
