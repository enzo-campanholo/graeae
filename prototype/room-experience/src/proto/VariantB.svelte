<script lang="ts">
  // B: Wall of shares. Every live share already has its place on the wall as a still poster;
  // one click on a poster starts watching it in place. No list, no sidebar.
  import Play from '@lucide/svelte/icons/play'
  import Monitor from '@lucide/svelte/icons/monitor'
  import Video from '@lucide/svelte/icons/video'
  import Users from '@lucide/svelte/icons/users'
  import { Button } from '$lib/components/ui/button'
  import * as Popover from '$lib/components/ui/popover'
  import Tile from './Tile.svelte'
  import FakeVideo from './FakeVideo.svelte'
  import People from './People.svelte'
  import Notice from './Notice.svelte'
  import ShareControls from './ShareControls.svelte'
  import { gridCols, isWatched, member, proto, watch, watchAll, watchNone } from './state.svelte'

  let { roomName }: { roomName: string } = $props()
  // screens first, then webcams; my own shares sit on the wall too
  const wall = $derived([...proto.shares].sort((a, b) => a.kind.localeCompare(b.kind)))
  const cols = $derived(proto.focused ? 4 : gridCols(wall.length))
  const present = $derived(proto.members.filter((m) => m.present).length)
</script>

<div class="flex h-full flex-col">
  <header class="flex items-center gap-2 border-b px-4 py-2">
    <h1 class="text-lg font-semibold">{roomName}</h1>
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} size="sm" variant="ghost"><Users />{present} present</Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-56"><People /></Popover.Content>
    </Popover.Root>
    <span class="mx-2 h-5 border-l"></span>
    <Button size="sm" variant="ghost" onclick={() => watchAll('webcam')}>Watch all webcams</Button>
    <Button size="sm" variant="ghost" onclick={() => watchAll()}>Watch all</Button>
    <Button size="sm" variant="ghost" onclick={watchNone}>Stop all</Button>
    <span class="ml-auto flex items-center gap-2"><Notice /><ShareControls size="sm" /></span>
  </header>

  <main class="min-h-0 flex-1 p-3">
    {#if wall.length === 0}
      <div class="grid h-full place-items-center text-center">
        <div class="space-y-3">
          <p class="text-lg">Nobody is sharing yet.</p>
          <div class="flex justify-center gap-2"><ShareControls size="lg" /></div>
        </div>
      </div>
    {:else}
      <div class="grid h-full gap-3" style="grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); grid-auto-flow: dense">
        {#each wall as s (s.id)}
          {@const span = proto.focused === s.id ? 'col-span-3 row-span-3' : ''}
          {#if isWatched(s.id) || s.memberId === 'me'}
            <Tile share={s} class={span} small={!!proto.focused && proto.focused !== s.id} />
          {:else}
            <button
              class="group relative min-h-0 overflow-hidden rounded-lg border border-dashed text-left"
              style="container-type: size"
              onclick={() => watch(s.id)}
            >
              <FakeVideo share={s} paused />
              <div class="absolute inset-0 grid place-items-center">
                <div class="flex flex-col items-center gap-2">
                  <span class="grid size-12 place-items-center rounded-full bg-white/15 transition group-hover:bg-white/30"><Play /></span>
                  <span class="flex items-center gap-1.5 text-sm font-medium">
                    {#if s.kind === 'screen'}<Monitor class="size-4" />{:else}<Video class="size-4" />{/if}
                    {member(s.memberId).name}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {s.kind === 'webcam' ? 'webcam' : s.label}{s.kind === 'screen' && !s.audio ? ' · video only' : ''}
                  </span>
                </div>
              </div>
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </main>
</div>
