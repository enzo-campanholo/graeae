<script lang="ts" module>
  /** A live share of this member's, and whether you are watching it. */
  export interface RowShare {
    watched: boolean;
  }
</script>

<script lang="ts">
  // One member in the bar. A present member's name follows them (watches everything they
  // share, now and later); each icon watches or stops watching one live share. An icon
  // lights with the eye while you watch that share. Your own row leads to the "You" page,
  // and shows the icons of your shares sent from another tab or device, to watch them here.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import type { ShareKind } from "$lib/share.js";
  import Avatar from "../Avatar.svelte";
  import IconButton from "../IconButton.svelte";

  let {
    name,
    you = false,
    away = false,
    followed = false,
    screen = null,
    webcam = null,
    onfollow,
    ontoggle,
  }: {
    name: string;
    you?: boolean;
    /** Has access to the room but is not present: dimmed, and nothing to click. */
    away?: boolean;
    followed?: boolean;
    screen?: RowShare | null;
    webcam?: RowShare | null;
    onfollow?: () => void;
    ontoggle?: (kind: ShareKind) => void;
  } = $props();

</script>

{#if away}
  <div class="text-dim flex h-8 items-center gap-2.5 px-2">
    <Avatar {name} away />
    <span class="truncate">{name}</span>
  </div>
{:else if you}
  <div class="text-soft hover:bg-raised flex h-8 items-center rounded-md pr-0.5 transition-colors duration-150">
    <a
      href="/you"
      class="hover:text-fg flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Avatar {name} />
      <span class="truncate font-medium">{name}</span>
      <span class="text-dim -ml-1 shrink-0">· you</span>
    </a>
    {#if screen}
      {@render shareIcon("screen", screen, "your")}
    {/if}
    {#if webcam}
      {@render shareIcon("webcam", webcam, "your")}
    {/if}
  </div>
{:else}
  <div
    class={[
      "group flex h-8 items-center rounded-md pr-0.5 transition-colors duration-150",
      followed ? "bg-raised text-fg" : "text-soft hover:bg-raised hover:text-fg",
    ]}
  >
    <button
      type="button"
      class="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-pressed={followed}
      onclick={onfollow}
    >
      <Avatar {name} {followed} ring={followed ? "var(--raised)" : "var(--ground)"} />
      <span class="truncate font-medium">{name}</span>
    </button>
    {#if screen}
      {@render shareIcon("screen", screen)}
    {/if}
    {#if webcam}
      {@render shareIcon("webcam", webcam)}
    {/if}
  </div>
{/if}

{#snippet shareIcon(kind: ShareKind, share: RowShare, whose = `${name}'s`)}
  <IconButton
    label={share.watched ? `Stop watching ${whose} ${kind}` : `Watch ${whose} ${kind}`}
    size="icon-xs"
    side="right"
    pressed={share.watched}
    class={share.watched ? "text-eye hover:text-eye" : "text-faint"}
    onclick={() => ontoggle?.(kind)}
  >
    {#if kind === "screen"}<Monitor />{:else}<Video />{/if}
  </IconButton>
{/snippet}
