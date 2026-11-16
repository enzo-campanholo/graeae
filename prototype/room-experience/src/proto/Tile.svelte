<script lang="ts">
  // A share being watched (or my own share, as a self-preview).
  import Maximize from '@lucide/svelte/icons/maximize-2'
  import Minimize from '@lucide/svelte/icons/minimize-2'
  import Volume from '@lucide/svelte/icons/volume-2'
  import Muted from '@lucide/svelte/icons/volume-x'
  import X from '@lucide/svelte/icons/x'
  import Eye from '@lucide/svelte/icons/eye'
  import Headphones from '@lucide/svelte/icons/headphones'
  import Expand from '@lucide/svelte/icons/expand'
  import { Button } from '$lib/components/ui/button'
  import FakeVideo from './FakeVideo.svelte'
  import { ME, proto, title, unwatch, focus, solo, stopShare, watchersOf, type Share } from './state.svelte'

  let { share, class: cls = '', small = false }: { share: Share; class?: string; small?: boolean } =
    $props()
  const w = $derived(proto.watched[share.id])
  const own = $derived(share.memberId === ME)
  const focused = $derived(proto.focused === share.id)
  let el: HTMLDivElement
  // real browser fullscreen; double-click does the same, as on any video player
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen()).catch(() => {})
</script>

<div
  class="group @container relative min-h-0 overflow-hidden rounded-lg border bg-black {cls}"
  style="container-type: size"
  bind:this={el}
  ondblclick={() => !own && fullscreen()}
  role="presentation"
>
  <FakeVideo {share} />

  <div class="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 text-xs">
    <span class="truncate font-medium">{own ? `Your ${share.kind === 'webcam' ? 'webcam' : 'screen'}` : title(share)}</span>
    {#if share.kind === 'screen'}
      {#if share.audio && (own || (w && !w.muted))}
        <span class="flex h-3 items-end gap-px" title="has screen audio">
          {#each [0, 1, 2] as i}
            <span class="w-0.5 bg-emerald-400" style="animation: eq .6s {i * 0.15}s ease-in-out infinite"></span>
          {/each}
        </span>
      {:else if !share.audio}
        <span class="text-white/50">video only</span>
      {/if}
    {/if}
    {#if own}
      <span class="ml-auto flex items-center gap-1 text-white/80">
        <Eye class="size-3" />
        {watchersOf(share).join(', ') || 'nobody watching'}
      </span>
    {/if}
  </div>

  {#if own}
    <div class="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
      <Button size="xs" variant="destructive" onclick={() => stopShare(share.id)}>Stop sharing</Button>
    </div>
  {:else if w}
    <div class="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/70 p-1 opacity-0 transition group-hover:opacity-100">
      {#if share.audio}
        <Button size="icon-xs" variant="ghost" title={w.muted ? 'Unmute' : 'Mute'} onclick={() => (w.muted = !w.muted)}>
          {#if w.muted}<Muted />{:else}<Volume />{/if}
        </Button>
        {#if !small}
          <input type="range" min="0" max="100" bind:value={w.volume} disabled={w.muted} class="w-20 accent-white" title="Volume {w.volume}%" />
        {/if}
        <Button size="icon-xs" variant="ghost" title="Hear only this one" onclick={() => solo(share.id)}><Headphones /></Button>
      {/if}
      <Button size="icon-xs" variant="ghost" title={focused ? 'Back to grid' : 'Focus'} onclick={() => focus(share.id)}>
        {#if focused}<Minimize />{:else}<Maximize />{/if}
      </Button>
      <Button size="icon-xs" variant="ghost" title="Fullscreen (or double-click)" onclick={fullscreen}><Expand /></Button>
      <Button size="icon-xs" variant="ghost" title="Stop watching" onclick={() => unwatch(share.id)}><X /></Button>
    </div>
  {/if}
</div>
