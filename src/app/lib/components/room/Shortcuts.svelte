<script lang="ts">
  // One-off picks for the whole room. They follow nobody.
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    onwebcams,
    oneverything,
    onnothing,
  }: { onwebcams?: () => void; oneverything?: () => void; onnothing?: () => void } = $props();
</script>

<div class="flex gap-0.5 px-0.5 pt-1.5" role="group" aria-label="Watch">
  <Button variant="ghost" size="xs" onclick={onwebcams}>Webcams</Button>
  <Button variant="ghost" size="xs" onclick={oneverything}>Everything</Button>
  <Button variant="ghost" size="xs" onclick={onnothing}>Nothing</Button>
</div>
