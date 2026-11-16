<script lang="ts">
  // A member's own screens: display name, devices, "Add a device". Same for the owner and every member.
  import { Button } from '$lib/components/ui/button'
  import CopyLink from './CopyLink.svelte'
  import { ME } from './state.svelte'
  import { addDevice, admin, field, forgetDevice } from './admin.svelte'
</script>

<div class="space-y-4">
  <label class="block space-y-1">
    <span class="text-xs font-medium text-muted-foreground">Your display name</span>
    <input class={field} bind:value={admin.myName} />
  </label>
  <div class="space-y-1">
    <span class="text-xs font-medium text-muted-foreground">Your devices</span>
    {#each admin.devices[ME] as d (d.id)}
      <div class="flex items-center gap-2 text-sm">
        <span class="min-w-0 flex-1">
          <span class="block truncate">{d.browser} · {d.os}</span>
          <span class="block text-xs text-muted-foreground">{d.current ? 'this device' : `last used ${d.last}`}</span>
        </span>
        {#if !d.current}<Button size="xs" variant="ghost" onclick={() => forgetDevice(ME, d.id)}>Forget</Button>{/if}
      </div>
    {/each}
  </div>
  {#if admin.deviceInvite}
    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">Open this on the new device. It works once and is valid for 10 minutes.</div>
      <CopyLink link={admin.deviceInvite} />
      <Button size="xs" variant="ghost" onclick={() => (admin.deviceInvite = null)}>Done</Button>
    </div>
  {:else}
    <Button size="sm" variant="outline" onclick={addDevice}>Add a device</Button>
  {/if}
</div>
