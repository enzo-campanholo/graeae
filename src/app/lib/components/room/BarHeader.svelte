<script lang="ts">
  // The bar's header: the room's name centred between the home icon (back to the list
  // of rooms, for a member with more than one room) and the gear (the owner page, for
  // the owner). The toggle that folds the bar into the rail sits at the far left, where
  // the rail keeps it.
  import House from "@lucide/svelte/icons/house";
  import PanelLeftClose from "@lucide/svelte/icons/panel-left-close";
  import Settings from "@lucide/svelte/icons/settings";
  import { heldBack } from "../../hold-back.js";
  import IconButton from "../IconButton.svelte";

  let {
    name,
    home = false,
    gear = false,
    oncollapse,
  }: {
    /** The room's name, or null while it is still loading. */
    name: string | null;
    home?: boolean;
    gear?: boolean;
    oncollapse: () => void;
  } = $props();
</script>

<!-- Each side is as wide as two icon buttons and their gap, so the name sits in the middle. -->
<header class="grid h-header grid-cols-[calc(2*var(--control-sm)+0.25rem)_1fr_calc(2*var(--control-sm)+0.25rem)] items-center">
  <div class="flex items-center gap-1">
    <IconButton label="Hide the bar" key="[" onclick={oncollapse}><PanelLeftClose /></IconButton>
    {#if home}
      <IconButton label="Rooms" href="/"><House /></IconButton>
    {/if}
  </div>
  {#if name === null}
    <span class="bg-raised mx-auto h-3.5 w-24 rounded-sm" aria-hidden="true" {@attach heldBack}></span>
  {:else}
    <h1 class="truncate px-1 text-center text-sm font-medium" title={name}>{name}</h1>
  {/if}
  <div class="flex justify-end">
    {#if gear}
      <!-- A new tab, so the room, its shares and its watching carry on meanwhile. -->
      <IconButton label="Owner page" href="/owner" target="_blank"><Settings /></IconButton>
    {/if}
  </div>
</header>
