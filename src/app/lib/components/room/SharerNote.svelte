<script lang="ts">
  // A note on your own live share that only you see, driven by its statistics. A note
  // with `ondismiss` sits on a small raised panel with a close button; a quiet one is a
  // single muted line, like "Video only". Neither blocks anything.
  import X from "@lucide/svelte/icons/x";
  import type { Snippet } from "svelte";
  import IconButton from "../IconButton.svelte";

  let {
    label,
    ondismiss,
    children,
  }: {
    /** What the close button says it closes. */
    label?: string;
    ondismiss?: () => void;
    children: Snippet;
  } = $props();
</script>

{#if ondismiss}
  <div class="note bg-raised mb-2 flex items-start gap-1 rounded-lg py-1.5 pr-1 pl-2.5">
    <p class="text-soft flex-1 py-[calc((var(--control-xs)-var(--label-lh))/2)] text-xs text-pretty">{@render children()}</p>
    <IconButton label={label ?? "Dismiss"} size="icon-xs" side="top" class="hover:bg-raised-2 shrink-0" onclick={ondismiss}>
      <X />
    </IconButton>
  </div>
{:else}
  <p class="note -mt-1 pb-2 text-pretty">{@render children()}</p>
{/if}

<style>
  .note {
    animation: arrive 180ms var(--ease-out);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .note {
      animation: none;
    }
  }
</style>
