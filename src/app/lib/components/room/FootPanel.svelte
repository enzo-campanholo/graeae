<script lang="ts" module>
  /** Where the panel opens: the bar's foot, beside the folded rail, or the empty stage. */
  export type PanelPlace = "foot" | "rail" | "stage";
</script>

<script lang="ts">
  // A small panel that asks one thing before a share starts: the first-time notice before
  // the browser's picker, or the offer to hand a share over from another tab or device.
  // It is not a modal: it sits above the share buttons in the bar, beside the folded rail,
  // or on the empty stage under its share buttons when one of those was pressed, so it
  // opens where the click was. The rest of the room stays usable. Its way on takes the
  // keyboard's focus, so Enter goes on; Escape and Cancel close it.
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    id,
    title,
    action,
    place = "foot",
    oncontinue,
    oncancel,
    children,
  }: {
    /** Names the panel's title for the dialog's label. */
    id: string;
    title: string;
    /** The way on, which says what happens next. */
    action: string;
    place?: PanelPlace;
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
  class={[
    "panel bg-raised grid gap-3 rounded-lg p-3 text-left",
    place === "foot" && "mb-2",
    place === "rail" && "floating absolute bottom-1 left-[calc(var(--rail)+0.5rem)] z-20 w-[calc(var(--bar)-1rem)]",
    // Under the stage's share buttons, without moving them.
    place === "stage" && "floating absolute top-[calc(100%+12px)] left-1/2 z-20 w-[calc(var(--bar)-1rem)] -translate-x-1/2",
  ]}
  {onkeydown}
>
  <div class="grid gap-1">
    <h2 {id} class="text-fg text-sm font-medium">{title}</h2>
    <p class="text-soft text-sm text-pretty">{@render children()}</p>
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
    box-shadow: var(--lift);
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
