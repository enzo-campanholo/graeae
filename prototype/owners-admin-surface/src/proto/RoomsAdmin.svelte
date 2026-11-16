<script lang="ts">
  // Create and rename rooms. only: show just that room (rename in place) plus "New room".
  import Plus from '@lucide/svelte/icons/plus'
  import { Button } from '$lib/components/ui/button'
  import { proto } from './state.svelte'
  import { admin, createRoom, field, has, renameRoom } from './admin.svelte'

  let { only }: { only?: string } = $props()
  let fresh = $state('')
  const list = $derived(only ? admin.rooms.filter((r) => r.id === only) : admin.rooms)
  const count = (id: string) => proto.members.filter((m) => has(m.id, id)).length
</script>

<div class="space-y-3">
  {#each list as r (r.id)}
    <div class="space-y-1">
      <input class={field} value={r.name} onchange={(e) => renameRoom(r.id, e.currentTarget.value)} />
      <div class="flex justify-between text-xs text-muted-foreground">
        <span class="font-mono">/{r.id} (never changes)</span><span>{count(r.id)} with access</span>
      </div>
    </div>
  {/each}
  <form class="flex gap-2 border-t pt-3" onsubmit={(e) => { e.preventDefault(); if (fresh.trim()) { createRoom(fresh); fresh = '' } }}>
    <input class="{field} min-w-0 flex-1" placeholder="New room name" bind:value={fresh} />
    <Button type="submit" size="sm" variant="outline" disabled={!fresh.trim()}><Plus />New room</Button>
  </form>
</div>
