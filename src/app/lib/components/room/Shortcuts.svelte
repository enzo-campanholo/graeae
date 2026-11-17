<script lang="ts">
  // One-off picks for the whole room. They follow nobody. A dim "Watch" leads them, so
  // the row reads as what it does: watch webcams, everything or nothing.
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    onwebcams,
    oneverything,
    onnothing,
  }: { onwebcams?: () => void; oneverything?: () => void; onnothing?: () => void } = $props();
</script>

<div class="flex items-center gap-0.5 px-0.5 pt-1.5" role="group" aria-labelledby="shortcuts-label">
  <span id="shortcuts-label" class="text-dim pr-1 pl-1.5 text-xs">Watch</span>
  <Button variant="ghost" size="xs" onclick={onwebcams}>Webcams</Button>
  <Button variant="ghost" size="xs" onclick={oneverything}>Everything</Button>
  <Button variant="ghost" size="xs" onclick={onnothing}>Nothing</Button>
</div>
