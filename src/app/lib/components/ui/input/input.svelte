<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList | null } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"bg-input text-fg h-8 w-full min-w-0 rounded-md px-2.5 text-sm transition-colors duration-150 outline-none placeholder:text-dim hover:bg-raised-2 focus-visible:bg-raised-2 focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-destructive disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"bg-input text-fg h-8 w-full min-w-0 rounded-md px-2.5 text-sm transition-colors duration-150 outline-none placeholder:text-dim hover:bg-raised-2 focus-visible:bg-raised-2 focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-destructive disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
