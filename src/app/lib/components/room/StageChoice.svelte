<script lang="ts">
  // A large choice on the empty stage: a raised card with a 28px icon over its label, or,
  // for a live share, the sharer's avatar and the share's icon over the name and kind. A
  // keyed choice names its key in its tooltip, as the bar's buttons do, never inside.
  import type { Component } from "svelte";
  import type { ShareKind } from "$lib/share.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Avatar from "../Avatar.svelte";

  let {
    label,
    icon: Icon,
    who,
    kind,
    key,
    name,
    disabled = false,
    onclick,
  }: {
    /** What it says: an action, or for a share its sharer's name. */
    label: string;
    icon: Component;
    /** A live share's sharer, whose avatar leads the icon. */
    who?: string;
    /** A live share's kind, in dim under the name. */
    kind?: ShareKind;
    /** The keyboard shortcut, shown in the tooltip and announced. */
    key?: string;
    /** The accessible name, where the label alone does not say what it does. */
    name?: string;
    disabled?: boolean;
    onclick?: () => void;
  } = $props();
</script>

{#snippet choice(props: Record<string, unknown> = {})}
  <button {...props} type="button" class="choice" {disabled} aria-label={name} aria-keyshortcuts={key} {onclick}>
    {#if who}
      <span class="flex items-center gap-2"><Avatar name={who} ring="var(--raised)" /><Icon class="size-icon" /></span>
    {:else}
      <Icon class="size-7" />
    {/if}
    <span class="grid gap-0.5">
      <span class="font-medium">{label}</span>
      {#if kind}<span class="text-dim text-xs">{kind}</span>{/if}
    </span>
  </button>
{/snippet}

{#if key}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}{@render choice(props)}{/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="bottom">{label} <Kbd>{key}</Kbd></Tooltip.Content>
  </Tooltip.Root>
{:else}
  {@render choice()}
{/if}

<style>
  .choice {
    display: grid;
    width: var(--choice);
    height: var(--choice-h);
    place-content: center;
    justify-items: center;
    gap: 12px;
    border-radius: 8px;
    background: var(--raised);
    color: var(--soft);
    text-align: center;
    transition:
      background-color 150ms,
      color 150ms;
  }
  .choice :global(svg) {
    stroke-width: 1.75;
  }
  .choice:hover:not(:disabled) {
    background: var(--raised-2);
    color: var(--fg);
  }
  /* The avatar is raised-2 too, so under the pointer it steps back to raised to stay a circle. */
  .choice:hover:not(:disabled) :global(.avatar) {
    background: var(--raised);
  }
  /* Live, a choice to share rests as "Webcam live" does in the bar: a state, not dimmed. */
  .choice:disabled {
    color: var(--muted-text);
  }
  .choice:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
</style>
