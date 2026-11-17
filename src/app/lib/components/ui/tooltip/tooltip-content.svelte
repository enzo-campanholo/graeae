<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import type { WithoutChildrenOrChild } from "$lib/utils.js";
	import TooltipPortal from "./tooltip-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 6,
		side = "top",
		children,
		portalProps,
		...restProps
	}: TooltipPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
	} = $props();
</script>

<TooltipPortal {...portalProps}>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		{side}
		class={cn(
			"data-open:animate-in data-open:fade-in-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-closed:animate-out data-closed:fade-out-0 bg-popover text-popover-foreground z-50 inline-flex w-fit max-w-xs origin-(--bits-tooltip-content-transform-origin) items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium shadow-[0_4px_16px_-4px_rgb(0_0_0/0.4)] duration-100",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</TooltipPrimitive.Content>
</TooltipPortal>
