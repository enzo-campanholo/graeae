<script lang="ts">
  // The owner page's Rooms section: every room of the instance, headed by "New room", and
  // beside them the one picked, in the inspector. "New room" is picked as the section
  // opens, so the inspector holds the form; a room just made takes its place.
  //
  // A picked room shows its fixed address, a way to copy its link and a way to rename it,
  // and who has access to it, ticked: access given from the room's side, as People gives
  // it from the member's. A tick grants it at the press; an untick asks in the removal
  // confirm first. Rooms are never deleted. A rename reaches everyone in the room at once.
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Plus from "@lucide/svelte/icons/plus";
  import { tick } from "svelte";
  import type {
    CreateRoomAnswer,
    GrantAnswer,
    MemberEntry,
    OwnerRoomsAnswer,
    PeopleAnswer,
    RenameRoomAnswer,
    RoomSummary,
  } from "../../../shared/api.ts";
  import IconButton from "$lib/components/IconButton.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { getJson, load, patchJson, postJson, type Load } from "$lib/api.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { copy } from "$lib/clipboard.js";
  import Inspector from "./Inspector.svelte";
  import RemovalConfirm from "./RemovalConfirm.svelte";
  import { removalFromRoom } from "./removal.js";

  let { oncreated }: { oncreated?: () => void } = $props();

  const NAME_MAX = 40;

  let known = $state<Load<OwnerRoomsAnswer>>({ state: "loading" });
  load<OwnerRoomsAnswer>("/api/owner/rooms", (value) => (known = value));
  // Everyone, for who has each room and who is in it now.
  let people = $state<Load<PeopleAnswer>>({ state: "loading" });
  load<PeopleAnswer>("/api/owner/people", (value) => (people = value));
  holdUntil(() => known.state !== "loading" && people.state !== "loading");

  const rooms = $derived(known.state === "loaded" ? known.data.rooms : []);
  const everyone = $derived(people.state === "loaded" ? people.data.people : []);

  /** What the inspector shows: "new" for the form, or the address of the room picked. */
  let picked = $state("new");
  const chosen = $derived(rooms.find((room) => room.address === picked) ?? null);

  function pick(address: string) {
    picked = address;
    renaming = null;
  }

  function here(room: RoomSummary): MemberEntry[] {
    return everyone.filter((person) => person.present.includes(room.address));
  }

  function linkTo(room: RoomSummary): string {
    return `${window.location.origin}/r/${room.address}`;
  }

  /** How a room's address is shown: its link without the scheme, which says nothing. */
  function shown(room: RoomSummary): string {
    return `${window.location.host}/r/${room.address}`;
  }

  function replace(room: RoomSummary) {
    if (known.state !== "loaded") return;
    known.data.rooms = known.data.rooms.map((r) => (r.address === room.address ? room : r));
  }

  /**
   * Asks the instance for everyone again: on coming back to the page, before a removal
   * is confirmed, and every 15 seconds while the page is in view, as People does, since
   * who is in each room changes meanwhile.
   */
  async function refresh() {
    const value = await getJson<PeopleAnswer>("/api/owner/people").catch(() => null);
    if (value) people = { state: "loaded", data: value };
  }

  $effect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !ask) void refresh();
    }, 15_000);
    return () => clearInterval(timer);
  });

  function replacePerson(entry: MemberEntry) {
    if (people.state !== "loaded") return;
    people.data.people = people.data.people.map((other) => (other.id === entry.id ? entry : other));
  }

  // A new room.
  let name = $state("");
  let creating = $state(false);
  let createFailed = $state(false);
  const ready = $derived(name.trim() !== "" && !creating);

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!ready) return;
    creating = true;
    createFailed = false;
    const sent = name;
    const answer = await postJson<CreateRoomAnswer>("/api/owner/rooms", { name: sent.trim() }).catch(() => null);
    creating = false;
    if (!answer) {
      createFailed = true;
      return;
    }
    // Whatever was typed while the room was being made stays.
    if (name === sent) name = "";
    if (known.state === "loaded") known.data.rooms = [...known.data.rooms, answer.room];
    picked = answer.room.address;
    // Only the owner has a new room; everyone else's ticks are already right.
    void refresh();
    oncreated?.();
  }

  // Renaming the room picked, in the inspector's header.
  let renaming = $state<{ address: string; name: string; saving: boolean; failed: boolean } | null>(null);
  let renameInput = $state<HTMLInputElement | null>(null);

  async function startRenaming(room: RoomSummary) {
    renaming = { address: room.address, name: room.name, saving: false, failed: false };
    await tick();
    renameInput?.select();
  }

  async function rename(event: SubmitEvent, room: RoomSummary) {
    event.preventDefault();
    if (!renaming || renaming.saving) return;
    const next = renaming.name.trim();
    if (next === room.name) {
      renaming = null;
      return;
    }
    renaming.saving = true;
    renaming.failed = false;
    const answer = await patchJson<RenameRoomAnswer>(
      `/api/owner/rooms/${encodeURIComponent(room.address)}`,
      { name: next },
    ).catch(() => null);
    if (!renaming) return;
    if (!answer) {
      renaming.saving = false;
      renaming.failed = true;
      return;
    }
    replace(answer.room);
    renaming = null;
  }

  function onRenameKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      renaming = null;
    }
  }

  // Which room's link was last copied, so its button can say so for a moment.
  let justCopied = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyLink(room: RoomSummary) {
    if (!(await copy(linkTo(room)))) return;
    justCopied = room.address;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (justCopied = null), 1500);
  }

  // Access. A tick grants at once; an untick asks first and changes nothing until then.
  let granting = $state<string | null>(null);
  let ask = $state<{ member: string; address: string } | null>(null);
  let removing = $state(false);
  const asked = $derived(ask ? (everyone.find((entry) => entry.id === ask!.member) ?? null) : null);
  const confirm = $derived(ask && asked ? removalFromRoom(asked, ask.address, rooms) : null);

  async function setAccess(entry: MemberEntry, address: string, on: boolean) {
    if (entry.owner) return;
    if (!on) {
      ask = { member: entry.id, address };
      void refresh();
      return;
    }
    granting = entry.id;
    const answer = await send<GrantAnswer>("PUT", `/api/owner/people/${entry.id}/rooms/${address}`);
    granting = null;
    if (answer) replacePerson(answer.person);
    else await refresh();
  }

  async function remove() {
    if (!ask || removing) return;
    removing = true;
    const answer = await send<GrantAnswer>("DELETE", `/api/owner/people/${ask.member}/rooms/${ask.address}`);
    if (answer) replacePerson(answer.person);
    else await refresh();
    removing = false;
    ask = null;
  }

  /** Sends a change. What the instance answers, or null when it refused. */
  async function send<T>(method: string, path: string): Promise<T | null> {
    const response = await fetch(path, { method, headers: { Accept: "application/json" } }).catch(() => null);
    if (!response?.ok) return null;
    return (await response.json()) as T;
  }
