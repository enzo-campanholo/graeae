<script lang="ts">
  // C: Stage and dock. One share owns the screen; the rest of what you watch floats beside it.
  // People, not shares, are the unit: the dock holds one chip per present member.
  import Monitor from '@lucide/svelte/icons/monitor'
  import Video from '@lucide/svelte/icons/video'
  import Users from '@lucide/svelte/icons/users'
  import Grid from '@lucide/svelte/icons/layout-grid'
  import { Button } from '$lib/components/ui/button'
  import * as Popover from '$lib/components/ui/popover'
  import Tile from './Tile.svelte'
  import People from './People.svelte'
  import Notice from './Notice.svelte'
  import ShareControls from './ShareControls.svelte'
  import { ME, gridCols, isWatched, mine, proto, sharesOf, toggleWatch, watchAll, watchedShares } from './state.svelte'

  let { roomName }: { roomName: string } = $props()
  let grid = $state(false)
  const shown = $derived(watchedShares())
  // the stage holds the focused share, else the first screen watched, else the first share
  const stage = $derived(shown.find((s) => s.id === proto.focused) ?? shown.find((s) => s.kind === 'screen') ?? shown[0])
  const side = $derived(shown.filter((s) => s !== stage))
  const presentOthers = $derived(proto.members.filter((m) => m.present && m.id !== ME))
</script>

<div class="flex h-full flex-col">
  <main class="relative min-h-0 flex-1 p-3">
    {#if !stage}
      <div class="grid h-full place-items-center text-center text-muted-foreground">
        <div>
          <p class="text-lg text-foreground">{roomName}</p>
          <p class="text-sm">Click a lit icon next to a name below to start watching.</p>
        </div>
      </div>
    {:else if grid}
      <div class="grid h-full gap-3" style="grid-template-columns: repeat({gridCols(shown.length)}, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr)">
        {#each shown as s (s.id)}<Tile share={s} />{/each}
      </div>
    {:else}
      <Tile share={stage} class="h-full" />
      <div class="absolute right-6 top-6 flex w-56 flex-col gap-2">
        {#each side as s (s.id)}
          <button class="text-left" onclick={() => (proto.focused = s.id)} title="Put on stage">
            <Tile share={s} class="pointer-events-none aspect-video shadow-xl" small />
          </button>
        {/each}
      </div>
    {/if}
    <div class="absolute bottom-6 left-6 flex w-48 flex-col gap-2">
      <Notice />
      {#each mine() as s (s.id)}<Tile share={s} class="aspect-video shadow-xl" small />{/each}
    </div>
  </main>

  <footer class="flex items-center gap-2 border-t px-3 py-2">
    <span class="mr-1 text-sm font-semibold">{roomName}</span>
    {#each presentOthers as m (m.id)}
      {@const screen = sharesOf(m.id).find((s) => s.kind === 'screen')}
      {@const cam = sharesOf(m.id).find((s) => s.kind === 'webcam')}
      <div class="flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm">
        <span class="mr-1">{m.name}</span>
        <Button
          size="icon-sm" class="rounded-full" disabled={!screen}
          variant={screen && isWatched(screen.id) ? 'default' : 'ghost'}
          title={screen ? `${screen.label}${screen.audio ? '' : ' (video only)'}` : 'Not sharing a screen'}
          onclick={() => screen && toggleWatch(screen.id)}
        ><Monitor class={screen && !isWatched(screen.id) ? 'text-emerald-400' : ''} /></Button>
        <Button
          size="icon-sm" class="rounded-full" disabled={!cam}
          variant={cam && isWatched(cam.id) ? 'default' : 'ghost'}
          title={cam ? 'Webcam' : 'Not sharing a webcam'}
          onclick={() => cam && toggleWatch(cam.id)}
        ><Video class={cam && !isWatched(cam.id) ? 'text-emerald-400' : ''} /></Button>
      </div>
    {/each}
    <Button size="sm" variant="ghost" onclick={() => watchAll('webcam')}>All webcams</Button>
    <Button size="sm" variant={grid ? 'default' : 'ghost'} onclick={() => (grid = !grid)} title="Grid instead of stage"><Grid />Grid</Button>
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} size="sm" variant="ghost"><Users />People</Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-56"><People /></Popover.Content>
    </Popover.Root>
    <span class="ml-auto flex gap-2"><ShareControls size="sm" /></span>
  </footer>
</div>
