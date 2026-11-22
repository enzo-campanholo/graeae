<script lang="ts">
  // The bar's header: a row of tools, then the room's name under it as the page's heading,
  // at the headline step, as "Rooms", "You" and an owner section's are. The tools: the
  // toggle that folds the bar into the rail at the far left, where the rail keeps it, and
  // the home icon (back to the list of rooms, for a member with more than one room); on the
  // right your avatar, a menu with the way to "You", beside the gear (the owner page, for
  // the owner). A long name wraps, balanced, rather than being cut (a name is at most 40
  // characters), and a word too long for the line breaks inside it.
  import House from "@lucide/svelte/icons/house";
  import PanelLeftClose from "@lucide/svelte/icons/panel-left-close";
  import Settings from "@lucide/svelte/icons/settings";
  import { heldBack } from "../../hold-back.js";
  import IconButton from "../IconButton.svelte";
  import YouMenu from "../YouMenu.svelte";

  let {
    name,
    me,
    home = false,
    gear = false,
    oncollapse,
  }: {
    /** The room's name, or null while it is still loading. */
    name: string | null;
    /** Your own display name, or null while it is still loading. */
    me: string | null;
    home?: boolean;
    gear?: boolean;
    oncollapse: () => void;
  } = $props();
</script>

<header>
  <div class="flex h-header items-center gap-1">
    <IconButton label="Hide the bar" key="[" onclick={oncollapse}><PanelLeftClose /></IconButton>
    {#if home}
      <IconButton label="Rooms" href="/"><House /></IconButton>
    {/if}
    <span class="flex-1"></span>
    <!-- They open over the room, which carries on under them: its shares, watching and sound. -->
    {#if gear}
      <IconButton label="Owner page" href="/owner"><Settings /></IconButton>
    {/if}
    <YouMenu name={me} owner={gear} />
  </div>
  {#if name === null}
    <!-- The heading's own line height, so the people do not move when the name arrives. -->
    <div class="flex h-[var(--headline-lh)] items-center px-2">
      <span class="bg-raised h-5 w-36 rounded-sm" aria-hidden="true" {@attach heldBack}></span>
    </div>
  {:else}
    <h1 class="px-2 text-xl font-medium wrap-break-word">{name}</h1>
  {/if}
</header>
