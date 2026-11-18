<script lang="ts">
  // The list of rooms, at the root address for a member with more than one: who is
  // present in each, kept live over the list's own connection. Looking does not make
  // you present anywhere, and how many shares are live in each.
  import { sample } from "$sample";
  import PlainPage from "$lib/components/plain/PlainPage.svelte";
  import { ListClient } from "$lib/list-client.svelte.js";
  import { andList } from "$lib/words.js";
  import { heldBack } from "$lib/hold-back.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { navigate } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  // The page's one connection to the list, for as long as it shows it.
  let client = $state<ListClient | null>(null);

  $effect(() => {
    if (sample) return;
    const opened = new ListClient();
    client = opened;
    return () => opened.close();
  });

  const list = $derived(client?.list ?? null);
  const refused = $derived(client?.refused ?? false);

  // A member with one room has nothing to choose, so they go straight into it.
  $effect(() => {
    if (list?.rooms.length === 1) navigate(`/r/${list.rooms[0]!.address}`, { replace: true });
  });

  const rooms = $derived(
    sample?.rooms ??
      (list && list.rooms.length !== 1 ? list.rooms : null),
  );
  const gear = $derived(!!sample || !!list?.you.owner);

  // A member with one room never sees this page: the move goes on into the room.
  holdUntil(() => !!sample || refused || (list !== null && list.rooms.length !== 1));
</script>

{#if refused}
  <NothingHere />
{:else}
  <PlainPage title="Rooms" {gear}>
    <ul class="-mx-3 grid gap-0.5">
      {#if rooms === null}
        {#each [0, 1, 2] as i (i)}
          <li class="flex h-14 flex-col justify-center gap-2 px-3" aria-hidden="true" {@attach heldBack}>
            <span class="bg-raised h-3 w-28 rounded-sm"></span>
            <span class="bg-raised h-2.5 w-44 rounded-sm opacity-60"></span>
          </li>
        {/each}
      {:else}
        {#each rooms as room (room.address)}
          <li>
            <a
              href="/r/{room.address}"
              class="hover:bg-raised flex h-14 items-center gap-4 rounded-md px-3 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="truncate font-medium">{room.name}</span>
                <span class={["truncate text-xs", room.present.length ? "text-muted-foreground" : "text-dim"]}>
                  {room.present.length ? andList(room.present) : "No one here"}
                </span>
              </span>
              {#if room.live > 0}
                <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {room.live} {room.live === 1 ? "share" : "shares"} live
                </span>
              {/if}
            </a>
          </li>
        {/each}
      {/if}
    </ul>
  </PlainPage>
{/if}
