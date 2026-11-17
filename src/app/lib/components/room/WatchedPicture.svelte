<script lang="ts">
  // The picture of a share you watch, filling its tile: what the media connection
  // receives. With no picture to show (the fake media client receives nothing) it shows
  // the share's kind, faintly, on the letterbox, as your own preview does. A screen
  // share's screen audio plays with its picture; ticket 16 adds volume and mute.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import type { ShareKind } from "$lib/share.js";

  let { name, kind, stream }: { name: string; kind: ShareKind; stream: MediaStream | null } = $props();

  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    const element = video;
    if (!element) return;
    element.srcObject = stream;
    element.muted = false;
    // A browser may refuse to play sound on a page nobody has clicked yet (a reload that
    // brings the stage back): the picture then plays without it.
    element.play().catch(() => {
      element.muted = true;
      element.play().catch(() => undefined);
    });
  });
</script>

{#if stream}
  <video bind:this={video} class="size-full object-contain" playsinline aria-label="{name}'s {kind}"></video>
{:else}
  <div class="text-faint grid size-full place-items-center" role="img" aria-label="{name}'s {kind}, with no picture">
    {#if kind === "screen"}<Monitor class="size-6" aria-hidden="true" />{:else}<Video class="size-6" aria-hidden="true" />{/if}
  </div>
{/if}
