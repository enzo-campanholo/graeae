<script lang="ts">
  // The offer to hand a share over: you pressed "Share screen" or "Share webcam" while a
  // share of that kind of yours is live from another tab or device. Going on stops it
  // there and shares from here; whoever watches it in this room is carried over.
  import type { ShareKind } from "$lib/share.js";
  import FootPanel from "./FootPanel.svelte";

  let {
    kind,
    floating = false,
    oncontinue,
    oncancel,
  }: {
    kind: ShareKind;
    /** Beside the folded rail rather than in the bar's foot. */
    floating?: boolean;
    oncontinue: () => void;
    oncancel: () => void;
  } = $props();
</script>

<FootPanel
  id="hand-over-title"
  title={kind === "screen" ? "Your screen is already live" : "Your webcam is already live"}
  action="Share from here"
  {floating}
  {oncontinue}
  {oncancel}
>
  It's live from another tab or device. Stop it there and share from here?
</FootPanel>
