<script lang="ts">
  // The confirm before the usage budget goes up: the one place the owner takes on more
  // possible cost, so it names the most the new budget can add to a month's Cloudflare
  // bill. Cancel holds the focus when it opens, so Enter alone never raises it.
  import { AlertDialog } from "bits-ui";
  import { Button } from "$lib/components/ui/button/index.js";
  import { budgetCost, INCLUDED_GIGABYTES } from "$lib/owner-usage.svelte.js";
  import { dollars } from "$lib/words.js";

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

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="bg-letterbox/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50" />
    <AlertDialog.Content
      class="bg-raised data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985] fixed top-1/2 left-1/2 z-50 grid w-[min(400px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl p-5 shadow-lift outline-none motion-reduce:animate-none"
    >
      <div class="grid gap-2">
        <AlertDialog.Title class="text-fg text-[15px] leading-[22px] font-medium text-balance">
          Raise the usage budget to {amount} GB?
        </AlertDialog.Title>
        <AlertDialog.Description class="text-soft grid gap-1.5">
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
        </AlertDialog.Description>
      </div>
      <div class="flex justify-end gap-1.5">
        <AlertDialog.Cancel>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" disabled={saving}>Cancel</Button>
          {/snippet}
        </AlertDialog.Cancel>
        <Button class="min-w-20" disabled={saving} onclick={onconfirm}>Raise to {amount} GB</Button>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
