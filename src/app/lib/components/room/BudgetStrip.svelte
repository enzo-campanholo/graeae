<script lang="ts">
  // The usage budget's warning, a strip across the top of the stage: the owner's from
  // 80% of the month's usage budget, with the way to Usage; everyone's from 95%. It says
  // only how far the month has gone and what happens at the limit. It holds no control
  // but the owner's link, and nothing in the room changes because of it.
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import type { BudgetLevel } from "../../../../shared/socket/index.ts";

  let { level, owner = false }: { level: Exclude<BudgetLevel, "used up">; owner?: boolean } = $props();
</script>

<div class="strip bg-warn/8 flex h-control shrink-0 items-center gap-2 rounded-lg pr-1 pl-3 text-xs">
  <CircleAlert class="text-warn size-icon-sm shrink-0" aria-hidden="true" />
  <p class="text-soft min-w-0 flex-1 truncate">
    Usage is past {level} of this month's usage budget.
    {#if level === "95%"}<span class="text-muted-foreground">Watching stops for everyone when it runs out.</span>{/if}
  </p>
  {#if owner}
    <!-- A new tab, so the room, its shares and its watching carry on meanwhile. -->
    <a
      href="/owner/usage"
      class="text-muted-foreground hover:bg-raised hover:text-fg focus-visible:ring-ring inline-flex h-control-xs shrink-0 items-center rounded-md px-1.5 font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
    >
      Usage
    </a>
  {/if}
</div>

<style>
  /* Arrives as the screen notice does: 180ms, rising 4px. */
  .strip {
    animation: arrive 180ms var(--ease-out);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .strip {
      animation: none;
    }
  }
</style>
