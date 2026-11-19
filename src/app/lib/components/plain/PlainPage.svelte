<script lang="ts">
  // The plain pages (the list of rooms and "You"): one centred column on the ground,
  // under a slim header with the mark, the owner's gear and your avatar, a menu with the
  // way to "You", as at the top of a room's bar.
  import Settings from "@lucide/svelte/icons/settings";
  import type { Snippet } from "svelte";
  import IconButton from "../IconButton.svelte";
  import Mark from "../Mark.svelte";
  import YouMenu from "../YouMenu.svelte";
  import PageTitle from "../PageTitle.svelte";

  let {
    title,
    you = true,
    gear = false,
    me = null,
    home = "/",
    children,
  }: {
    /** The page's heading, also its tab title. */
    title: string;
    /** Show your avatar and its menu (the "You" page itself leaves it out). */
    you?: boolean;
    gear?: boolean;
    /** Your display name, for the avatar, or null while it is still loading. */
    me?: string | null;
    /** Where the mark goes: the member's one room when they have one, otherwise the list of rooms. */
    home?: string;
    children: Snippet;
  } = $props();
</script>

<PageTitle title="{title} · graeae" />

<div class="mx-auto grid w-full max-w-plain gap-10 px-6 pt-5 pb-24">
  <header class="flex h-control items-center justify-between">
    <a
      href={home}
      class="text-soft hover:text-fg -ml-2 flex h-control items-center gap-2.5 rounded-md px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Mark />graeae
    </a>
    <nav class="flex items-center gap-1">
      {#if gear}
        <IconButton label="Owner page" href="/owner"><Settings /></IconButton>
      {/if}
      {#if you}
        <YouMenu name={me} owner={gear} />
      {/if}
    </nav>
  </header>
  <main class="grid gap-8">
    <h1 class="text-xl font-medium">{title}</h1>
    {@render children()}
  </main>
</div>
