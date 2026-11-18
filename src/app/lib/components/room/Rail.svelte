<script lang="ts" module>
  export interface RailPerson {
    id: string;
    name: string;
    followed: boolean;
    sharing: boolean;
    /** Present, but the room has not heard from them for about 10 seconds. */
    reconnecting: boolean;
  }
</script>

<script lang="ts">
  // The bar folded into a thin rail: the present members' initials, still one click to
  // follow someone, and the share buttons at the foot.
  import PanelLeftOpen from "@lucide/svelte/icons/panel-left-open";
  import type { Snippet } from "svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Avatar from "../Avatar.svelte";
  import IconButton from "../IconButton.svelte";


  let {
    people,
    onexpand,
    onfollow,
    foot,
  }: {
    /** Present members other than you. */
    people: readonly RailPerson[];
    onexpand: () => void;
    onfollow?: (id: string) => void;
    foot?: Snippet;
  } = $props();
</script>

<aside class="relative flex w-rail shrink-0 flex-col items-center pb-1" aria-label="People">
  <div class="grid h-header place-items-center">
    <IconButton label="Show the bar" key="[" side="right" onclick={onexpand}><PanelLeftOpen /></IconButton>
  </div>
  <ul class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pt-3">
    {#each people as person (person.id)}
      <li>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class={[
                  "grid size-control-lg place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  person.followed ? "bg-raised" : "hover:bg-raised",
                ]}
                aria-label={person.reconnecting ? `Follow ${person.name}, reconnecting` : `Follow ${person.name}`}
                aria-pressed={person.followed}
                onclick={() => onfollow?.(person.id)}
              >
                <Avatar
                  name={person.name}
                  large
                  followed={person.followed}
                  sharing={person.sharing}
                  reconnecting={person.reconnecting}
                  ring={person.followed ? "var(--raised)" : "var(--ground)"}
                />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="right">
            {person.name}{#if person.reconnecting}<span class="text-muted-foreground"> · reconnecting</span>{/if}
          </Tooltip.Content>
        </Tooltip.Root>
      </li>
    {/each}
  </ul>
  {@render foot?.()}
</aside>
