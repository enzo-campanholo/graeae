<script lang="ts">
  // The room's bar: header, the list of people, and the foot with your own shares and
  // the share buttons. Its width (`--bar` in app.css) holds the two share buttons side by
  // side and still leaves a single 16:9 share on a maximised 1080p window limited by height.
  import type { Snippet } from "svelte";

  let { header, children, foot }: { header: Snippet; children?: Snippet; foot?: Snippet } = $props();
</script>

<aside class="flex w-bar shrink-0 flex-col px-2" aria-label="People">
  {@render header()}
  <!-- When your own shares fill the foot, the people scroll under a soft fade, so a cut row
       reads as "more below" rather than as a sliver; the padding lets the last row scroll clear. -->
  <div class="people min-h-0 flex-1 overflow-y-auto pt-3 pb-4">
    {@render children?.()}
  </div>
  {#if foot}
    <div class="grid gap-0 pt-2 pb-1">{@render foot()}</div>
  {/if}
</aside>

<style>
  .people {
    mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent);
  }
</style>
