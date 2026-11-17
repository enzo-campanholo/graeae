<script lang="ts">
  // The first-time notice before the browser's picker, shown once per device: what each
  // thing the picker offers sends. On Firefox it says instead that a screen share is
  // video only.
  import type { BrowserFamily } from "$lib/media/capture.js";
  import FootPanel from "./FootPanel.svelte";

  let {
    browser,
    floating = false,
    oncontinue,
    oncancel,
  }: {
    browser: BrowserFamily;
    /** Beside the folded rail rather than in the bar's foot. */
    floating?: boolean;
    oncontinue: () => void;
    oncancel: () => void;
  } = $props();
</script>

<FootPanel id="screen-notice-title" title="Before you pick" action="Choose what to share" {floating} {oncontinue} {oncancel}>
  {#if browser === "firefox"}
    In Firefox a screen share is video only, and it may be less smooth. A Chromium browser such as Chrome does better.
  {:else}
    A tab or a game's window sends its sound. A whole screen is video only.
  {/if}
</FootPanel>
