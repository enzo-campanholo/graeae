<script lang="ts">
  // C: a panel on the right of the stage. The room stays live beside it.
  // One place for the owner's screens and the member's own, drilled into from a home list.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import UserPlus from '@lucide/svelte/icons/user-plus'
  import X from '@lucide/svelte/icons/x'
  import { Button } from '$lib/components/ui/button'
  import InviteForm from './InviteForm.svelte'
  import Invites from './Invites.svelte'
  import MemberAdmin from './MemberAdmin.svelte'
  import Mine from './Mine.svelte'
  import RoomsAdmin from './RoomsAdmin.svelte'
  import UsageMeter from './UsageMeter.svelte'
  import UsagePanel from './UsagePanel.svelte'
  import { ME, proto } from './state.svelte'
  import { admin, hereIn, isOwner } from './admin.svelte'

  let { roomId }: { roomId: string } = $props()
  const p = $derived(admin.panel!)
  const titles = { home: 'Owner', member: 'Member', invite: 'Invite someone', usage: 'Usage', rooms: 'Rooms', you: 'You' }
  const go = (view: typeof p.view, id?: string) => (admin.panel = { view, id })
  const head = 'mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'
  const link = 'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted'
</script>

<aside class="flex w-96 shrink-0 flex-col border-l">
  <div class="flex items-center gap-1 border-b p-2">
    {#if p.view !== 'home' && p.view !== 'you' && isOwner()}
      <Button size="icon-sm" variant="ghost" title="Back" onclick={() => go('home')}><ArrowLeft /></Button>
    {/if}
    <span class="flex-1 px-1 font-semibold">{titles[p.view]}</span>
    <Button size="icon-sm" variant="ghost" title="Close" onclick={() => (admin.panel = null)}><X /></Button>
  </div>
  <div class="flex-1 space-y-5 overflow-y-auto p-4">
    {#if p.view === 'you'}
      <Mine />
    {:else if p.view === 'member' && p.id}
      <MemberAdmin id={p.id} confirm="undo" />
    {:else if p.view === 'invite'}
      <InviteForm mode="message" room={roomId} />
    {:else if p.view === 'usage'}
      <UsagePanel />
    {:else if p.view === 'rooms'}
      <RoomsAdmin />
    {:else}
      <button class="block w-full rounded-md p-2 text-left hover:bg-muted" onclick={() => go('usage')}><UsageMeter detail /></button>
      <Button class="w-full" onclick={() => go('invite')}><UserPlus />Invite someone</Button>
      {#if admin.invites.length}
        <div><div class={head}>Pending invites</div><Invites /></div>
      {/if}
      <div>
        <div class={head}>Members · {proto.members.length}</div>
        {#each proto.members.filter((m) => m.id !== ME) as m (m.id)}
          <button class={link} onclick={() => go('member', m.id)}>
            <span class="flex items-center gap-2">
              <span class="size-2 rounded-full {hereIn(m.id, null) ? 'bg-emerald-400' : 'border'}"></span>{m.name}
            </span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              {admin.access[m.id]?.length ?? 0} rooms · {admin.devices[m.id]?.length ?? 0} devices<ChevronRight class="size-4" />
            </span>
          </button>
        {/each}
      </div>
      <button class={link} onclick={() => go('rooms')}>
        <span>Rooms</span><span class="flex items-center gap-1 text-xs text-muted-foreground">{admin.rooms.length}<ChevronRight class="size-4" /></span>
      </button>
    {/if}
  </div>
</aside>
