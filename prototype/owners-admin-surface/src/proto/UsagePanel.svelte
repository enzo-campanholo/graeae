<script lang="ts">
  // The owner's usage meter and the usage budget settings.
  import { Button } from '$lib/components/ui/button'
  import UsageMeter from './UsageMeter.svelte'
  import { FREE_GB, admin, cost, field, setBudget, stopped, usd } from './admin.svelte'

  let draft = $state(admin.budgetGB)
  let asking = $state(false)
  const added = $derived(cost(draft) - cost(admin.budgetGB))
  function save() {
    if (added > 0) asking = true
    else setBudget(draft)
  }
</script>

<div class="space-y-4">
  <div>
    <div class="mb-2 font-medium">Usage this month</div>
    <UsageMeter detail />
    {#if stopped()}<div class="mt-2 text-xs text-red-300">The usage budget is used up. All watching is stopped until you raise it or the month resets.</div>{/if}
  </div>
  <div class="grid grid-cols-2 gap-3">
    <label class="space-y-1">
      <span class="text-xs font-medium text-muted-foreground">Usage budget (GB a month)</span>
      <input class={field} type="number" min="0" step="50" bind:value={draft} oninput={() => (asking = false)} />
    </label>
    <label class="space-y-1">
      <span class="text-xs font-medium text-muted-foreground">Resets on day (UTC)</span>
      <select class={field} bind:value={admin.resetDay}>
        {#each Array.from({ length: 28 }, (_, i) => i + 1) as d}<option value={d}>{d}</option>{/each}
      </select>
    </label>
  </div>
  <div class="text-xs text-muted-foreground">
    {draft <= FREE_GB ? `Free: Cloudflare bills nothing up to ${FREE_GB} GB.` : `Up to ${usd(cost(draft))} a month ($0.05 per GB past ${FREE_GB}).`}
    {#if draft < admin.usedGB}<span class="text-red-300"> That is below the {admin.usedGB} GB already used: all watching stops at once.</span>{/if}
  </div>
  {#if asking}
    <div class="space-y-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
      <div>Raise the usage budget to {draft} GB? This can add up to <b>{usd(added)}</b> to this month's Cloudflare bill.</div>
      <div class="flex gap-2">
        <Button size="sm" onclick={() => { setBudget(draft); asking = false }}>Raise to {draft} GB</Button>
        <Button size="sm" variant="ghost" onclick={() => { asking = false; draft = admin.budgetGB }}>Cancel</Button>
      </div>
    </div>
  {:else}
    <Button size="sm" variant="outline" disabled={draft === admin.budgetGB} onclick={save}>Save budget</Button>
  {/if}
</div>
