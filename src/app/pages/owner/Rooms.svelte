<script lang="ts">
  // The owner page's Rooms section: a form that makes a room beside every room of the
  // instance, each with its fixed address, a way to copy its link and a way to rename it.
  // Rooms are never deleted. A rename reaches everyone in the room at once.
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Pencil from "@lucide/svelte/icons/pencil";
  import { tick } from "svelte";
  import type { CreateRoomAnswer, OwnerRoomsAnswer, RenameRoomAnswer, RoomSummary } from "../../../shared/api.ts";
  import IconButton from "$lib/components/IconButton.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { load, patchJson, postJson, type Load } from "$lib/api.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { copy } from "$lib/clipboard.js";

  let { oncreated }: { oncreated?: () => void } = $props();

  const NAME_MAX = 40;

  let known = $state<Load<OwnerRoomsAnswer>>({ state: "loading" });
  load<OwnerRoomsAnswer>("/api/owner/rooms", (value) => (known = value));
  holdUntil(() => known.state !== "loading");
  const rooms = $derived(known.state === "loaded" ? known.data.rooms : []);

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
    oncreated?.();
  }

  // Renaming one room at a time, in its own row.
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

  // Which copy button last copied, so it can say so for a moment.
  let justCopied = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyLink(room: RoomSummary) {
    if (!(await copy(linkTo(room)))) return;
    justCopied = room.address;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (justCopied = null), 1500);
  }
</script>

{#if known.state === "loading"}
  <div class="grid h-40 place-items-center"><Loading /></div>
{:else if known.state === "loaded"}
  <div class="owner-columns">
    <section class="grid gap-1" aria-label="Every room">
      <h2 class="text-muted-foreground flex h-control-sm items-center justify-between text-xs font-normal">
        <span>Every room</span>
        <span class="text-dim tabular-nums">{rooms.length}</span>
      </h2>
      <ul class="-mx-3 grid gap-0.5">
        {#each rooms as room (room.address)}
          <li
            class={[
              "group flex min-h-list-row items-center gap-3 rounded-md pr-2 pl-3 transition-colors duration-150",
              renaming?.address === room.address ? "bg-raised" : "hover:bg-raised",
            ]}
            aria-label={room.name}
          >
            {#if renaming?.address === room.address}
              <form class="grid flex-1 gap-1.5 py-2" onsubmit={(event) => rename(event, room)} aria-label="Rename {room.name}">
                <div class="flex items-center gap-1.5">
                  <Input
                    bind:ref={renameInput}
                    bind:value={renaming.name}
                    maxlength={NAME_MAX}
                    aria-label="Room name"
                    autocomplete="off"
                    spellcheck={false}
                    class="bg-raised-2 hover:bg-raised-2 flex-1"
                    onkeydown={onRenameKeydown}
                    oninput={() => renaming && (renaming.failed = false)}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    class="bg-raised-2 hover:bg-raised-2"
                    disabled={renaming.name.trim() === "" || renaming.saving}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" onclick={() => (renaming = null)}>Cancel</Button>
                </div>
                {#if renaming.failed}
                  <p class="text-muted-foreground text-xs" role="alert">Not renamed. Check the name, then try again.</p>
                {:else}
                  <p class="text-dim truncate text-xs">The address stays {shown(room)}</p>
                {/if}
              </form>
            {:else}
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="truncate font-medium">{room.name}</span>
                <span class="text-muted-foreground truncate text-xs" aria-label="Address">{shown(room)}</span>
              </span>
              <IconButton
                label={justCopied === room.address ? "Copied" : "Copy link"}
                onclick={() => copyLink(room)}
              >
                {#if justCopied === room.address}<Check />{:else}<Copy />{/if}
              </IconButton>
              <IconButton label="Rename" onclick={() => startRenaming(room)}><Pencil /></IconButton>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <form class="grid gap-5" onsubmit={create} aria-label="New room">
      <label class="grid gap-1.5">
        <span class="text-muted-foreground text-xs">Room name</span>
        <Input
          bind:value={name}
          maxlength={NAME_MAX}
          placeholder="What everyone will call it"
          autocomplete="off"
          spellcheck={false}
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
  </div>
{/if}
