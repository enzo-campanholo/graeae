<script lang="ts">
  // The first-time notice before the browser's picker, shown once per device: what each
  // thing the picker offers sends. On Firefox it says instead that a screen share is
  // video only. It is not a modal: it sits above the share buttons in the bar, or beside
  // the folded rail, and the rest of the room stays usable. Escape closes it.
  import type { BrowserFamily } from "$lib/media/capture.js";
  import { Button } from "$lib/components/ui/button/index.js";

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

  let go = $state<HTMLButtonElement | null>(null);

  // The keyboard lands on the way on, so Enter goes to the picker.
  $effect(() => go?.focus());

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      oncancel();
    }
  }
</script>

<div
  role="dialog"
  aria-modal="false"
  aria-labelledby="screen-notice-title"
  tabindex="-1"
  class={["notice grid gap-3 rounded-lg p-3", "bg-raised", floating ? "floating absolute bottom-1 left-16 z-20 w-[272px]" : "mb-2"]}
  {onkeydown}
>
  <div class="grid gap-1">
    <h2 id="screen-notice-title" class="text-fg text-[13px] leading-[19px] font-medium">Before you pick</h2>
    <p class="text-soft text-[13px] leading-[19px] text-pretty">
      {#if browser === "firefox"}
        In Firefox a screen share is video only, and it may be less smooth. A Chromium browser such as Chrome does better.
      {:else}
        A tab or a game's window sends its sound. A whole screen is video only.
      {/if}
    </p>
  </div>
  <div class="flex items-center justify-end gap-1.5">
    <Button variant="ghost" size="sm" class="hover:bg-raised-2" onclick={oncancel}>Cancel</Button>
    <Button bind:ref={go} variant="secondary" size="sm" class="bg-raised-2 text-fg" onclick={oncontinue}>
      Choose what to share
    </Button>
  </div>
</div>

<style>
  .notice {
    animation: arrive 180ms var(--ease-out);
  }
  /* A floating panel is lifted off the stage with the tooltip's soft drop, the system's one shadow. */
  .floating {
    box-shadow: 0 4px 16px -4px rgb(0 0 0 / 0.4);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .notice {
      animation: none;
    }
  }
</style>
