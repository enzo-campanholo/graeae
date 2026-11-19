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
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { shareLabels } from "$lib/share.js";
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

  const labels = $derived(shareLabels({ screenLive, screenStarting, webcamLive, webcamStarting }));
  // An icon alone says which share is starting.
  const screenLabel = $derived(screenStarting ? "Starting screen share" : labels.screen);
  const webcamLabel = $derived(webcamStarting ? "Starting webcam" : labels.webcam);
  const keyed = $derived(labels.keyed);
</script>

{#if compact}
  <div class="grid gap-1.5">
    <IconButton
      label={screenLabel}
      key={keyed ? "S" : undefined}
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
    <!-- Live, it rests as "Webcam live" does: a state, not a dimmed action. Its key is in
         its tooltip, as the rail's is, so its label sits as "Share webcam"'s does. -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant={screenLive ? "secondary" : "default"}
            class={screenLive ? "disabled:text-muted-foreground disabled:opacity-100" : undefined}
            disabled={screenLive || screenStarting}
            aria-keyshortcuts={keyed ? "S" : undefined}
            onclick={onscreen}
          >
            <Monitor />{labels.screen}
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      {#if keyed}<Tooltip.Content side="top">Share screen <Kbd>S</Kbd></Tooltip.Content>{/if}
    </Tooltip.Root>
    <Button
      variant="secondary"
      class="disabled:text-muted-foreground disabled:opacity-100"
      disabled={webcamLive || webcamStarting}
      onclick={onwebcam}
    >
      <Video />{labels.webcam}
    </Button>
  </div>
{/if}
