<script lang="ts">
  // One of your own live shares at the foot of the bar: a small preview, who is
  // watching it, and Stop.
  import type { Snippet } from "svelte";
  import type { ShareKind } from "$lib/share.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { watchersLine } from "$lib/words.js";

  let {
    kind,
    watchers,
    stopping = false,
    onstop,
    children,
  }: {
    kind: ShareKind;
    watchers: readonly string[];
    /** Stop was pressed and the share is ending. */
    stopping?: boolean;
    onstop?: () => void;
    /** The preview itself: the local video. */
    children?: Snippet;
  } = $props();

  const line = $derived(watchersLine(watchers));
</script>

<figure class="grid">
  <div class="bg-letterbox relative aspect-video overflow-hidden rounded-lg">
    {@render children?.()}
  </div>
  <figcaption class="text-muted-foreground flex h-9 items-center justify-between gap-2 px-0.5 text-xs">
    <span class="truncate" title={line.map((part) => part.text).join("")}>
      {#each line as part, i (i)}{#if part.name}<span class="text-soft font-medium">{part.text}</span>{:else}{part.text}{/if}{/each}
    </span>
    <Button variant="destructive" size="xs" class="bg-raised px-2" aria-label="Stop your {kind}" disabled={stopping} onclick={onstop}>
      Stop
    </Button>
  </figcaption>
</figure>
