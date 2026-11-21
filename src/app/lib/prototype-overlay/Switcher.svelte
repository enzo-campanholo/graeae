<script lang="ts">
  // PROTOTYPE (prototype/overlay), throwaway: the floating bar that flips between the
  // variants, deliberately unlike graeae so it is never mistaken for part of a design.
  // Development builds only.
  import { VARIANTS, setVariant, variant } from "./variant.svelte.ts";

  const index = $derived(VARIANTS.findIndex((each) => each.key === variant.current));
  const step = (by: number) => setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length]!.key);

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable], [role=radiogroup], [role=slider]")) return;
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  }
</script>

<svelte:window {onkeydown} />

{#if import.meta.env.DEV}
  <div class="prototype-switcher" data-prototype-switcher>
    <button type="button" onclick={() => step(-1)} aria-label="Previous variant">←</button>
    <span>{variant.current} ({VARIANTS[index]?.name})</span>
    <button type="button" onclick={() => step(1)} aria-label="Next variant">→</button>
  </div>
{/if}

<style>
  .prototype-switcher {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-radius: 999px;
    background: #ff2e88;
    color: #fff;
    font: 600 13px/1 system-ui, sans-serif;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.45);
  }
  .prototype-switcher span {
    padding: 0 6px;
    white-space: nowrap;
  }
  .prototype-switcher button {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.25);
    color: #fff;
    font-size: 15px;
  }
</style>
