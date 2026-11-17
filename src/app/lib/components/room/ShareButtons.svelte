<script lang="ts">
  // The two ways to start sharing, side by side at the foot of the bar, or stacked as
  // icons in the rail. Share screen is the one filled button in the room.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import IconButton from "../IconButton.svelte";

  let {
    compact = false,
    webcamLive = false,
    onscreen,
    onwebcam,
  }: {
    compact?: boolean;
    webcamLive?: boolean;
    onscreen?: () => void;
    onwebcam?: () => void;
  } = $props();
</script>

{#if compact}
  <div class="grid gap-1.5">
    <IconButton label="Share screen" key="S" variant="default" size="icon" side="right" onclick={onscreen}>
      <Monitor />
    </IconButton>
    <IconButton
      label={webcamLive ? "Webcam live" : "Share webcam"}
      variant="secondary"
      size="icon"
      side="right"
      disabled={webcamLive}
      class="disabled:text-faint disabled:opacity-100"
      onclick={onwebcam}
    >
      <Video />
    </IconButton>
  </div>
{:else}
  <div class="grid grid-cols-2 gap-1.5">
    <Button onclick={onscreen}>
      <Monitor />Share screen<Kbd>S</Kbd>
    </Button>
    <Button
      variant="secondary"
      class="disabled:text-muted-foreground disabled:opacity-100"
      disabled={webcamLive}
      onclick={onwebcam}
    >
      <Video />{webcamLive ? "Webcam live" : "Share webcam"}
    </Button>
  </div>
{/if}
