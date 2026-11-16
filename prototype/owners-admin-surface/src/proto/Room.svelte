<script lang="ts">
  // The room from the room-experience prototype (its variant D, "People sidebar"),
  // with the owner's and the member's own screens attached in three different ways:
  //   A: everything hangs off the bar (row menus, popovers)
  //   B: the room stays clean; a button leads to a separate owner page and a "You" page
  //   C: a panel on the right, beside the stage, with the room still live
  import Ellipsis from '@lucide/svelte/icons/ellipsis'
  import Monitor from '@lucide/svelte/icons/monitor'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import Settings from '@lucide/svelte/icons/settings'
  import UserPlus from '@lucide/svelte/icons/user-plus'
  import Video from '@lucide/svelte/icons/video'
  import { Button } from '$lib/components/ui/button'
  import * as Popover from '$lib/components/ui/popover'
  import InviteForm from './InviteForm.svelte'
  import Invites from './Invites.svelte'
  import MemberAdmin from './MemberAdmin.svelte'
  import Mine from './Mine.svelte'
  import Notice from './Notice.svelte'
  import Panel from './Panel.svelte'
  import RoomsAdmin from './RoomsAdmin.svelte'
  import ShareControls from './ShareControls.svelte'
  import Tile from './Tile.svelte'
  import UsageMeter from './UsageMeter.svelte'
  import UsagePanel from './UsagePanel.svelte'
  import { ME, gridCols, isWatched, mine, proto, sharesOf, switchTo, toggleWatch, watchAll, watchNone, watchedShares, type Member } from './state.svelte'
  import { LIVE_ROOM, admin, has, isOwner, pct, stopped } from './admin.svelte'

  let { roomId, roomName }: { roomId: string; roomName: string } = $props()
  const v = $derived(admin.variant)
  const shown = $derived(stopped() ? [] : watchedShares())
  const focused = $derived(shown.find((s) => s.id === proto.focused))
  const rest = $derived(shown.filter((s) => s.id !== proto.focused))
  const withAccess = $derived(proto.members.filter((m) => has(m.id, roomId) && m.id !== ME))
  const present = $derived(withAccess.filter((m) => m.present && roomId === LIVE_ROOM))
  const away = $derived(withAccess.filter((m) => !present.includes(m)))
  const roomInvites = $derived(admin.invites.filter((i) => !i.back && i.rooms.includes(roomId)))
  const dots = 'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground'

  function openOwner(tab: typeof admin.ownerTab = 'people') {
    if (v === 'B') { admin.ownerTab = tab; admin.page = 'owner' }
    else if (v === 'C') admin.panel = { view: tab === 'usage' ? 'usage' : 'home' }
  }
</script>

