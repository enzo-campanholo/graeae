<script lang="ts">
  // What a viewer hears of one watched share with screen audio, in its pill of controls:
  // mute, the volume, and "hear only this one" while another watched share has sound too.
  // In the strip beneath a focused share there is room for mute alone. The speaker shows
  // the volume, and a muted share's speaker and volume go faint, as the sharer's own audio
  // switch does while off.
  import Headphones from "@lucide/svelte/icons/headphones";
  import Volume from "@lucide/svelte/icons/volume";
  import Volume1 from "@lucide/svelte/icons/volume-1";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeOff from "@lucide/svelte/icons/volume-off";
  import IconButton from "../IconButton.svelte";

  let {
    share,
    volume,
    muted,
    only,
    compact = false,
    onvolume,
    onmute,
    ononly,
  }: {
    /** Whose share and what kind, as "Kai's screen". */
    share: string;
    /** From 0 to 100. */
    volume: number;
    muted: boolean;
    /** Whether this is the one share heard; null while no other watched share has sound. */
    only: boolean | null;
    /** In the strip: mute alone, in a smaller button. */
    compact?: boolean;
    onvolume: (volume: number) => void;
    onmute: (muted: boolean) => void;
    ononly: () => void;
  } = $props();

  const size = $derived(compact ? "icon-xs" : "icon-sm");
</script>

<div class="flex items-center">
  <IconButton
    label={muted ? `Unmute ${share}` : `Mute ${share}`}
    {size}
    side="bottom"
    class={muted ? "text-faint" : undefined}
    onclick={() => onmute(!muted)}
  >
    {#if muted}<VolumeOff />{:else if volume === 0}<Volume />{:else if volume < 50}<Volume1 />{:else}<Volume2 />{/if}
  </IconButton>
  {#if !compact}
    <input
      type="range"
      class={["volume mr-1.5 ml-0.5", { muted }]}
      min="0"
      max="100"
      step="5"
      value={volume}
      style:--level="{volume}%"
      aria-label="Volume of {share}"
      aria-valuetext={muted ? `${volume}%, muted` : `${volume}%`}
      oninput={(event) => onvolume(Number(event.currentTarget.value))}
    />
    {#if only !== null}
      <IconButton
        label={only ? "Hear every share again" : `Hear only ${share}`}
        {size}
        side="bottom"
        class={only ? "bg-raised-2 text-fg hover:bg-raised-2" : undefined}
        onclick={ononly}
      >
        <Headphones />
      </IconButton>
    {/if}
  {/if}
</div>

<style>
  /* A 4px pill track on raised-2 filled in soft up to the volume, with a 12px knob, in a
     28px-high target. Muted, the fill and the knob go faint. */
  .volume {
    --fill: var(--soft);
    --knob: var(--fg);
    appearance: none;
    width: 64px;
    height: 28px;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
  }
  /* On a small picture the pill would outgrow it: the volume shortens. */
  @container (width < 400px) {
    .volume {
      width: 40px;
    }
  }
  .volume.muted {
    --fill: var(--faint);
    --knob: var(--faint);
  }
  .volume::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 9999px;
    background: linear-gradient(to right, var(--fill) var(--level), var(--raised-2) var(--level));
  }
  .volume::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border-radius: 9999px;
    background: var(--knob);
    transition: transform 150ms var(--ease-out);
  }
  .volume:hover::-webkit-slider-thumb,
  .volume:active::-webkit-slider-thumb {
    transform: scale(1.17);
  }
  .volume::-moz-range-track {
    height: 4px;
    border-radius: 9999px;
    background: var(--raised-2);
  }
  .volume::-moz-range-progress {
    height: 4px;
    border-radius: 9999px;
    background: var(--fill);
  }
  .volume::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 9999px;
    background: var(--knob);
  }
  @media (prefers-reduced-motion: reduce) {
    .volume::-webkit-slider-thumb {
      transition: none;
    }
  }
</style>
