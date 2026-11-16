<script lang="ts">
  // Floating prototype switcher. Not part of the design being judged.
  import Left from '@lucide/svelte/icons/chevron-left'
  import Right from '@lucide/svelte/icons/chevron-right'
  import * as Popover from '$lib/components/ui/popover'
  import { ME, VARIANTS, catalog, downlink, member, proto, reopen, toggleFake, watchedShares } from './state.svelte'

  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 200)
    return () => clearInterval(t)
  })
  const idx = $derived(Math.max(0, VARIANTS.findIndex((v) => v.key === proto.variant)))
  const cycle = (d: number) => (proto.variant = VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key)

  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, [contenteditable]')) return
    if (e.key === 'ArrowLeft') cycle(-1)
    if (e.key === "ArrowRight") cycle(1)
    if (e.key === "b") proto.sidebar = !proto.sidebar
  }
  function click(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('[data-proto]')) proto.clicks++
  }
  $effect(() => {
    const u = new URL(location.href)
    u.searchParams.set('variant', proto.variant)
    u.searchParams.set('rooms', String(proto.rooms))
    u.searchParams.set('browser', proto.browser)
    u.searchParams.set('flow', proto.flow)
    try { history.replaceState(null, "", u) } catch {}
  })
  const fmt = (m: null | { clicks: number; secs: number }) => (m ? `${m.clicks} clicks, ${m.secs}s` : 'not yet')
</script>

<svelte:window onkeydown={key} onclickcapture={click} />

<div data-proto class="fixed bottom-16 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border-2 border-yellow-400 bg-yellow-300 px-3 py-1.5 text-xs font-medium text-black shadow-2xl">
  <button onclick={() => cycle(-1)} aria-label="Previous variant"><Left class="size-4" /></button>
  <span class="min-w-36 text-center">{VARIANTS[idx].key} ({VARIANTS[idx].name})</span>
  <button onclick={() => cycle(1)} aria-label="Next variant"><Right class="size-4" /></button>
  <span class="border-l border-black/30 pl-3">
    {proto.clicks} clicks · {Math.round((now - proto.openedAt) / 1000)}s · watching {watchedShares().length} (~{downlink()} Mbps)
  </span>
  <Popover.Root>
    <Popover.Trigger class="rounded-full bg-black px-2 py-0.5 text-yellow-300">Scenario</Popover.Trigger>
    <Popover.Content class="z-[101] w-80 space-y-3 text-xs" data-proto>
      <div>
        <div class="font-semibold">Since the URL was opened</div>
        <div>First watch: {fmt(proto.firstWatch)}</div>
        <div>First share: {fmt(proto.firstShare)}</div>
        <button class="mt-1 underline" onclick={reopen}>Reopen the URL (reset)</button>
        <button class="ml-2 mt-1 underline" onclick={() => (proto.tipsSeen = false)}>Forget first-share tips</button>
      </div>
      <div>
        <div class="font-semibold">Who else is sharing</div>
        {#each Object.entries(catalog) as [id, shares]}
          <div class="flex items-center gap-3 py-0.5">
            <span class="w-10">{member(id).name}</span>
            {#each shares as s}
              <label class="flex items-center gap-1">
                <input type="checkbox" checked={proto.shares.some((x) => x.id === s.id)} onchange={() => toggleFake(s)} />
                {s.kind === 'webcam' ? 'webcam' : s.label}
              </label>
            {/each}
          </div>
        {/each}
      </div>
      <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        <span class="font-semibold">My browser</span>
        <select class="rounded border bg-background p-1" bind:value={proto.browser}>
          <option value="chromium">Chromium</option><option value="firefox">Firefox</option>
        </select>
        <span class="font-semibold">Share flow</span>
        <select class="rounded border bg-background p-1" bind:value={proto.flow}>
          <option value="direct">tips once, then straight to the picker</option>
          <option value="dialog">tips every time</option>
        </select>
        <span class="font-semibold">My rooms</span>
        <select class="rounded border bg-background p-1" bind:value={proto.rooms} onchange={reopen}>
          <option value={1}>1 (land straight in it)</option><option value={3}>3 (room list first)</option>
        </select>
      </div>
      <div class="text-muted-foreground">
        Watched: {JSON.stringify(Object.fromEntries(Object.entries(proto.watched).map(([k, w]) => [k, w.muted ? 'muted' : w.volume])))}
        · focused: {proto.focused ?? 'none'} · mine: {proto.shares.filter((s) => s.memberId === ME).map((s) => `${s.kind}${s.audio ? '+audio' : ''}`).join(', ') || 'none'}
      </div>
    </Popover.Content>
  </Popover.Root>
</div>
