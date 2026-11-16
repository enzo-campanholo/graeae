<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Copy from '@lucide/svelte/icons/copy'
  import { Button } from '$lib/components/ui/button'
  import { copy, field } from './admin.svelte'
  let { link, text, label = 'Copy link' }: { link: string; text?: string; label?: string } = $props()
  let done = $state(false)
  function go() {
    copy(text ?? link)
    done = true
    setTimeout(() => (done = false), 1500)
  }
</script>

<div class="flex gap-2">
  <input class="{field} min-w-0 flex-1 font-mono text-xs" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
  <Button size="sm" variant={done ? 'secondary' : 'default'} onclick={go}>
    {#if done}<Check />Copied{:else}<Copy />{label}{/if}
  </Button>
</div>
