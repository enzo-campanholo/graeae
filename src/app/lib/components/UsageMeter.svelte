<script lang="ts">
  // Usage against the usage budget: a thin grey track that turns amber at 80% and red
  // at 95%, the points where the owner is warned.
  import { gigabytes } from "$lib/words.js";

  let { used, budget }: { used: number; budget: number } = $props();

  const fraction = $derived(budget > 0 ? used / budget : 1);
  const level = $derived(fraction >= 0.95 ? "stop" : fraction >= 0.8 ? "warn" : "ok");
</script>

<div class="grid gap-1.5">
  <div class="flex items-baseline justify-between text-xs">
    <span class="text-muted-foreground">Usage</span>
    <span class="text-soft tabular-nums">{gigabytes(used)} <span class="text-dim">of {gigabytes(budget)}</span></span>
  </div>
  <div
    class="bg-raised-2 h-1 overflow-hidden rounded-full"
    role="meter"
    aria-label="Usage this month"
    aria-valuemin={0}
    aria-valuemax={budget}
    aria-valuenow={used}
    aria-valuetext="{gigabytes(used)} of {gigabytes(budget)}"
  >
    <div
      class={["h-full rounded-full transition-[width] duration-300", { ok: "bg-soft", warn: "bg-warn", stop: "bg-stop" }[level]]}
      style:width="{Math.min(fraction, 1) * 100}%"
    ></div>
  </div>
</div>
