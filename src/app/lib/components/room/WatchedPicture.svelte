<script lang="ts">
  // The picture of a share you watch, filling its tile: what the media connection
  // receives. With no picture to show (the fake media client receives nothing) it shows
  // the share's kind, faintly, on the letterbox, as your own preview does.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import type { ShareKind } from "$lib/share.js";

  let { name, kind, stream }: { name: string; kind: ShareKind; stream: MediaStream | null } = $props();

  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    if (video) video.srcObject = stream;
  });
</script>

{#if stream}
  <!-- Muted until screen audio and its controls arrive (tickets 15 and 16); a webcam share has none. -->
  <video bind:this={video} class="size-full object-contain" autoplay muted playsinline aria-label="{name}'s {kind}"></video>
{:else}
  <div class="text-faint grid size-full place-items-center" role="img" aria-label="{name}'s {kind}, with no picture">
    {#if kind === "screen"}<Monitor class="size-6" aria-hidden="true" />{:else}<Video class="size-6" aria-hidden="true" />{/if}
  </div>
{/if}
