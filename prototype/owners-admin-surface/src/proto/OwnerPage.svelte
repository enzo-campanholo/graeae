<script lang="ts">
  // B: a separate owner page. The room carries nothing but a button that leads here.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import Check from '@lucide/svelte/icons/check'
  import { Button } from '$lib/components/ui/button'
  import InviteForm from './InviteForm.svelte'
  import Invites from './Invites.svelte'
  import MemberAdmin from './MemberAdmin.svelte'
  import RoomsAdmin from './RoomsAdmin.svelte'
  import UsageMeter from './UsageMeter.svelte'
  import UsagePanel from './UsagePanel.svelte'
  import { proto } from './state.svelte'
  import { admin, has, hereIn, nameOf } from './admin.svelte'

  let picked = $state<string | null>(null)
  const tabs = $derived([
    { key: 'people', label: `People · ${proto.members.length}` },
    { key: 'invites', label: `Invites · ${admin.invites.length}` },
    { key: 'rooms', label: `Rooms · ${admin.rooms.length}` },
    { key: 'usage', label: 'Usage' },
  ] as const)
</script>

<div class="flex h-full">
  <nav class="flex w-56 shrink-0 flex-col gap-1 border-r p-3">
    <Button class="mb-3 justify-start" size="sm" variant="ghost" onclick={() => (admin.page = 'room')}><ArrowLeft />Back to the room</Button>
    <div class="px-2 pb-1 text-lg font-semibold">Owner</div>
    {#each tabs as t}
      <button class="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted {admin.ownerTab === t.key ? 'bg-muted' : ''}" onclick={() => (admin.ownerTab = t.key)}>{t.label}</button>
    {/each}
    <button class="mt-auto rounded-md p-2 text-left hover:bg-muted" onclick={() => (admin.ownerTab = 'usage')}><UsageMeter /></button>
  </nav>

  <div class="min-w-0 flex-1 overflow-y-auto p-8">
    {#if admin.ownerTab === 'people'}
      <div class="flex gap-8">
        <table class="h-fit flex-1 text-sm">
          <thead class="text-left text-xs text-muted-foreground">
            <tr>
              <th class="pb-2 font-medium">Member</th>
              {#each admin.rooms as r (r.id)}<th class="pb-2 text-center font-medium">{r.name}</th>{/each}
              <th class="pb-2 text-right font-medium">Devices</th>
              <th class="pb-2 text-right font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {#each proto.members as m (m.id)}
              <tr class="cursor-pointer border-t hover:bg-muted {picked === m.id ? 'bg-muted' : ''}" onclick={() => (picked = m.id)}>
                <td class="py-2 pl-2">
                  <span class="mr-2 inline-block size-2 rounded-full {hereIn(m.id, null) ? 'bg-emerald-400' : 'border'}"></span>{nameOf(m.id)}
                </td>
                {#each admin.rooms as r (r.id)}
                  <td class="text-center">{#if has(m.id, r.id)}<Check class="mx-auto size-4" />{/if}</td>
                {/each}
                <td class="text-right">{admin.devices[m.id]?.length ?? 0}</td>
                <td class="pr-2 text-right text-muted-foreground">{admin.devices[m.id]?.[0]?.last ?? 'never'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="w-80 shrink-0 rounded-lg border p-4">
          {#if picked}
            {#key picked}<MemberAdmin id={picked} confirm="dialog" />{/key}
          {:else}
            <div class="text-sm text-muted-foreground">Pick a member to change their rooms, see their devices, let them back in or remove them.</div>
          {/if}
        </div>
      </div>
    {:else if admin.ownerTab === 'invites'}
      <div class="flex gap-8">
        <div class="w-80 shrink-0 rounded-lg border p-4">
          <div class="mb-3 font-medium">Invite someone</div>
          <InviteForm mode="full" />
        </div>
        <div class="flex-1">
          <div class="mb-2 font-medium">Pending</div>
          <Invites />
        </div>
      </div>
    {:else if admin.ownerTab === 'rooms'}
      <div class="max-w-md"><RoomsAdmin /></div>
    {:else}
      <div class="max-w-lg"><UsagePanel /></div>
    {/if}
  </div>
</div>
