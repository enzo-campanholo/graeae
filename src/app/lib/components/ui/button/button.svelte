<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export const buttonVariants = tv({
		base: "focus-visible:ring-ring focus-visible:ring-offset-background rounded-md text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 aria-invalid:ring-2 aria-invalid:ring-destructive [&_svg:not([class*='size-'])]:size-icon [&_svg]:stroke-[1.75] group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				// The one filled button on a surface: near-white on dark, near-black on light.
				default: "bg-primary text-primary-foreground hover:bg-primary/88",
				secondary: "bg-raised text-soft hover:bg-raised-2 hover:text-fg aria-expanded:bg-raised-2",
				ghost: "text-muted-foreground hover:bg-raised hover:text-fg aria-expanded:bg-raised aria-expanded:text-fg",
				// Ending or removing: rests grey like a ghost button and turns red under the pointer.
				destructive: "text-muted-foreground hover:bg-stop/14 hover:text-stop active:bg-stop/22",
				link: "text-fg underline-offset-4 hover:underline",
			},
			size: {
				default: "h-control gap-1.5 px-3",
				xs: "h-control-xs gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-icon-xs",
				sm: "h-control-sm gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-icon-sm",
				lg: "h-control-lg gap-2 px-4",
				icon: "size-control",
				"icon-xs": "size-control-xs [&_svg:not([class*='size-'])]:size-icon-sm",
				"icon-sm": "size-control-sm",
				"icon-lg": "size-control-lg",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
