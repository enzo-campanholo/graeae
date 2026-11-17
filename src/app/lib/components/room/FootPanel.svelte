<script lang="ts">
  // A small panel that asks one thing before a share starts: the first-time notice before
  // the browser's picker, or the offer to hand a share over from another tab or device.
  // It is not a modal: it sits above the share buttons in the bar, or beside the folded
  // rail, and the rest of the room stays usable. Its way on takes the keyboard's focus, so
  // Enter goes on; Escape and Cancel close it.
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    id,
    title,
    action,
    floating = false,
    oncontinue,
    oncancel,
    children,
  }: {
    /** Names the panel's title for the dialog's label. */
    id: string;
    title: string;
    /** The way on, which says what happens next. */
    action: string;
    /** Beside the folded rail rather than in the bar's foot. */
    floating?: boolean;
    oncontinue: () => void;
    oncancel: () => void;
    /** The one line it says. */
    children: Snippet;
  } = $props();

  let go = $state<HTMLButtonElement | null>(null);

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
  aria-labelledby={id}
  tabindex="-1"
  class={["panel grid gap-3 rounded-lg p-3", "bg-raised", floating ? "floating absolute bottom-1 left-16 z-20 w-[272px]" : "mb-2"]}
  {onkeydown}
>
  <div class="grid gap-1">
    <h2 {id} class="text-fg text-[13px] leading-[19px] font-medium">{title}</h2>
    <p class="text-soft text-[13px] leading-[19px] text-pretty">{@render children()}</p>
  </div>
  <div class="flex items-center justify-end gap-1.5">
    <Button variant="ghost" size="sm" class="hover:bg-raised-2" onclick={oncancel}>Cancel</Button>
    <Button bind:ref={go} variant="secondary" size="sm" class="bg-raised-2 text-fg" onclick={oncontinue}>
      {action}
    </Button>
  </div>
</div>

<style>
  .panel {
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
    .panel {
      animation: none;
    }
  }
</style>
