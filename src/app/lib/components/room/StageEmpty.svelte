<script lang="ts" module>
  import type { ShareKind, Sharing } from "$lib/share.js";

  /** A share someone else has live, which the empty stage offers to watch. */
  export interface LiveChoice {
    member: string;
    name: string;
    kind: ShareKind;
  }
</script>

<script lang="ts">
  // The stage before you watch anything, which is how every tab opens, as large choices
  // under a heading. With nothing live from anyone else it offers sharing: Share screen
  // and Share webcam, which do what the bar's do, and under them the panel a press asks
  // first (the first-time notice, or the offer to hand a share over), so it opens where
  // the click was. With shares live it offers each of them by name, and to watch them
  // all. Following a member who shares nothing, it says their shares will show here.
  // Once the month's usage budget is used up it says that, and that the owner can raise
  // it; the owner gets the way to Usage.
  import Eye from "@lucide/svelte/icons/eye";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Video from "@lucide/svelte/icons/video";
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { shareLabels } from "$lib/share.js";
  import StageChoice from "./StageChoice.svelte";

  let {
    shares,
    yoursLive = false,
    sharing,
    following = null,
    usedUp = false,
    owner = false,
    oneverything,
    onwatch,
    onscreen,
    onwebcam,
    panel,
  }: {
    /** The shares others have live, by name, a screen before a webcam. */
    shares: LiveChoice[];
    /** A share of yours is live, from this tab or another. */
    yoursLive?: boolean;
    /** Your shares from this tab, as the bar's share buttons have them. */
    sharing: Sharing;
    /** The name of the member followed, if any. */
    following?: string | null;
    /** The month's usage budget is used up: watching has stopped. */
    usedUp?: boolean;
    /** You are the owner, who can raise the usage budget. */
    owner?: boolean;
    oneverything?: () => void;
    onwatch?: (share: LiveChoice) => void;
    onscreen?: () => void;
    onwebcam?: () => void;
    /** What a press of the share buttons asks first, under them. */
    panel?: Snippet;
  } = $props();

  const labels = $derived(shareLabels(sharing));
</script>

{#if usedUp}
  <div class="grid justify-items-center gap-3 text-center">
    <div class="grid max-w-[46ch] gap-1">
      <p class="text-soft font-medium text-balance">This month's usage budget is used up.</p>
      <p class="text-muted-foreground text-balance">
        {#if owner}
          Watching stops until the month resets or you raise it. Shares stay live.
        {:else}
          Watching stops until the month resets or the owner raises it. Shares stay live.
        {/if}
      </p>
    </div>
    <!-- Over the room, which carries on under it with its shares. -->
    {#if owner}<Button variant="secondary" href="/owner/usage">Raise it in Usage</Button>{/if}
  </div>
{:else if following}
  <div class="grid gap-1 text-center">
    <p class="text-soft font-medium">{following} isn't sharing anything now.</p>
    <p class="text-muted-foreground">What they share next appears here.</p>
  </div>
{:else}
  <div class="grid justify-items-center gap-6 text-center">
    <div class="grid gap-1">
      <h2 class="text-fg text-base font-medium text-balance">
        {shares.length ? "You're not watching anything yet." : yoursLive ? "Only you are sharing." : "No one is sharing yet."}
      </h2>
      <p class="text-muted-foreground text-balance">
        {shares.length
          ? "Pick a share to watch it, or watch everything."
          : "Share your screen or webcam, and whoever is here can watch it."}
      </p>
    </div>
    {#if shares.length}
      <!-- Up to four to a row, a short last row centred under the others. -->
      <div class="flex max-w-[calc(4*var(--choice)+3*12px)] flex-wrap justify-center gap-3">
        {#each shares as share (`${share.member}:${share.kind}`)}
          <StageChoice
            label={share.name}
            kind={share.kind}
            who={share.name}
            icon={share.kind === "screen" ? Monitor : Video}
            name={`Watch ${share.name}'s ${share.kind}`}
            onclick={() => onwatch?.(share)}
          />
        {/each}
      </div>
      <Button variant="secondary" size="lg" onclick={oneverything}><Eye />Watch everything</Button>
    {:else}
      <!-- Raised, not filled, so the bar's Share screen stays the room's one filled button. -->
      <div class="relative flex gap-3">
        <StageChoice
          label={labels.screen}
          icon={Monitor}
          key={labels.keyed ? "S" : undefined}
          disabled={!labels.keyed}
          onclick={onscreen}
        />
        <StageChoice
          label={labels.webcam}
          icon={Video}
          disabled={sharing.webcamLive || sharing.webcamStarting}
          onclick={onwebcam}
        />
        {@render panel?.()}
      </div>
    {/if}
  </div>
{/if}
