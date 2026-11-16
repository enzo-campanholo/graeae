<script lang="ts">
  // The two share buttons plus the share dialog and a FAKE browser picker.
  // Prototype rule: one screen share and one webcam share per member at a time.
  import Monitor from '@lucide/svelte/icons/monitor'
  import Video from '@lucide/svelte/icons/video'
  import AppWindow from '@lucide/svelte/icons/app-window'
  import PanelTop from '@lucide/svelte/icons/panel-top'
  import { Button } from '$lib/components/ui/button'
  import { Switch } from '$lib/components/ui/switch'
  import * as Dialog from '$lib/components/ui/dialog'
  import { ME, mine, proto, startShare, stopShare, type Surface } from './state.svelte'

  let { size = 'default', labels = true }: { size?: 'default' | 'sm' | 'lg'; labels?: boolean } = $props()

  let dialog = $state(false)
  let picker = $state(false)
  let audioOn = $state(true)
  let picked = $state<Surface>('window')

  const screen = $derived(mine().find((s) => s.kind === 'screen'))
  const webcam = $derived(mine().find((s) => s.kind === 'webcam'))
  const firefox = $derived(proto.browser === 'firefox')

  const SURFACES: { key: Surface; label: string; what: string; icon: typeof Monitor }[] = [
    { key: 'tab', label: 'Browser tab', what: 'YouTube', icon: PanelTop },
    { key: 'window', label: 'Window', what: 'Hades II', icon: AppWindow },
    { key: 'screen', label: 'Entire screen', what: 'Whole screen', icon: Monitor },
  ]

  function clickScreen() {
    if (screen) return stopShare(screen.id)
    if (proto.flow === 'dialog') dialog = true
    else picker = true
  }
  function clickWebcam() {
    if (webcam) return stopShare(webcam.id)
    startShare({ id: 'me-webcam', memberId: ME, kind: 'webcam', label: 'Webcam', audio: false })
  }
  function confirmPicker() {
    const s = SURFACES.find((x) => x.key === picked)!
    const audio = !firefox && audioOn && picked !== 'screen'
    const notice = firefox
      ? 'Video only from Firefox, and possibly less smooth. A Chromium browser does better.'
      : picked === 'screen'
        ? 'Video only: a whole-screen share carries no audio. Share the game window or a tab to include its sound.'
        : !audioOn
          ? 'Sharing silently.'
          : undefined
    startShare({ id: 'me-screen', memberId: ME, kind: 'screen', label: s.what, surface: picked, audio, notice })
    picker = false
  }
</script>

<Button {size} variant={screen ? 'destructive' : 'default'} onclick={clickScreen}>
  <Monitor />{#if labels}{screen ? 'Stop screen' : 'Share screen'}{/if}
</Button>
<Button {size} variant={webcam ? 'destructive' : 'secondary'} onclick={clickWebcam}>
  <Video />{#if labels}{webcam ? 'Stop webcam' : 'Share webcam'}{/if}
</Button>

<Dialog.Root bind:open={dialog}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Share your screen</Dialog.Title>
      <Dialog.Description>Next, your browser asks what to share: a tab, a window or the whole screen.</Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 text-sm">
      {#if firefox}
        <p class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          From Firefox a screen share is video only and may be less smooth. A Chromium browser does better.
        </p>
      {:else}
        <label class="flex items-center justify-between gap-4 rounded-md border p-3">
          <span>
            <span class="font-medium">Include its audio</span>
            <span class="block text-xs text-muted-foreground">
              A tab's sound, or one application's sound. A whole-screen share is always video only.
            </span>
          </span>
          <Switch bind:checked={audioOn} />
        </label>
      {/if}
      <p class="text-xs text-muted-foreground">Sharing a game? Run it in borderless mode, not exclusive fullscreen.</p>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (dialog = false)}>Cancel</Button>
      <Button onclick={() => { dialog = false; picker = true }}>Choose what to share</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={picker}>
  <Dialog.Content class="border-dashed sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Choose what to share</Dialog.Title>
      <Dialog.Description>FAKE: this stands in for the browser's own picker, which graeae cannot restyle.</Dialog.Description>
    </Dialog.Header>
    <div class="grid grid-cols-3 gap-2">
      {#each SURFACES as s}
        <button
          class="flex flex-col items-center gap-1 rounded-md border p-3 text-xs {picked === s.key ? 'border-primary bg-muted' : ''}"
          onclick={() => (picked = s.key)}
        >
          <s.icon class="size-6" />
          <span class="font-medium">{s.label}</span>
          <span class="text-muted-foreground">{s.what}</span>
        </button>
      {/each}
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (picker = false)}>Cancel</Button>
      <Button onclick={confirmPicker}>Share</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
