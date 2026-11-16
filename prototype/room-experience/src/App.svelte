<script lang="ts">
  // PROTOTYPE. Three variants of the room, switchable via ?variant=A|B|C. See src/proto/state.svelte.ts.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import { Button } from '$lib/components/ui/button'
  import PrototypeBar from './proto/PrototypeBar.svelte'
  import VariantA from './proto/VariantA.svelte'
  import VariantB from './proto/VariantB.svelte'
  import VariantC from './proto/VariantC.svelte'
  import { ROOMS, proto } from './proto/state.svelte'

  const room = $derived(ROOMS.find((r) => r.id === proto.room))
</script>

{#if !room}
  <!-- The root address for a member with several rooms. Same in every variant. -->
  <div class="mx-auto max-w-md space-y-3 p-10">
    <h1 class="text-xl font-semibold">Your rooms</h1>
    {#each ROOMS as r}
      <button class="flex w-full items-center justify-between rounded-lg border p-4 text-left hover:bg-muted" onclick={() => (proto.room = r.id)}>
        <span>
          <span class="font-medium">{r.name}</span>
          <span class="block text-sm text-muted-foreground">{r.present.length ? r.present.join(', ') : 'Nobody here'}</span>
        </span>
        {#if r.live}<span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">{r.live} live</span>{/if}
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
    {#if proto.variant === 'B'}<VariantB roomName={room.name} />
    {:else if proto.variant === 'C'}<VariantC roomName={room.name} />
    {:else}<VariantA roomName={room.name} />{/if}
  </div>
{/if}

<PrototypeBar />
