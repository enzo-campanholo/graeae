<script lang="ts">
  // PROTOTYPE. Three variants of where the owner's screens live, switchable via ?variant=A|B|C,
  // on the room from the room-experience prototype. See src/proto/admin.svelte.ts.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import Settings from '@lucide/svelte/icons/settings'
  import { Button } from '$lib/components/ui/button'
  import Mine from './proto/Mine.svelte'
  import OwnerPage from './proto/OwnerPage.svelte'
  import PrototypeBar from './proto/PrototypeBar.svelte'
  import Room from './proto/Room.svelte'
  import { ROOMS, proto } from './proto/state.svelte'
  import { admin, isOwner, myRooms } from './proto/admin.svelte'

  const room = $derived(admin.rooms.find((r) => r.id === proto.room))
  const page = $derived(admin.variant === 'B' ? admin.page : 'room')
  const fake = (id: string) => ROOMS.find((r) => r.id === id)
</script>

{#if page === 'owner' && isOwner()}
  <OwnerPage />
{:else if page === 'you'}
  <div class="mx-auto max-w-md space-y-6 p-10">
    <Button size="sm" variant="ghost" onclick={() => (admin.page = 'room')}><ArrowLeft />Back</Button>
    <h1 class="text-xl font-semibold">You</h1>
    <Mine />
  </div>
{:else if !room}
  <!-- The root address for a member with several rooms. -->
  <div class="mx-auto max-w-md space-y-3 p-10">
    <div class="flex items-center gap-1">
      <h1 class="flex-1 text-xl font-semibold">Your rooms</h1>
      {#if admin.variant === 'B'}
        <Button size="sm" variant="ghost" title="Your name and devices" onclick={() => (admin.page = 'you')}>{admin.myName} <span class="text-muted-foreground">(you)</span></Button>
        {#if isOwner()}
          <Button size="icon-sm" variant="ghost" title="Owner: people, invites, rooms, usage" onclick={() => (admin.page = 'owner')}><Settings /></Button>
        {/if}
      {/if}
    </div>
    {#each myRooms() as r (r.id)}
      <button class="flex w-full items-center justify-between rounded-lg border p-4 text-left hover:bg-muted" onclick={() => (proto.room = r.id)}>
        <span>
          <span class="font-medium">{r.name}</span>
          <span class="block text-sm text-muted-foreground">{fake(r.id)?.present.length ? fake(r.id)!.present.join(', ') : 'Nobody here'}</span>
        </span>
        {#if fake(r.id)?.live}<span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">{fake(r.id)!.live} live</span>{/if}
      </button>
    {/each}
  </div>
{:else}
  <div class="relative h-full">
    <Room roomId={room.id} roomName={room.name} />
  </div>
{/if}

<PrototypeBar />
