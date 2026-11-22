<script lang="ts">
  // An icon-only button or link, named by a tooltip and for screen readers alike.
  import type { Snippet } from "svelte";
  import { Button, type ButtonSize, type ButtonVariant } from "$lib/components/ui/button/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";

  let {
    label,
    key,
    href,
    onclick,
    variant = "ghost",
    size = "icon-sm",
    side = "bottom",
    pressed,
    disabled = false,
    class: className,
    children,
  }: {
    label: string;
    /** The keyboard shortcut, shown in the tooltip and announced. */
    key?: string;
    href?: string;
    onclick?: (event: MouseEvent) => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    side?: "top" | "right" | "bottom" | "left";
    pressed?: boolean;
    disabled?: boolean;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        {href}
        {onclick}
        {variant}
        {size}
        class={className}
        aria-label={label}
        aria-keyshortcuts={key}
        aria-pressed={pressed}
        {disabled}
      >
        {@render children()}
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content {side}>
    {label}
    {#if key}<Kbd>{key}</Kbd>{/if}
  </Tooltip.Content>
</Tooltip.Root>
