<script lang="ts">
  // The picture in your own share's preview: what this device captures. A screen sits at
  // its own aspect on the letterbox, so a portrait window or an ultrawide screen shows
  // all of what is shared; a webcam fills the preview, mirrored as a mirror would show
  // you. With no picture to show (the fake media client captures nothing) it shows the
  // share's kind, faintly, on the letterbox.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import type { ShareKind } from "$lib/share.js";

  let { kind, stream }: { kind: ShareKind; stream: MediaStream | null } = $props();

  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    if (video) video.srcObject = stream;
  });
</script>

{#if stream}
  <video
    bind:this={video}
    class={["size-full", kind === "webcam" ? "-scale-x-100 object-cover" : "object-contain"]}
    autoplay
    muted
    playsinline
    aria-label="Your {kind}"
  ></video>
{:else}
  <div class="text-faint grid size-full place-items-center" role="img" aria-label="Your {kind}, with no picture">
    {#if kind === "screen"}<Monitor class="size-7" aria-hidden="true" />{:else}<Video class="size-7" aria-hidden="true" />{/if}
  </div>
{/if}
