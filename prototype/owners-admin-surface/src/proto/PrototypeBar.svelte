<script lang="ts">
  // Floating prototype switcher. Not part of the design being judged.
  import Left from '@lucide/svelte/icons/chevron-left'
  import Right from '@lucide/svelte/icons/chevron-right'
  import * as Popover from '$lib/components/ui/popover'
  import { catalog, member, proto, reopen, toggleFake } from './state.svelte'
  import { VARIANTS, acceptInvite, admin } from './admin.svelte'

  const idx = $derived(Math.max(0, VARIANTS.findIndex((v) => v.key === admin.variant)))
  function cycle(d: number) {
    admin.variant = VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key
    admin.page = 'room'
    admin.panel = null
  }
  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, select, [contenteditable]')) return
    if (e.key === 'ArrowLeft') cycle(-1)
    if (e.key === 'ArrowRight') cycle(1)
    if (e.key === 'b') proto.sidebar = !proto.sidebar
  }
  $effect(() => {
    const u = new URL(location.href)
    u.searchParams.set('variant', admin.variant)
    u.searchParams.set('as', admin.role)
    u.searchParams.set('rooms', String(proto.rooms))
    try { history.replaceState(null, '', u) } catch {}
  })
</script>

<svelte:window onkeydown={key} />

<div data-proto class="fixed bottom-3 left-1/2 z-[100] flex max-w-[95vw] -translate-x-1/2 items-center gap-3 rounded-full border-2 border-yellow-400 bg-yellow-300 px-3 py-1.5 text-xs font-medium text-black shadow-2xl">
  <button onclick={() => cycle(-1)} aria-label="Previous variant"><Left class="size-4" /></button>
  <span class="min-w-28 text-center">{VARIANTS[idx].key} ({VARIANTS[idx].name})</span>
  <button onclick={() => cycle(1)} aria-label="Next variant"><Right class="size-4" /></button>
  <select class="rounded-full bg-black px-2 py-0.5 text-yellow-300" bind:value={admin.role} onchange={() => { admin.page = 'room'; admin.panel = null }}>
    <option value="owner">I am the owner</option><option value="member">I am a member</option>
  </select>
  <span class="max-w-80 truncate border-l border-black/30 pl-3" title={admin.log[0]}>{admin.log[0] ?? 'Nothing done yet'}</span>
  <Popover.Root>
    <Popover.Trigger class="rounded-full bg-black px-2 py-0.5 text-yellow-300">Scenario</Popover.Trigger>
    <Popover.Content class="z-[101] max-h-[70vh] w-96 space-y-3 overflow-y-auto text-xs" data-proto>
      <div>
        <div class="font-semibold">Usage so far this month: {admin.usedGB} GB</div>
        <input class="w-full" type="range" min="0" max="1500" step="10" bind:value={admin.usedGB} />
        <div class="flex gap-2">
          {#each [42, 80, 95, 100] as p}
            <button class="underline" onclick={() => (admin.usedGB = Math.round((admin.budgetGB * p) / 100))}>{p}%</button>
          {/each}
        </div>
      </div>
      <div>
        <div class="font-semibold">Pending invites</div>
        {#each admin.invites as i (i.id)}
          <button class="block underline" onclick={() => acceptInvite(i.id)}>{i.name} presses "Join as {i.name}"</button>
        {:else}<div class="text-muted-foreground">none</div>{/each}
      </div>
      <div>
        <div class="font-semibold">Who else is sharing</div>
        {#each Object.entries(catalog).filter(([id]) => proto.members.some((m) => m.id === id)) as [id, shares]}
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
      <div class="flex items-center gap-3">
        <span class="font-semibold">My rooms</span>
        <select class="rounded border bg-background p-1" bind:value={proto.rooms} onchange={reopen}>
          <option value={1}>1 (land straight in it)</option><option value={3}>several (room list first)</option>
        </select>
      </div>
      <div>
        <div class="font-semibold">What happened (newest first)</div>
        {#each admin.log as l}<div class="py-0.5 text-muted-foreground">{l}</div>{:else}<div class="text-muted-foreground">nothing yet</div>{/each}
      </div>
    </Popover.Content>
  </Popover.Root>
</div>
