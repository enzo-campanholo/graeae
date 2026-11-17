<script lang="ts">
  // The picture of a share you watch, filling its tile: what the media connection
  // receives, with its screen audio at the volume you set, unless you muted it. With no
  // picture to show (the fake media client receives nothing) it shows the share's kind,
  // faintly, on the letterbox, as your own preview does.
  //
  // A browser may refuse to play sound on a page nobody has clicked yet (a reload that
  // brings the stage back). The picture then plays without it, and a small "Click for
  // sound" sits on it until the first click or key press anywhere on the page, which lets
  // the sound in.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import VolumeOff from "@lucide/svelte/icons/volume-off";
  import { untrack } from "svelte";
  import { gain } from "$lib/hearing.js";
  import type { ShareKind } from "$lib/share.js";

  let {
    name,
    kind,
    stream,
    volume = 100,
    muted = false,
    small = false,
  }: {
    name: string;
    kind: ShareKind;
    stream: MediaStream | null;
    /** The volume, from 0 to 100, its screen audio plays at. */
    volume?: number;
    /** Whether the viewer muted it. */
    muted?: boolean;
    /** In the strip: "Click for sound" is an icon alone. */
    small?: boolean;
  } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  /** The browser refused this picture's sound, and it plays muted until the page is clicked. */
  let refused = $state(false);

  /** Plays the picture with its sound, or without when the browser refuses it. */
  function play(element: HTMLVideoElement) {
    element.muted = untrack(() => muted);
    element.play().then(
      () => (refused = false),
      () => {
        if (element.muted) return;
        refused = true;
        element.muted = true;
        element.play().catch(() => undefined);
      },
    );
  }

  $effect(() => {
    const element = video;
    if (!element) return;
    element.srcObject = stream;
    play(element);
  });

  $effect(() => {
    if (!video) return;
    video.volume = gain(volume);
    if (!refused) video.muted = muted;
  });

  /** The page has been clicked or a key pressed: the browser lets the sound in now. */
  function retry() {
    if (refused && video) play(video);
  }
</script>

<svelte:document onpointerdown={retry} onkeydown={retry} />

{#if stream}
  <video bind:this={video} class="size-full object-contain" playsinline aria-label="{name}'s {kind}"></video>
  {#if refused}
    <button
      type="button"
      class={[
        "sound bg-raised/90 text-soft hover:text-fg absolute bottom-2 left-2 flex h-7 items-center gap-1.5 rounded-md text-xs transition-colors duration-150",
        small ? "w-7 justify-center" : "px-2.5",
      ]}
      aria-label={small ? `Click for the sound of ${name}'s ${kind}` : undefined}
      onclick={retry}
    >
      <VolumeOff class="size-3.5 stroke-[1.75]" aria-hidden="true" />
      {#if !small}Click for sound{/if}
    </button>
  {/if}
{:else}
  <div class="text-faint grid size-full place-items-center" role="img" aria-label="{name}'s {kind}, with no picture">
    {#if kind === "screen"}<Monitor class="size-6" aria-hidden="true" />{:else}<Video class="size-6" aria-hidden="true" />{/if}
  </div>
{/if}

<style>
  /* Arrives as the screen notice does: 180ms, rising 4px. */
  .sound {
    box-shadow: var(--lift);
    animation: arrive 180ms var(--ease-out);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sound {
      animation: none;
      transition: none;
    }
  }
</style>
