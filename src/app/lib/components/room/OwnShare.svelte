<script lang="ts">
  // One of your own live shares at the foot of the bar: a small preview, who is
  // watching it, and Stop. A screen share with sound has its audio switch beside Stop; a
  // screen share that ended up with no sound says so in one line beneath.
  //
  // Beneath it too, the notes only you see, from the share's statistics: capture stuck at
  // 48 fps and an upload that cannot carry 1080p, each until you dismiss it or it no longer
  // holds, and a quiet line while the share is encoded in software.
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeOff from "@lucide/svelte/icons/volume-off";
  import type { Snippet } from "svelte";
  import type { ShareKind } from "$lib/share.js";
  import type { SharerNotes } from "$lib/media/sending.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { watchersLine } from "$lib/words.js";
  import IconButton from "../IconButton.svelte";
  import SharerNote from "./SharerNote.svelte";

  let {
    kind,
    watchers,
    audio = null,
    stopping = false,
    onstop,
    onaudio,
    notes = null,
    children,
    paired = false,
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
    /** What only you are told of this share, from its statistics. Null before it is live. */
    notes?: SharerNotes | null;
    /** The preview itself: the local video. */
    children?: Snippet;
    /** Your screen and webcam are both live, so on a short window each preview steps down. */
    paired?: boolean;
  } = $props();

  const line = $derived(watchersLine(watchers));

  /** Notes you dismissed. One comes back if it goes away by itself and later holds again. */
  let dismissed = $state({ at48: false, upload: false });
  $effect(() => {
    if (!notes?.at48 && dismissed.at48) dismissed.at48 = false;
    if (!notes?.upload && dismissed.upload) dismissed.upload = false;
  });
</script>

<figure class="grid">
  <div class={["preview bg-letterbox relative aspect-video overflow-hidden rounded-lg", paired && "paired"]}>
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
            class={audio === "off" ? "text-dim" : undefined}
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
    <div class="grid" aria-live="polite">
      {#if notes?.at48 && !dismissed.at48}
        <SharerNote label="Dismiss the note on 48 fps" ondismiss={() => (dismissed.at48 = true)}>
          Capturing at 48 fps. Windows limits capture on a 144 Hz monitor; setting it to 120 Hz gives 60.
        </SharerNote>
      {/if}
      {#if notes?.upload && !dismissed.upload}
        <SharerNote label="Dismiss the note on your upload" ondismiss={() => (dismissed.upload = true)}>
          Your upload can't carry 1080p, so this share goes out at {notes.upload === "720p30" ? "720p and 30 fps" : "720p"}.
        </SharerNote>
      {/if}
      {#if kind === "screen" && audio === null}
        <SharerNote>Video only. No one hears this share.</SharerNote>
      {/if}
      {#if notes?.software}
        <SharerNote>Encoded in software, so it costs your game more.</SharerNote>
      {/if}
    </div>
  </figcaption>
</figure>

<style>
  /* On a short window (a 1366x768 laptop), two full-width previews and their notes would
     push the people and the Watch row out of the bar. Each preview steps down to a 16:9
     thumbnail 112px high, on the caption's left edge; at 1080p nothing changes. */
  @media (max-height: 800px) {
    .preview.paired {
      justify-self: start;
      height: 112px;
    }
  }
</style>
