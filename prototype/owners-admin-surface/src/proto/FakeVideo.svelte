<script lang="ts">
  import { member, type Share } from './state.svelte'
  let { share, paused = false }: { share: Share; paused?: boolean } = $props()
  const m = $derived(member(share.memberId))
  const hue = $derived(m.hue + (share.kind === 'webcam' ? 30 : 0))
</script>

<div
  class="absolute inset-0 overflow-hidden"
  style="background: repeating-linear-gradient(45deg, hsl({hue} 45% 22%) 0 40px, hsl({hue} 45% 17%) 40px 80px); animation: drift 2s linear infinite; animation-play-state: {paused
    ? 'paused'
    : 'running'}; filter: {paused ? 'grayscale(1) brightness(.5)' : 'none'}"
>
  {#if share.kind === 'webcam'}
    <div class="absolute inset-0 grid place-items-center">
      <div
        class="grid aspect-square h-1/2 place-items-center rounded-full text-[min(8cqw,4rem)] font-semibold"
        style="background: hsl({hue} 50% 40%)"
      >
        {m.name[0]}
      </div>
    </div>
  {:else if !paused}
    <div
      class="absolute inset-y-0 w-1/4 bg-white/10"
      style="animation: sweep 1.6s linear infinite"
    ></div>
    <div class="absolute inset-0 grid place-items-center text-[min(6cqw,3rem)] font-bold text-white/25">
      {share.label}
    </div>
  {/if}
</div>
