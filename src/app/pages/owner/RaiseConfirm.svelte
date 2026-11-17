<script lang="ts">
  // The confirm before the usage budget goes up: the one place the owner takes on more
  // possible cost, so it names the most the new budget can add to a month's Cloudflare
  // bill. Cancel holds the focus when it opens, so Enter alone never raises it.
  import { budgetCost, INCLUDED_GIGABYTES } from "$lib/owner-usage.svelte.js";
  import { dollars } from "$lib/words.js";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let {
    open = $bindable(false),
    from,
    to,
    saving = false,
    onconfirm,
  }: {
    open?: boolean;
    /** The budget now and the one asked for, in GB. */
    from: number;
    to: number;
    /** The new budget is being saved: Raise waits, and the modal stays until it is done. */
    saving?: boolean;
    onconfirm: () => void;
  } = $props();

  const added = $derived(budgetCost(to) - budgetCost(from));
  const amount = $derived(to.toLocaleString("en"));
</script>

<ConfirmDialog
  bind:open
  title="Raise the usage budget to {amount} GB?"
  action="Raise to {amount} GB"
  busy={saving}
  {onconfirm}
>
  {#if added > 0}
    <span class="block">
      This can add up to <span class="text-fg font-medium tabular-nums">{dollars(added)}</span> a month to your Cloudflare
      bill.
    </span>
    <span class="text-muted-foreground block">
      Watched media past {INCLUDED_GIGABYTES.toLocaleString("en")} GB costs $0.05 per GB.
      {#if budgetCost(from) > 0}At {amount} GB a month can cost up to {dollars(budgetCost(to))} in all.{/if}
    </span>
  {:else}
    <span class="block">
      This adds <span class="text-fg font-medium tabular-nums">{dollars(0)}</span> to your Cloudflare bill: it stays
      within the {INCLUDED_GIGABYTES.toLocaleString("en")} GB Cloudflare includes each month.
    </span>
  {/if}
</ConfirmDialog>
