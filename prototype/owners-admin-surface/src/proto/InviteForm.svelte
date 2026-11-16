<script lang="ts">
  // The owner's invite flow: a display name, the rooms to grant, then a link to paste into Discord.
  // quick: one button creates the invite and copies the link. full: create, then copy.
  // message: create, then copy a ready-made message.
  import { Button } from '$lib/components/ui/button'
  import CopyLink from './CopyLink.svelte'
  import { admin, copy, createInvite, field, roomName, type Invite } from './admin.svelte'

  let { mode = 'full', room }: { mode?: 'quick' | 'full' | 'message'; room?: string } = $props()
  let nm = $state('')
  let rooms = $state<string[]>([room ?? admin.rooms[0].id])
  let made = $state<Invite | null>(null)
  const message = $derived(made ? `${made.name}, this gets you into graeae: ${made.link} (works once, for 7 days)` : '')

  function create() {
    if (!nm.trim() || !rooms.length) return
    made = createInvite(nm.trim(), rooms)
    if (mode === 'quick') copy(made.link)
  }
  function again() {
    made = null
    nm = ''
  }
</script>

{#if made}
  <div class="space-y-3">
    <div>
      <div class="font-medium">Invite for {made.name}{mode === 'quick' ? ' copied' : ' ready'}</div>
      <div class="text-xs text-muted-foreground">
        {made.rooms.map(roomName).join(', ')} · works once · valid 7 days. {made.name} shows up in the room after pressing "Join as {made.name}".
      </div>
    </div>
    {#if mode === 'message'}
      <textarea class="{field} h-20 resize-none text-xs" readonly>{message}</textarea>
      <div class="flex gap-2">
        <Button size="sm" onclick={() => copy(message)}>Copy message</Button>
        <Button size="sm" variant="outline" onclick={() => copy(made!.link)}>Copy only the link</Button>
      </div>
    {:else}
      <CopyLink link={made.link} label={mode === 'quick' ? 'Copy again' : 'Copy link'} />
    {/if}
    <Button size="sm" variant="ghost" onclick={again}>Invite someone else</Button>
  </div>
{:else}
  <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); create() }}>
    <label class="block space-y-1">
      <span class="text-xs font-medium text-muted-foreground">Display name</span>
      <input class={field} placeholder="What the others will see" bind:value={nm} />
    </label>
    <div class="space-y-1">
      <span class="text-xs font-medium text-muted-foreground">Rooms</span>
      {#each admin.rooms as r (r.id)}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="accent-primary" bind:group={rooms} value={r.id} />{r.name}
        </label>
      {/each}
    </div>
    <Button type="submit" size="sm" disabled={!nm.trim() || !rooms.length}>
      {mode === 'quick' ? 'Create and copy link' : 'Create invite'}
    </Button>
  </form>
{/if}
