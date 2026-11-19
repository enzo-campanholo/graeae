<script lang="ts">
  // An owner section's side column: the thing picked in the list beside it, in full, on a
  // raised panel. Every section has one, at the same place (`owner-columns`), so the
  // list is always on the left and what it holds is always on the right.
  //
  // Controls inside sit one step up, on raised-2: an input, a secondary button, a row's
  // hover.
  import type { Snippet } from "svelte";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<aside class="bg-raised sticky top-0 grid gap-6 rounded-xl p-5" aria-label={label}>
  {@render children()}
</aside>
