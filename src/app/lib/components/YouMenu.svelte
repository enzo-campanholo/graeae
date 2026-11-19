<script lang="ts">
  // Your own avatar as a menu: your name, the way to "You", and the appearance, the one
  // "You" setting worth having in reach without leaving the page. It sits in the bar's
  // header, at the rail's foot and on the list of rooms, the same for the owner and a
  // member; the owner's gear stays beside it, so the owner page is still one click.
  import Check from "@lucide/svelte/icons/check";
  import UserRound from "@lucide/svelte/icons/user-round";
  import { DropdownMenu } from "bits-ui";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { theme, themes, type Theme } from "$lib/theme.svelte.js";
  import Avatar from "./Avatar.svelte";

  let {
    name,
    owner = false,
    side = "bottom",
    large = false,
    newTab = false,
  }: {
    /** Your display name, or null while it is still loading: then a plain person icon. */
    name: string | null;
    owner?: boolean;
    /** Where the menu and the tooltip open: under the header, or beside the rail. */
    side?: "bottom" | "right";
    /** The rail's size. */
    large?: boolean;
    /** From a room, "You" opens in a new tab, so the room, its shares and its watching carry on. */
    newTab?: boolean;
  } = $props();

  const itemClass =
    "text-soft data-highlighted:bg-raised-2 data-highlighted:text-fg flex h-control-sm cursor-default items-center gap-2.5 rounded-md px-2 text-sm outline-none select-none [&_svg]:size-icon-sm [&_svg]:shrink-0";
</script>

<DropdownMenu.Root>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <DropdownMenu.Trigger
          {...props}
          class={[
            "hover:bg-raised data-[state=open]:bg-raised grid place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            large ? "size-control-lg" : "size-control-sm",
          ]}
          aria-label="You"
        >
          {#if name === null}<UserRound class="size-icon-sm" />{:else}<Avatar {name} {large} />{/if}
        </DropdownMenu.Trigger>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content {side}>You</Tooltip.Content>
  </Tooltip.Root>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      {side}
      align="end"
      sideOffset={6}
      class="bg-raised text-fg shadow-lift z-50 grid w-56 gap-0.5 rounded-xl p-1"
    >
      <div class="flex items-center gap-2.5 p-2">
        {#if name !== null}<Avatar {name} ring="var(--raised)" />{/if}
        <span class="grid min-w-0">
          <span class="text-fg truncate text-sm font-medium">{name ?? "You"}</span>
          <span class="text-dim text-xs">{owner ? "Owner" : "Member"}</span>
        </span>
      </div>
      <DropdownMenu.Item class={itemClass}>
        {#snippet child({ props })}
          <a {...props} href="/you" target={newTab ? "_blank" : undefined}><UserRound />You</a>
        {/snippet}
      </DropdownMenu.Item>
      <DropdownMenu.Separator class="bg-raised-2 m-1 h-px" />
      <DropdownMenu.RadioGroup value={theme.current} onValueChange={(value) => theme.set(value as Theme)}>
        <DropdownMenu.GroupHeading class="text-dim px-2 pt-1 pb-0.5 text-xs font-medium">Appearance</DropdownMenu.GroupHeading>
        {#each themes as choice (choice.value)}
          <DropdownMenu.RadioItem value={choice.value} class={itemClass} closeOnSelect={false}>
            {#snippet children({ checked })}
              <span class="grid size-icon-sm place-items-center">{#if checked}<Check />{/if}</span>
              {choice.label}
            {/snippet}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
