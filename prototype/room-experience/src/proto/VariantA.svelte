<script lang="ts">
  // A: Sidebar and grid. A checklist of live shares on the left; what you tick fills the grid.
  import Monitor from '@lucide/svelte/icons/monitor'
  import Video from '@lucide/svelte/icons/video'
  import Check from '@lucide/svelte/icons/check'
  import { Button } from '$lib/components/ui/button'
  import { Separator } from '$lib/components/ui/separator'
  import Tile from './Tile.svelte'
  import People from './People.svelte'
  import Notice from './Notice.svelte'
  import ShareControls from './ShareControls.svelte'
  import { gridCols, isWatched, member, mine, others, proto, toggleWatch, watchAll, watchNone, watchedShares } from './state.svelte'

  let { roomName }: { roomName: string } = $props()
  const shown = $derived(watchedShares())
  const focused = $derived(shown.find((s) => s.id === proto.focused))
  const rest = $derived(shown.filter((s) => s.id !== proto.focused))
</script>

<div class="flex h-full">
  <aside class="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r p-3">
    <h1 class="text-lg font-semibold">{roomName}</h1>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live · {others().length}</span>
        <span class="flex gap-1">
          <Button size="xs" variant="ghost" onclick={() => watchAll('webcam')}>Webcams</Button>
          <Button size="xs" variant="ghost" onclick={() => watchAll()}>All</Button>
          <Button size="xs" variant="ghost" onclick={watchNone}>None</Button>
        </span>
      </div>
      {#each others() as s (s.id)}
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted {isWatched(s.id) ? 'bg-muted' : ''}"
          onclick={() => toggleWatch(s.id)}
        >
          {#if s.kind === 'screen'}<Monitor class="size-4" />{:else}<Video class="size-4" />{/if}
          <span class="flex-1 truncate">
            {member(s.memberId).name}
            <span class="text-muted-foreground">· {s.kind === 'webcam' ? 'webcam' : s.label}</span>
          </span>
          {#if isWatched(s.id)}<Check class="size-4 text-emerald-400" />{/if}
        </button>
      {:else}
        <p class="px-2 py-1 text-sm text-muted-foreground">Nobody is sharing.</p>
      {/each}
    </div>

    <Separator />
    <People />

    <div class="mt-auto space-y-2">
      <Notice />
      {#each mine() as s (s.id)}
        <Tile share={s} class="aspect-video" small />
      {/each}
      <div class="grid grid-cols-2 gap-2"><ShareControls size="sm" /></div>
    </div>
  </aside>

  <main class="min-w-0 flex-1 p-3">
    {#if shown.length === 0}
      <div class="grid h-full place-items-center text-center text-muted-foreground">
        <div>
          <p class="text-lg text-foreground">You are not watching anything.</p>
          <p class="text-sm">Pick shares on the left, or</p>
          <Button class="mt-3" variant="secondary" onclick={() => watchAll()}>Watch everything</Button>
        </div>
      </div>
    {:else if focused}
      <div class="flex h-full flex-col gap-3">
        <Tile share={focused} class="flex-1" />
        {#if rest.length}
          <div class="flex h-32 shrink-0 gap-3">
            {#each rest as s (s.id)}<Tile share={s} class="aspect-video h-full" small />{/each}
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
