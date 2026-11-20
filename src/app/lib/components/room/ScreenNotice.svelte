<script lang="ts">
  // The first-time notice before the browser's picker, shown once per device: what each
  // thing the picker offers sends. On Firefox it says instead that a screen share is
  // video only.
  import type { BrowserFamily } from "$lib/media/capture.js";
  import FootPanel, { type PanelPlace } from "./FootPanel.svelte";

  let {
    browser,
    place = "foot",
    oncontinue,
    oncancel,
  }: {
    browser: BrowserFamily;
    /** Where it opens: the bar's foot, beside the folded rail, or the empty stage. */
    place?: PanelPlace;
    oncontinue: () => void;
    oncancel: () => void;
  } = $props();
</script>

<FootPanel id="screen-notice-title" title="Before you pick" action="Choose what to share" {place} {oncontinue} {oncancel}>
  {#if browser === "firefox"}
    In Firefox, a screen share is video only and may be less smooth. A Chromium browser such as Chrome sends sound too.
  {:else}
    A tab or a game's window sends its sound. A whole screen is video only.
  {/if}
</FootPanel>
