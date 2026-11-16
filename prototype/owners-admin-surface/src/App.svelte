<script lang="ts">
  // PROTOTYPE. Three variants of where the owner's screens live, switchable via ?variant=A|B|C,
  // on the room from the room-experience prototype. See src/proto/admin.svelte.ts.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
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
    <Button size="sm" variant="ghost" onclick={() => (admin.page = 'room')}><ArrowLeft />Back to the room</Button>
    <h1 class="text-xl font-semibold">You</h1>
    <Mine />
  </div>
{:else if !room}
  <!-- The root address for a member with several rooms. -->
  <div class="mx-auto max-w-md space-y-3 p-10">
    <h1 class="text-xl font-semibold">Your rooms</h1>
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
    {#if proto.rooms > 1}
      <Button class="absolute left-1/2 top-1 z-10 -translate-x-1/2" size="xs" variant="ghost" onclick={() => (proto.room = null)}>
        <ArrowLeft />Rooms
      </Button>
    {/if}
    <Room roomId={room.id} roomName={room.name} />
  </div>
{/if}

<PrototypeBar />
