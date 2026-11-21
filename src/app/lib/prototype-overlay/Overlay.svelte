<script lang="ts">
  // PROTOTYPE (prototype/overlay), throwaway. The frame "You" or the owner page opens in
  // over the page under it, in the chosen variant:
  // A, a sheet that takes the stage's place, the bar beside it still live;
  // B, a centred panel over the whole room, dimmed under it;
  // C, a side panel on the right, the stage making room for it beside the bar.
  // Escape, the close button and the back button close it; the room underneath carries on.
  import type { Snippet } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly, scale } from "svelte/transition";
  import { closeOverlay } from "../../router/router.svelte.ts";
  import Switcher from "./Switcher.svelte";
  import { SIDE_WIDTH, provideFrame, variant } from "./variant.svelte.ts";

  let { kind, children }: { kind: "you" | "owner"; children: Snippet } = $props();

  provideFrame({ variant: () => variant.current, close: closeOverlay });

  $effect(() => {
    variant.open = kind;
    return () => (variant.open = null);
  });

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ms = (value: number) => (still ? 0 : value);

  // Variant A sits exactly where the stage is, whatever the bar or rail beside it.
  let stageRect = $state<{ left: number; top: number; right: number; bottom: number } | null>(null);
  $effect(() => {
    if (variant.current !== "A") return;
    const measure = () => {
      const stage = document.querySelector('main[aria-label="Stage"]');
      const rect = stage?.getBoundingClientRect();
      stageRect = rect
        ? { left: rect.left, top: rect.top, right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom }
        : null;
    };
    measure();
    const observer = new ResizeObserver(measure);
    const stage = document.querySelector('main[aria-label="Stage"]');
    if (stage) observer.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  let panel = $state<HTMLElement | null>(null);
  $effect(() => {
    panel?.focus({ preventScroll: true });
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    // A confirm or a menu open inside closes first.
    if (document.querySelector('[role="alertdialog"], [role="menu"]')) return;
    event.preventDefault();
    closeOverlay();
  }
</script>

<svelte:window {onkeydown} />

{#key variant.current}
  {#if variant.current === "A"}
    <div
      bind:this={panel}
      tabindex="-1"
      role="dialog"
      aria-label={kind === "you" ? "You" : "Owner"}
      class="bg-stage fixed z-40 overflow-hidden rounded-xl outline-none"
      style:left="{stageRect?.left ?? 8}px"
      style:top="{stageRect?.top ?? 8}px"
      style:right="{stageRect?.right ?? 8}px"
      style:bottom="{stageRect?.bottom ?? 8}px"
      transition:fade={{ duration: ms(150) }}
    >
      {@render children()}
    </div>
  {:else if variant.current === "B"}
    <div class="fixed inset-0 z-40 grid place-items-center p-8">
      <button
        type="button"
        class="bg-letterbox/60 absolute inset-0 cursor-default"
        aria-label="Close"
        tabindex="-1"
        onclick={closeOverlay}
        transition:fade={{ duration: ms(180) }}
      ></button>
      <div
        bind:this={panel}
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label={kind === "you" ? "You" : "Owner"}
        class={[
          "shadow-lift relative overflow-hidden rounded-xl outline-none",
          kind === "owner" ? "bg-ground h-[min(880px,100%)] w-[min(1280px,100%)]" : "bg-stage max-h-full w-[min(640px,100%)]",
        ]}
        transition:scale={{ start: 0.985, duration: ms(220), easing: cubicOut }}
      >
        {@render children()}
      </div>
    </div>
  {:else}
    <div
      bind:this={panel}
      tabindex="-1"
      role="dialog"
      aria-label={kind === "you" ? "You" : "Owner"}
      class="bg-stage fixed top-2 right-2 bottom-2 z-40 overflow-hidden rounded-xl outline-none"
      style:width="{SIDE_WIDTH[kind]}px"
      transition:fly={{ x: 16, duration: ms(220), easing: cubicOut }}
    >
      {@render children()}
    </div>
  {/if}
{/key}

<Switcher />
