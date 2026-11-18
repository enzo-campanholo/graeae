<script lang="ts">
  // The two ways to start sharing, side by side at the foot of the bar, or stacked as
  // icons in the rail. Share screen is the one filled button in the room. Each reads
  // "Starting" once pressed, and is disabled while this tab sends a share of its kind.
  // While yours is live from another tab or device it stays enabled: pressing it offers
  // to hand that share over to this tab.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import IconButton from "../IconButton.svelte";

  let {
    compact = false,
    screenLive = false,
    screenStarting = false,
    webcamLive = false,
    webcamStarting = false,
    onscreen,
    onwebcam,
  }: {
    compact?: boolean;
    screenLive?: boolean;
    /** Pressed, and not live yet: the picker may be open. */
    screenStarting?: boolean;
    webcamLive?: boolean;
    /** Pressed, and not live yet. */
    webcamStarting?: boolean;
    onscreen?: () => void;
    onwebcam?: () => void;
  } = $props();

  const screenLabel = $derived(screenStarting ? "Starting screen share" : screenLive ? "Screen live" : "Share screen");
  const webcamLabel = $derived(webcamStarting ? "Starting webcam" : webcamLive ? "Webcam live" : "Share webcam");
</script>

{#if compact}
  <div class="grid gap-1.5">
    <IconButton
      label={screenLabel}
      key={screenLive || screenStarting ? undefined : "S"}
      variant={screenLive ? "secondary" : "default"}
      size="icon"
      side="right"
      disabled={screenLive || screenStarting}
      class={screenLive ? "disabled:text-muted-foreground disabled:opacity-100" : undefined}
      onclick={onscreen}
    >
      <Monitor />
    </IconButton>
    <IconButton
      label={webcamLabel}
      variant="secondary"
      size="icon"
      side="right"
      disabled={webcamLive || webcamStarting}
      class="disabled:text-muted-foreground disabled:opacity-100"
      onclick={onwebcam}
    >
      <Video />
    </IconButton>
  </div>
{:else}
  <div class="grid grid-cols-2 gap-1.5">
    <!-- Live, it rests as "Webcam live" does: a state, not a dimmed action. -->
    <Button
      variant={screenLive ? "secondary" : "default"}
      class={screenLive ? "disabled:text-muted-foreground disabled:opacity-100" : undefined}
      disabled={screenLive || screenStarting}
      onclick={onscreen}
    >
      <Monitor />{#if screenStarting}Starting{:else if screenLive}Screen live{:else}Share screen<Kbd>S</Kbd>{/if}
    </Button>
    <Button
      variant="secondary"
      class="disabled:text-muted-foreground disabled:opacity-100"
      disabled={webcamLive || webcamStarting}
      onclick={onwebcam}
    >
      <Video />{webcamStarting ? "Starting" : webcamLive ? "Webcam live" : "Share webcam"}
    </Button>
  </div>
{/if}
