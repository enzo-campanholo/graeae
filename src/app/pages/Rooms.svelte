<script lang="ts">
  // The list of rooms, at the root address for a member with more than one: who is
  // present in each and how many shares are live. Looking does not make you present.
  import { sample } from "$sample";
  import PlainPage from "$lib/components/plain/PlainPage.svelte";
  import { load, type Load } from "$lib/api.js";
  import type { RoomsAnswer } from "../../shared/api.ts";
  import { navigate } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  let known = $state<Load<RoomsAnswer>>({ state: "loading" });

  if (!sample) {
    load<RoomsAnswer>("/api/rooms", (value) => {
      // A member with one room has nothing to choose, so they go straight into it.
      if (value.state === "loaded" && value.data.rooms.length === 1) {
        navigate(`/r/${value.data.rooms[0]!.address}`, { replace: true });
      } else {
        known = value;
      }
    });
  }

  // Who is present and what is live in each room arrive with the list of rooms' own ticket.
  const rooms = $derived(
    sample?.rooms ??
      (known.state === "loaded" ? known.data.rooms.map((room) => ({ ...room, present: [], live: 0 })) : null),
  );
  const gear = $derived(!!sample || (known.state === "loaded" && known.data.me.owner));
</script>

{#if known.state === "refused"}
  <NothingHere />
{:else}
  <PlainPage title="Rooms" {gear}>
    <ul class="-mx-3 grid gap-0.5">
      {#if rooms === null}
        {#each [0, 1, 2] as i (i)}
          <li class="flex h-14 flex-col justify-center gap-2 px-3" aria-hidden="true">
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
                  {room.present.length ? room.present.join(", ") : "No one here"}
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
