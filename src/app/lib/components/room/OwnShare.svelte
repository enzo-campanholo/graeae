<script lang="ts">
  // One of your own live shares at the foot of the bar: a small preview, who is
  // watching it, and Stop. A screen share with sound has its audio switch beside Stop; a
  // screen share that ended up with no sound says so in one line beneath.
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeOff from "@lucide/svelte/icons/volume-off";
  import type { Snippet } from "svelte";
  import type { ShareKind } from "$lib/share.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { watchersLine } from "$lib/words.js";
  import IconButton from "../IconButton.svelte";

  let {
    kind,
    watchers,
    audio = null,
    stopping = false,
    onstop,
    onaudio,
    children,
  }: {
    kind: ShareKind;
    watchers: readonly string[];
    /** A screen share's sound: on, or turned off by you. Null when it has none. */
    audio?: "on" | "off" | null;
    /** Stop was pressed and the share is ending. */
    stopping?: boolean;
    onstop?: () => void;
    /** Turn the share's sound on (true) or off (false). */
    onaudio?: (on: boolean) => void;
    /** The preview itself: the local video. */
    children?: Snippet;
  } = $props();

  const line = $derived(watchersLine(watchers));
</script>

<figure class="grid">
  <div class="bg-letterbox relative aspect-video overflow-hidden rounded-lg">
    {@render children?.()}
  </div>
  <figcaption class="text-muted-foreground grid px-0.5 text-xs">
    <div class="flex h-9 items-center justify-between gap-2">
      <span class="truncate" title={line.map((part) => part.text).join("")}>
        {#each line as part, i (i)}{#if part.name}<span class="text-soft font-medium">{part.text}</span>{:else}{part.text}{/if}{/each}
      </span>
      <span class="flex shrink-0 items-center gap-1">
        {#if audio}
          <IconButton
            label={audio === "on" ? `Turn your ${kind} audio off` : `Turn your ${kind} audio on`}
            size="icon-xs"
            side="top"
            disabled={stopping}
            class={audio === "off" ? "text-faint" : undefined}
            onclick={() => onaudio?.(audio !== "on")}
          >
            {#if audio === "on"}<Volume2 />{:else}<VolumeOff />{/if}
          </IconButton>
        {/if}
        <Button variant="destructive" size="xs" class="bg-raised px-2" aria-label="Stop your {kind}" disabled={stopping} onclick={onstop}>
          Stop
        </Button>
      </span>
    </div>
    {#if kind === "screen" && audio === null}
      <p class="-mt-1 pb-2">Video only. No one hears this share.</p>
    {/if}
  </figcaption>
</figure>