{#snippet manage(m: Member)}
  {#if isOwner() && v === 'A'}
    <Popover.Root>
      <Popover.Trigger class={dots} title="Manage {m.name}"><Ellipsis class="size-4" /></Popover.Trigger>
      <Popover.Content side="right" align="start" class="w-80"><MemberAdmin id={m.id} confirm="inline" /></Popover.Content>
    </Popover.Root>
  {:else if isOwner() && v === 'C'}
    <button class={dots} title="Manage {m.name}" onclick={() => (admin.panel = { view: 'member', id: m.id })}><Ellipsis class="size-4" /></button>
  {/if}
{/snippet}

{#snippet you()}
  {@const row = 'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted'}
  {#if v === 'A'}
    <Popover.Root>
      <Popover.Trigger class={row} title="Your name and devices">
        <span class="size-2 rounded-full bg-emerald-400"></span>{admin.myName} <span class="text-muted-foreground">(you)</span>
      </Popover.Trigger>
      <Popover.Content side="right" align="start" class="w-80"><Mine /></Popover.Content>
    </Popover.Root>
  {:else}
    <button class={row} title="Your name and devices" onclick={() => (v === 'B' ? (admin.page = 'you') : (admin.panel = { view: 'you' }))}>
      <span class="size-2 rounded-full bg-emerald-400"></span>{admin.myName} <span class="text-muted-foreground">(you)</span>
    </button>
  {/if}
{/snippet}

<div class="flex h-full">
  {#if !proto.sidebar}
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
  <aside class="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r p-3">
    <div class="flex items-center justify-between gap-1">
      {#if isOwner() && v === 'A'}
        <Popover.Root>
          <Popover.Trigger class="min-w-0 truncate rounded-md px-1 text-left text-lg font-semibold hover:bg-muted" title="Rename this room, or make a new one">{roomName}</Popover.Trigger>
          <Popover.Content side="bottom" align="start" class="w-80"><RoomsAdmin only={roomId} /></Popover.Content>
        </Popover.Root>
      {:else}
        <h1 class="min-w-0 truncate text-lg font-semibold">{roomName}</h1>
      {/if}
      <span class="flex shrink-0">
        {#if isOwner() && v !== 'A'}
          <Button size="icon-sm" variant="ghost" title="Owner: people, invites, rooms, usage" onclick={() => openOwner()}><Settings /></Button>
        {/if}
        <Button size="icon-sm" variant="ghost" title="Hide the bar (B)" onclick={() => (proto.sidebar = false)}><PanelLeft /></Button>
      </span>
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
          {@render manage(m)}
        </div>
      {/each}
      {@render you()}
    </div>

    <div>
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Has access · not here</div>
      {#each away as m (m.id)}
        <div class="flex items-center gap-2 rounded-md py-0.5 pl-2 pr-1 text-sm text-muted-foreground hover:bg-muted">
          <span class="size-2 rounded-full border"></span><span class="min-w-0 flex-1 truncate">{m.name}</span>
          {@render manage(m)}
        </div>
      {/each}
    </div>

    {#if isOwner() && v === 'A'}
      <div>
        {#if roomInvites.length}
          <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Invited · not joined yet</div>
          <Invites compact />
        {/if}
        <Popover.Root>
          <Popover.Trigger class="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <UserPlus class="size-4" />Invite someone
          </Popover.Trigger>
          <Popover.Content side="right" align="start" class="w-80"><InviteForm mode="quick" room={roomId} /></Popover.Content>
        </Popover.Root>
      </div>
    {/if}

    <div class="mt-auto space-y-2">
      {#if isOwner() && v === 'A'}
        <Popover.Root>
          <Popover.Trigger class="block w-full rounded-md px-1 py-1 text-left hover:bg-muted" title="Usage and the usage budget"><UsageMeter /></Popover.Trigger>
          <Popover.Content side="right" align="end" class="w-96"><UsagePanel /></Popover.Content>
        </Popover.Root>
      {/if}
      <Notice />
      {#each mine() as s (s.id)}
        <Tile share={s} class="aspect-video" small />
      {/each}
      <div class="grid grid-cols-2 gap-2"><ShareControls size="sm" /></div>
    </div>
  </aside>
  {/if}

  <main class="flex min-w-0 flex-1 flex-col gap-3 p-3">
    {#if pct() >= 95 && !stopped()}
      <div class="rounded-md border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm">
        {pct()}% of this month's usage budget is used. Watching stops when it runs out.
        {#if isOwner()}<button class="ml-2 underline" onclick={() => openOwner('usage')}>{v === 'A' ? 'See the meter at the foot of the bar' : 'Open usage'}</button>{/if}
      </div>
    {:else if pct() >= 80 && !stopped() && isOwner()}
      <div class="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm">
        {pct()}% of this month's usage budget is used. Only you see this.
        <button class="ml-2 underline" onclick={() => openOwner('usage')}>{v === 'A' ? 'See the meter at the foot of the bar' : 'Open usage'}</button>
      </div>
    {/if}
    <div class="min-h-0 flex-1">
      {#if stopped()}
        <div class="grid h-full place-items-center text-center text-muted-foreground">
          <div>
            <p class="text-lg text-foreground">This month's usage budget is used up.</p>
            <p class="text-sm">{isOwner() ? 'Watching is stopped for everyone until you raise it or the month resets.' : 'The owner can raise it. Shares stay live.'}</p>
            {#if isOwner() && v !== 'A'}<Button class="mt-3" variant="secondary" onclick={() => openOwner('usage')}>Open usage</Button>{/if}
          </div>
        </div>
      {:else if shown.length === 0}
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
    </div>
  </main>

  {#if v === 'C' && admin.panel}<Panel {roomId} />{/if}
</div>
