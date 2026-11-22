<script lang="ts">
  // A titled group on "You": its heading, an optional line saying what it is
  // for, and its contents.
  import type { Snippet } from "svelte";

  let { title, description, children }: { title: string; description?: string; children: Snippet } =
    $props();
</script>

<section class="grid gap-3">
  <div class="grid gap-0.5">
    <h2 class="text-sm font-medium">{title}</h2>
    {#if description}<p class="text-muted-foreground">{description}</p>{/if}
  </div>
  {@render children()}
</section>
