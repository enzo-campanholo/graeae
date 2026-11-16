<script lang="ts">
  import { admin, pct, projected } from './admin.svelte'
  let { detail = false }: { detail?: boolean } = $props()
  const p = $derived(pct())
  const color = $derived(p >= 95 ? 'bg-red-400' : p >= 80 ? 'bg-amber-400' : 'bg-emerald-400')
  const proj = $derived(Math.min(100, (projected() / admin.budgetGB) * 100))
</script>

<div class="space-y-1">
  <div class="relative {detail ? 'h-3' : 'h-1.5'} rounded-full bg-muted">
    <div class="h-full rounded-full {color}" style="width: {Math.min(100, p)}%"></div>
    {#if detail}<div class="absolute -top-1 h-5 w-0.5 bg-foreground/70" style="left: {proj}%" title="Projected month-end"></div>{/if}
  </div>
  <div class="flex justify-between text-xs text-muted-foreground">
    <span>{admin.usedGB} of {admin.budgetGB} GB · {p}%</span>
    {#if detail}<span class={projected() > admin.budgetGB ? 'text-amber-300' : ''}>projected {projected()} GB by reset</span>{/if}
  </div>
</div>
