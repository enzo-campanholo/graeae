<script lang="ts" module>
  export interface RailPerson {
    id: string;
    name: string;
    followed: boolean;
    sharing: boolean;
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

<aside class="flex w-14 shrink-0 flex-col items-center pb-1" aria-label="People">
  <div class="grid h-11 place-items-center">
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
                  "grid size-9 place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  person.followed ? "bg-raised" : "hover:bg-raised",
                ]}
                aria-label="Follow {person.name}"
                aria-pressed={person.followed}
                onclick={() => onfollow?.(person.id)}
              >
                <Avatar
                  name={person.name}
                  size={28}
                  followed={person.followed}
                  sharing={person.sharing}
                  ring={person.followed ? "var(--raised)" : "var(--ground)"}
                />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="right">{person.name}</Tooltip.Content>
        </Tooltip.Root>
      </li>
    {/each}
  </ul>
  {@render foot?.()}
</aside>
