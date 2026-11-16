<script lang="ts">
  // Who is present, and who has access but is not here.
  import { proto } from './state.svelte'
  const present = $derived(proto.members.filter((m) => m.present))
  const away = $derived(proto.members.filter((m) => !m.present))
</script>

<div class="space-y-3 text-sm">
  <div>
    <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Present · {present.length}</div>
    {#each present as m}
      <div class="flex items-center gap-2 py-0.5">
        <span class="size-2 rounded-full bg-emerald-400"></span>{m.name}
      </div>
    {/each}
  </div>
  <div>
    <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Has access · not here</div>
    {#each away as m}
      <div class="flex items-center gap-2 py-0.5 text-muted-foreground">
        <span class="size-2 rounded-full border"></span>{m.name}
      </div>
    {/each}
  </div>
</div>