</script>

<svelte:window onfocus={refresh} />

{#if known.state === "loading" || people.state === "loading"}
  <div class="grid h-40 place-items-center"><Loading /></div>
{:else if known.state === "loaded"}
  <div class="owner-columns">
    <section class="grid gap-1" aria-label="Every room">
      <h2 class="text-muted-foreground flex h-control-sm items-center justify-between text-xs font-normal">
        <span>Every room</span>
        <span class="text-dim tabular-nums">{rooms.length}</span>
      </h2>
      <button
        type="button"
        class={[
          "-mx-3 flex h-row items-center gap-2.5 rounded-md px-3 text-left font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-icon [&_svg]:stroke-[1.75]",
          chosen ? "text-muted-foreground hover:bg-raised hover:text-fg" : "bg-raised text-fg",
        ]}
        aria-current={chosen ? undefined : "true"}
        onclick={() => pick("new")}
      >
        <Plus />New room
      </button>
      <ul class="-mx-3 grid gap-0.5">
        {#each rooms as room (room.address)}
          {@const on = room.address === chosen?.address}
          {@const count = here(room).length}
          <li aria-label={room.name}>
            <button
              type="button"
              class={[
                "flex h-row w-full items-center gap-3 rounded-md px-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-raised" : "hover:bg-raised",
              ]}
              aria-current={on ? "true" : undefined}
              onclick={() => pick(room.address)}
            >
              <span class="min-w-0 flex-1 truncate font-medium">{room.name}</span>
              <span class={["text-xs tabular-nums", count > 0 ? "text-soft" : "text-dim"]}>
                {count > 0 ? `${count} here` : "No one here"}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <Inspector label={chosen ? chosen.name : "New room"}>
      {#if !chosen}
        <form class="grid gap-5" onsubmit={create} aria-label="New room">
          <h2 class="text-base font-medium">New room</h2>
          <label class="grid gap-1.5">
            <span class="text-muted-foreground text-xs">Room name</span>
            <Input
              bind:value={name}
              maxlength={NAME_MAX}
              placeholder="What everyone will call it"
              autocomplete="off"
              spellcheck={false}
              class="bg-raised-2"
              oninput={() => (createFailed = false)}
            />
          </label>
          <div class="grid gap-2">
            <Button type="submit" class="w-fit" disabled={!ready}>Create room</Button>
            {#if createFailed}
              <p class="text-muted-foreground text-xs" role="alert">The room was not made. Check its name, then try again.</p>
            {:else}
              <p class="text-dim text-xs">Only you have access to a new room at first.</p>
            {/if}
          </div>
        </form>
      {:else}
        {@const room = chosen}
        {@const present = here(room)}
        {#if renaming?.address === room.address}
          <form class="grid gap-1.5" onsubmit={(event) => rename(event, room)} aria-label="Rename {room.name}">
            <div class="flex items-center gap-1.5">
              <Input
                bind:ref={renameInput}
                bind:value={renaming.name}
                maxlength={NAME_MAX}
                aria-label="Room name"
                autocomplete="off"
                spellcheck={false}
                class="bg-raised-2 flex-1"
                onkeydown={onRenameKeydown}
                oninput={() => renaming && (renaming.failed = false)}
              />
              <Button
                type="submit"
                variant="secondary"
                class="bg-raised-2"
                disabled={renaming.name.trim() === "" || renaming.saving}
              >
                Save
              </Button>
              <Button variant="ghost" class="hover:bg-raised-2" onclick={() => (renaming = null)}>Cancel</Button>
            </div>
            {#if renaming.failed}
              <p class="text-muted-foreground text-xs" role="alert">Not renamed. Check the name, then try again.</p>
            {:else}
              <p class="text-dim truncate text-xs">The address stays {shown(room)}</p>
            {/if}
          </form>
        {:else}
          <header class="flex items-start gap-1">
            <span class="grid min-w-0 flex-1 gap-0.5">
              <h2 class="truncate text-base font-medium">{room.name}</h2>
              <p class="text-muted-foreground truncate text-xs" aria-label="Address">{shown(room)}</p>
            </span>
            <IconButton
              label={justCopied === room.address ? "Copied" : "Copy link"}
              class="hover:bg-raised-2"
              onclick={() => copyLink(room)}
            >
              {#if justCopied === room.address}<Check />{:else}<Copy />{/if}
            </IconButton>
            <IconButton label="Rename" class="hover:bg-raised-2" onclick={() => startRenaming(room)}><Pencil /></IconButton>
          </header>
        {/if}

        <fieldset class="grid gap-1.5">
          <legend class="text-muted-foreground mb-1.5 text-xs">
            Access{#if present.length > 0}<span class="text-dim"> · {present.length} here now</span>{/if}
          </legend>
          <ul class="-mx-2 grid gap-0.5">
            {#each everyone as entry (entry.id)}
              {@const has = entry.owner || entry.rooms.includes(room.address)}
              <li>
                <label
                  class={[
                    "flex h-row items-center gap-2.5 rounded-md px-2 transition-colors duration-150",
                    entry.owner ? "" : "hover:bg-raised-2 cursor-pointer",
                  ]}
                >
                  <Checkbox
                    bind:checked={() => has, (on) => setAccess(entry, room.address, on)}
                    disabled={entry.owner || granting === entry.id || removing}
                  />
                  <span class="truncate font-medium">{entry.name}</span>
                  {#if entry.present.includes(room.address)}<span class="text-dim ml-auto text-xs">here</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
        </fieldset>
      {/if}
    </Inspector>
  </div>

  <RemovalConfirm
    bind:open={() => ask !== null, (open) => {
      if (!open && !removing) ask = null;
    }}
    title={confirm?.title ?? ""}
    lines={confirm?.lines ?? []}
    {removing}
    onconfirm={remove}
  />
{/if}
