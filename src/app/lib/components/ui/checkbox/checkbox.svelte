<script lang="ts">
	// A tick: a raised box that fills with the foreground and shows a check when ticked.
	import { Checkbox as CheckboxPrimitive } from "bits-ui";
	import Check from "@lucide/svelte/icons/check";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	bind:checked
	data-slot="checkbox"
	class={cn(
		"bg-raised-2 data-[state=checked]:bg-fg data-[state=checked]:text-ground focus-visible:ring-ring focus-visible:ring-offset-stage grid size-4 shrink-0 place-items-center rounded-[4px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		{#if checked}<Check class="size-3 stroke-[2.5]" aria-hidden="true" />{/if}
	{/snippet}
</CheckboxPrimitive.Root>
