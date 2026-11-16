<script lang="ts">
  // A gap is shown only to the member affected: the notice on my own screen share.
  import { mine } from './state.svelte'
  const n = $derived(mine().find((s) => s.notice)?.notice)
</script>

{#if n}
  <p class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">{n}</p>
{/if}
