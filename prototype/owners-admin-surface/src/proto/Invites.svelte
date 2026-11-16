<script lang="ts">
  // Pending invites, visible to the owner alone.
  import Copy from '@lucide/svelte/icons/copy'
  import X from '@lucide/svelte/icons/x'
  import { Button } from '$lib/components/ui/button'
  import { admin, cancelInvite, copy, roomName } from './admin.svelte'
  let { compact = false }: { compact?: boolean } = $props()
</script>

{#each admin.invites as i (i.id)}
  <div class="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted">
    <span class="min-w-0 flex-1">
      <span class="block truncate {compact ? 'text-muted-foreground' : ''}">{i.name}{i.back ? ' (back in)' : ''}</span>
      <span class="block truncate text-xs text-muted-foreground">
        {compact ? `expires ${i.expires}` : `${i.rooms.map(roomName).join(', ')} · expires ${i.expires}`}
      </span>
    </span>
    <Button size="icon-xs" variant="ghost" title="Copy the invite link" onclick={() => copy(i.link)}><Copy /></Button>
    <Button size="icon-xs" variant="ghost" title="Cancel this invite" onclick={() => cancelInvite(i.id)}><X /></Button>
  </div>
{:else}
  {#if !compact}<div class="px-2 py-1 text-sm text-muted-foreground">No pending invites.</div>{/if}
{/each}
