<script lang="ts">
  // Everything the owner can do to one member: room access, devices, let back in, remove.
  // confirm decides how removal is confirmed:
  //   inline: the consequences replace the button, then Remove / Cancel in place
  //   dialog: a modal that lists the consequences
  //   undo:   no question; a 5 second countdown with Undo, then it happens
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import CopyLink from './CopyLink.svelte'
  import { ME, proto, sharesOf } from './state.svelte'
  import { admin, consequences, createInvite, forgetDevice, grant, has, hereIn, removeFromInstance, removeFromRoom } from './admin.svelte'

  let { id, confirm = 'inline' }: { id: string; confirm?: 'inline' | 'dialog' | 'undo' } = $props()
  const m = $derived(proto.members.find((x) => x.id === id))
  const back = $derived(admin.invites.find((i) => i.back === id))

  let ask = $state<null | { title: string; verb: string; lines: string[]; run: () => void }>(null)
  let left = $state(0)
  let timer: ReturnType<typeof setInterval>
  function request(title: string, verb: string, lines: string[], run: () => void) {
    ask = { title, verb, lines, run }
    if (confirm === 'undo') {
      left = 5
      timer = setInterval(() => { if (--left <= 0) go() }, 1000)
    }
  }
  function go() {
    clearInterval(timer)
    const a = ask
    ask = null
    a?.run()
  }
  function cancel() {
    clearInterval(timer)
    ask = null
  }
  function toggle(e: Event, roomId: string, roomLabel: string) {
    const el = e.currentTarget as HTMLInputElement
    if (el.checked) return grant(id, roomId)
    el.checked = true // stays ticked until the removal is confirmed
    request(`Remove ${m!.name} from ${roomLabel}?`, 'Remove', consequences(id, roomId), () => removeFromRoom(id, roomId))
  }
</script>

{#if m}
  <div class="space-y-4">
    <div>
      <div class="font-medium">{m.name}</div>
      <div class="text-xs text-muted-foreground">
        {hereIn(id, null) ? `Present${sharesOf(id).length ? `, sharing ${sharesOf(id).map((s) => s.kind).join(' and ')}` : ''}` : 'Not here'}
      </div>
    </div>

    <div class="space-y-1">
      <span class="text-xs font-medium text-muted-foreground">Room access</span>
      {#each admin.rooms as r (r.id)}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="accent-primary" checked={has(id, r.id)} disabled={id === ME || !!ask} onchange={(e) => toggle(e, r.id, r.name)} />{r.name}
        </label>
      {/each}
      {#if id === ME}<div class="text-xs text-muted-foreground">The owner is in every room.</div>{/if}
    </div>

    <div class="space-y-1">
      <span class="text-xs font-medium text-muted-foreground">Devices</span>
      {#each admin.devices[id] ?? [] as d (d.id)}
        <div class="flex items-center gap-2 text-sm">
          <span class="min-w-0 flex-1 truncate">{d.browser} · {d.os} <span class="text-xs text-muted-foreground">· {d.last}</span></span>
          <Button size="xs" variant="ghost" onclick={() => forgetDevice(id, d.id)}>Forget</Button>
        </div>
      {:else}
        <div class="text-sm text-muted-foreground">No remembered device.</div>
      {/each}
    </div>

    {#if id !== ME}
      {#if back}
        <div class="space-y-2">
          <div class="text-xs text-muted-foreground">Send this to {m.name}. Using it forgets their other devices. Works once, valid 7 days.</div>
          <CopyLink link={back.link} />
        </div>
      {/if}

      {#if ask && confirm === 'inline'}
        <div class="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div class="font-medium">{ask.title}</div>
          {#each ask.lines as l}<div class="text-xs">{l}</div>{/each}
          <div class="flex gap-2">
            <Button size="sm" variant="destructive" onclick={go}>{ask.verb}</Button>
            <Button size="sm" variant="ghost" onclick={cancel}>Cancel</Button>
          </div>
        </div>
      {:else if ask && confirm === 'undo'}
        <div class="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div class="font-medium">{ask.title.replace('?', '')} in {left}s</div>
          {#each ask.lines as l}<div class="text-xs">{l}</div>{/each}
          <div class="flex gap-2">
            <Button size="sm" onclick={cancel}>Undo</Button>
            <Button size="sm" variant="destructive" onclick={go}>{ask.verb} now</Button>
          </div>
        </div>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#if !back}
            <Button size="sm" variant="outline" title="They lost every device" onclick={() => createInvite(m.name, admin.access[id] ?? [], id)}>Let back in</Button>
          {/if}
          <Button
            size="sm" variant="destructive"
            onclick={() => request(`Remove ${m.name} from graeae?`, 'Remove', consequences(id, null), () => removeFromInstance(id))}
          >Remove from graeae</Button>
        </div>
      {/if}
    {/if}
  </div>

  <Dialog.Root open={!!ask && confirm === 'dialog'} onOpenChange={(o) => { if (!o) cancel() }}>
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>{ask?.title}</Dialog.Title>
        <Dialog.Description>
          {#each ask?.lines ?? [] as l}<span class="block py-0.5">{l}</span>{/each}
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button variant="ghost" onclick={cancel}>Cancel</Button>
        <Button variant="destructive" onclick={go}>{ask?.verb}</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{:else}
  <div class="text-sm text-muted-foreground">Removed.</div>
{/if}
