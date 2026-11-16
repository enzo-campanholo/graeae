<script lang="ts">
  // D: People sidebar. A's sidebar and grid, but with C's idea that people are the unit:
  // one list of members, and each row carries that member's shares. Clicking the name
  // watches everything they share; the icons pick one share.
  import Monitor from '@lucide/svelte/icons/monitor'
  import Video from '@lucide/svelte/icons/video'
  import { Button } from '$lib/components/ui/button'
  import Tile from './Tile.svelte'
  import Notice from './Notice.svelte'
  import ShareControls from './ShareControls.svelte'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import { ME, gridCols, isWatched, mine, proto, sharesOf, switchTo, toggleWatch, watchAll, watchNone, watchedShares } from './state.svelte'

  let { roomName }: { roomName: string } = $props()
  const shown = $derived(watchedShares())
  const focused = $derived(shown.find((s) => s.id === proto.focused))
  const rest = $derived(shown.filter((s) => s.id !== proto.focused))
  const present = $derived(proto.members.filter((m) => m.present && m.id !== ME))
  const away = $derived(proto.members.filter((m) => !m.present))

</script>

<div class="flex h-full">
  {#if !proto.sidebar}
  <!-- collapsed: a thin rail, still one click to go to someone -->
  <aside class="flex w-12 shrink-0 flex-col items-center gap-2 border-r py-3">
    <Button size="icon-sm" variant="ghost" title="Show the bar (B)" onclick={() => (proto.sidebar = true)}><PanelLeft /></Button>
    {#each present as m (m.id)}
      {@const ss = sharesOf(m.id)}
      <button
        class="relative grid size-8 place-items-center rounded-full text-xs font-semibold disabled:opacity-40 {ss.some((s) => isWatched(s.id)) ? 'ring-2 ring-primary' : ''}"
        style="background: hsl({m.hue} 45% 30%)" disabled={!ss.length}
        title={ss.length ? `Go to ${m.name}` : `${m.name} is not sharing`}
        onclick={() => switchTo(m.id)}
      >
        {m.name[0]}
        {#if ss.length}<span class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-400"></span>{/if}
      </button>
    {/each}
    <div class="mt-auto flex flex-col gap-2"><ShareControls size="sm" labels={false} /></div>
  </aside>
  {:else}
  <aside class="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r p-3">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">{roomName}</h1>
      <Button size="icon-sm" variant="ghost" title="Hide the bar (B)" onclick={() => (proto.sidebar = false)}><PanelLeft /></Button>
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Present · {present.length + 1}</span>
        <span class="flex gap-1">
          <Button size="xs" variant="ghost" onclick={() => watchAll('webcam')}>Webcams</Button>
          <Button size="xs" variant="ghost" onclick={() => watchAll()}>All</Button>
          <Button size="xs" variant="ghost" onclick={watchNone}>None</Button>
        </span>
      </div>
      {#each present as m (m.id)}
        {@const ss = sharesOf(m.id)}
        {@const screen = ss.find((s) => s.kind === 'screen')}
        {@const cam = ss.find((s) => s.kind === 'webcam')}
        <div class="flex items-center gap-1 rounded-md pr-1 hover:bg-muted {ss.some((s) => isWatched(s.id)) ? 'bg-muted' : ''}">
          <button
            class="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm disabled:cursor-default"
            disabled={!ss.length}
            title={ss.length ? `Go to ${m.name}: watch only what they share` : `${m.name} is not sharing`}
            onclick={() => switchTo(m.id)}
          >
            <span class="size-2 shrink-0 rounded-full bg-emerald-400"></span>
            <span class="min-w-0">
              <span class="block truncate">{m.name}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {screen ? `${screen.label}${screen.audio ? '' : ' · video only'}` : cam ? 'webcam only' : 'not sharing'}
              </span>
            </span>
          </button>
          {#if screen}
            <Button size="icon-sm" variant={isWatched(screen.id) ? 'default' : 'outline'} title="{isWatched(screen.id) ? `Stop watching` : `Add`} screen: {screen.label}" onclick={() => toggleWatch(screen.id)}><Monitor /></Button>
          {/if}
          {#if cam}
            <Button size="icon-sm" variant={isWatched(cam.id) ? 'default' : 'outline'} title="{isWatched(cam.id) ? `Stop watching` : `Add`} webcam" onclick={() => toggleWatch(cam.id)}><Video /></Button>
          {/if}
        </div>
      {/each}
      <div class="flex items-center gap-2 px-2 py-2 text-sm">
        <span class="size-2 rounded-full bg-emerald-400"></span>You
      </div>
    </div>

    <div>
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Has access · not here</div>
      {#each away as m}
        <div class="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
          <span class="size-2 rounded-full border"></span>{m.name}
        </div>
      {/each}
    </div>

    <div class="mt-auto space-y-2">
      <Notice />
      {#each mine() as s (s.id)}
        <Tile share={s} class="aspect-video" small />
      {/each}
      <div class="grid grid-cols-2 gap-2"><ShareControls size="sm" /></div>
    </div>
  </aside>
  {/if}

  <main class="min-w-0 flex-1 p-3">
    {#if shown.length === 0}
      <div class="grid h-full place-items-center text-center text-muted-foreground">
        <div>
          <p class="text-lg text-foreground">You are not watching anything.</p>
          <p class="text-sm">Click a name on the left, or</p>
          <Button class="mt-3" variant="secondary" onclick={() => watchAll()}>Watch everything</Button>
        </div>
      </div>
    {:else if focused}
      <div class="flex h-full flex-col gap-3">
        <Tile share={focused} class="flex-1" />
        {#if rest.length}
          <div class="flex h-32 shrink-0 gap-3">
            {#each rest as s (s.id)}
              <button class="h-full text-left" title="Focus this one" onclick={() => (proto.focused = s.id)}>
                <Tile share={s} class="pointer-events-none aspect-video h-full" small />
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="grid h-full gap-3" style="grid-template-columns: repeat({gridCols(shown.length)}, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr)">
        {#each shown as s (s.id)}<Tile share={s} />{/each}
      </div>
    {/if}
  </main>
</div>
