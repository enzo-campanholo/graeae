<script lang="ts">
  // The two share buttons, the first-time tips, and a FAKE browser picker.
  // Rule: one screen share and one webcam share per member at a time.
  import Monitor from '@lucide/svelte/icons/monitor'
  import Video from '@lucide/svelte/icons/video'
  import AppWindow from '@lucide/svelte/icons/app-window'
  import PanelTop from '@lucide/svelte/icons/panel-top'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import { ME, mine, proto, startShare, stopShare, type Surface } from './state.svelte'

  let { size = 'default', labels = true }: { size?: 'default' | 'sm' | 'lg'; labels?: boolean } = $props()

  let tips = $state(false)
  let picker = $state(false)
  let audioOn = $state(true) // the browser picker's own checkbox, pre-ticked by graeae
  let picked = $state<Surface>('window')

  const screen = $derived(mine().find((s) => s.kind === 'screen'))
  const webcam = $derived(mine().find((s) => s.kind === 'webcam'))
  const firefox = $derived(proto.browser === 'firefox')
  const canAudio = $derived(!firefox && picked !== 'screen')

  const SURFACES: { key: Surface; label: string; what: string; icon: typeof Monitor }[] = [
    { key: 'tab', label: 'Browser tab', what: 'YouTube', icon: PanelTop },
    { key: 'window', label: 'Window', what: 'Hades II', icon: AppWindow },
    { key: 'screen', label: 'Entire screen', what: 'Whole screen', icon: Monitor },
  ]

  function clickScreen() {
    if (screen) return stopShare(screen.id)
    // 'dialog' flow shows the tips every time; 'direct' shows them once per device
    if (proto.flow === 'dialog' || !proto.tipsSeen) tips = true
    else picker = true
  }
  function clickWebcam() {
    if (webcam) return stopShare(webcam.id)
    startShare({ id: 'me-webcam', memberId: ME, kind: 'webcam', label: 'Webcam', audio: false })
  }
  function confirmPicker() {
    const s = SURFACES.find((x) => x.key === picked)!
    const audio = canAudio && audioOn
    const notice = firefox
      ? 'Video only from Firefox. A Chromium browser sends audio too.'
      : picked === 'screen'
        ? 'Video only: a whole-screen share carries no audio. Share the game window or a tab to include its sound.'
        : undefined
    startShare({ id: 'me-screen', memberId: ME, kind: 'screen', label: s.what, surface: picked, audio, silenced: canAudio && !audioOn, notice })
    picker = false
  }
</script>

<Button {size} variant={screen ? 'destructive' : 'default'} onclick={clickScreen} title={screen ? 'Stop screen' : 'Share screen'}>
  <Monitor />{#if labels}{screen ? 'Stop screen' : 'Share screen'}{/if}
</Button>
<Button {size} variant={webcam ? 'destructive' : 'secondary'} onclick={clickWebcam} title={webcam ? 'Stop webcam' : 'Share webcam'}>
  <Video />{#if labels}{webcam ? 'Stop webcam' : 'Share webcam'}{/if}
</Button>

<Dialog.Root bind:open={tips}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Before your first screen share</Dialog.Title>
      <Dialog.Description>
        {proto.flow === 'direct' ? 'You will see this once on this device.' : 'Shown every time in this flow.'}
      </Dialog.Description>
    </Dialog.Header>
    <ul class="list-disc space-y-2 pl-5 text-sm">
      {#if firefox}
        <li>From Firefox a screen share is video only and may be less smooth. A Chromium browser does better.</li>
      {:else}
        <li>To send sound, share a <b>tab</b> or the <b>game's window</b> and leave the audio box ticked. A whole-screen share is video only.</li>
      {/if}
      <li>Run games in borderless mode, not exclusive fullscreen.</li>
    </ul>
    <Dialog.Footer>
      <Button onclick={() => { tips = false; proto.tipsSeen = true; picker = true }}>Got it, choose what to share</Button>
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
    <Dialog.Footer class="items-center">
      {#if canAudio}
        <label class="mr-auto flex items-center gap-2 text-xs">
          <input id="picker-audio" type="checkbox" bind:checked={audioOn} />
          Also share {picked === 'tab' ? 'tab' : 'app'} audio
        </label>
      {/if}
      <Button variant="ghost" onclick={() => (picker = false)}>Cancel</Button>
      <Button onclick={confirmPicker}>Share</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
