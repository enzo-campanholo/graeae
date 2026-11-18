<script lang="ts">
  // The plain pages (the list of rooms and "You"): one centred column on the ground,
  // under a slim header with the mark, a way to "You" and, for the owner, the gear.
  import Settings from "@lucide/svelte/icons/settings";
  import type { Snippet } from "svelte";
  import IconButton from "../IconButton.svelte";
  import Mark from "../Mark.svelte";

  let {
    title,
    you = true,
    gear = false,
    home = "/",
    children,
  }: {
    /** The page's heading, also its tab title. */
    title: string;
    /** Show the link to the "You" page (the "You" page itself leaves it out). */
    you?: boolean;
    gear?: boolean;
    /** Where the mark goes: the member's one room when they have one, otherwise the list of rooms. */
    home?: string;
    children: Snippet;
  } = $props();
</script>

<svelte:head>
  <title>{title} · graeae</title>
</svelte:head>

<div class="mx-auto grid w-full max-w-[600px] gap-10 px-6 pt-5 pb-24">
  <header class="flex h-8 items-center justify-between">
    <a
      href={home}
      class="text-soft hover:text-fg -ml-2 flex h-8 items-center gap-2.5 rounded-md px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Mark />graeae
    </a>
    <nav class="flex items-center gap-1">
      {#if you}
        <a
          href="/you"
          class="text-muted-foreground hover:bg-raised hover:text-fg flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          You
        </a>
      {/if}
      {#if gear}
        <IconButton label="Owner page" href="/owner"><Settings /></IconButton>
      {/if}
    </nav>
  </header>
  <main class="grid gap-8">
    <h1 class="text-xl font-medium tracking-[-0.01em]">{title}</h1>
    {@render children()}
  </main>
</div>
