<script lang="ts">
  // The owner page's People section: every member, one line each with their last visit,
  // and beside them the one picked, in the inspector: their access as one tick per room,
  // their devices with Forget, "Let back in" and "Remove from graeae".
  //
  // Ticking a room grants it at the press. Unticking one, and "Remove from graeae", ask
  // in the removal confirm first; the tick stays until the owner confirms.
  //
  // A removal shows as done at once, while the instance closes what the member was
  // sending and watching. If those closes are still failing a minute later, the list says
  // so beneath it, in amber, for as long as the instance keeps trying.
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import X from "@lucide/svelte/icons/x";
  import type {
    CreateInviteAnswer,
    GrantAnswer,
    MemberDevice,
    MemberEntry,
    PeopleAnswer,
    PendingInvite,
  } from "../../../shared/api.ts";
  import Avatar from "$lib/components/Avatar.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { getJson, load, postJson, type Load } from "$lib/api.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { copy } from "$lib/clipboard.js";
  import { andList, deviceLabel, timeAgo, timeLeft } from "$lib/words.js";
  import Inspector from "./Inspector.svelte";
  import RemovalConfirm from "./RemovalConfirm.svelte";
  import { removalFromInstance, removalFromRoom, roomName } from "./removal.js";

  let known = $state<Load<PeopleAnswer>>({ state: "loading" });
  load<PeopleAnswer>("/api/owner/people", (value) => (known = value));
  holdUntil(() => known.state !== "loading");

  const rooms = $derived(known.state === "loaded" ? known.data.rooms : []);
  const people = $derived(known.state === "loaded" ? known.data.people : []);
  const unconfirmed = $derived(known.state === "loaded" ? known.data.unconfirmed : []);

  let picked = $state<string | null>(null);
  const person = $derived(people.find((entry) => entry.id === picked) ?? null);

  /** What was last done that the list no longer shows, said once beneath it. */
  let note = $state<string | null>(null);

  // Last visits are shown in whole minutes at best. Who is present changes meanwhile, so
  // the list is asked for again on the same beat while the page is in view.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
      if (document.visibilityState === "visible" && !ask) void refresh();
    }, 15_000);
    return () => clearInterval(timer);
  });

  /** Asks the instance for everyone again: on coming back to the page, and before a removal is confirmed. */
  async function refresh() {
    const value = await getJson<PeopleAnswer>("/api/owner/people").catch(() => null);
    if (value) known = { state: "loaded", data: value };
  }

  function onvisibilitychange() {
    if (document.visibilityState === "visible") void refresh();
  }

  function replace(entry: MemberEntry) {
    if (known.state !== "loaded") return;
    known.data.people = known.data.people.map((other) => (other.id === entry.id ? entry : other));
  }

  function lastVisit(entry: MemberEntry): string {
    if (entry.present.length > 0) return "Here now";
    if (entry.lastVisit === null) return "No device";
    return timeAgo(entry.lastVisit, now);
  }

  function presentLine(entry: MemberEntry): string {
    if (entry.present.length === 0) return "Not in any room now";
    return `Present in ${andList(entry.present.map((address) => roomName(rooms, address)))}`;
  }

  // Access. A tick grants at once; an untick asks first and changes nothing until then.
  let granting = $state<string | null>(null);

  async function tick(entry: MemberEntry, address: string, on: boolean) {
    if (entry.owner) return;
    if (!on) {
      ask = { kind: "room", member: entry.id, address };
      void refresh();
      return;
    }
    granting = address;
    const answer = await send<GrantAnswer>("PUT", `/api/owner/people/${entry.id}/rooms/${address}`);
    granting = null;
    if (answer) replace(answer.person);
    else await refresh();
  }

  // Removal, from one room or from the instance, always through the confirm.
  let ask = $state<{ kind: "room"; member: string; address: string } | { kind: "instance"; member: string } | null>(
    null,
  );
  let removing = $state(false);
  const asked = $derived(ask ? (people.find((entry) => entry.id === ask!.member) ?? null) : null);

  const confirm = $derived.by(() => {
    if (!ask || !asked) return null;
    return ask.kind === "room" ? removalFromRoom(asked, ask.address, rooms) : removalFromInstance(asked, rooms);
  });

  function askToRemove(entry: MemberEntry) {
    ask = { kind: "instance", member: entry.id };
    void refresh();
  }

  async function remove() {
    if (!ask || !asked || removing) return;
    removing = true;
    const what = ask;
    const name = asked.name;
    if (what.kind === "room") {
      const answer = await send<GrantAnswer>("DELETE", `/api/owner/people/${what.member}/rooms/${what.address}`);
      if (answer) replace(answer.person);
      else await refresh();
    } else {
      const done = await send("DELETE", `/api/owner/people/${what.member}`);
      if (done !== null && known.state === "loaded") {
        known.data.people = known.data.people.filter((entry) => entry.id !== what.member);
        if (picked === what.member) picked = null;
        note = `${name} is removed from graeae, and their devices are forgotten.`;
      } else await refresh();
    }
    removing = false;
    ask = null;
  }

  // Devices. The owner's own device asks first, since this page becomes "nothing here".
  let confirmingThis = $state(false);
  let forgetting = $state<string | null>(null);

  async function forget(entry: MemberEntry, device: MemberDevice) {
    if (device.current && !confirmingThis) {
      confirmingThis = true;
      return;
    }
    forgetting = device.id;
    const done = await send("DELETE", `/api/owner/people/${entry.id}/devices/${device.id}`);
    forgetting = null;
    confirmingThis = false;
    // This browser is a stranger here now: show what any stranger sees.
    if (device.current && done !== null) window.location.reload();
    else if (done !== null) replace({ ...entry, devices: entry.devices.filter((d) => d.id !== device.id) });
    else await refresh();
  }

  // Let back in: a fresh invite for this member, copied at the press and shown too.
  let inviting = $state(false);
  let inviteFailed = $state(false);
  let copied = $state<{ code: string; done: boolean } | null>(null);
  let justCopied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  function linkTo(invite: PendingInvite): string {
    return `${window.location.origin}/invite/${invite.code}`;
  }

  async function letBackIn(entry: MemberEntry) {
    if (inviting) return;
    inviting = true;
    inviteFailed = false;
    const answer = postJson<CreateInviteAnswer>(`/api/owner/people/${entry.id}/invite`, {});
    // Handed to the clipboard now, while the press still counts.
    const onClipboard = copy(answer.then((value) => (value ? linkTo(value.invite) : Promise.reject(new Error("refused")))));
    const value = await answer.catch(() => null);
    inviting = false;
    if (!value) {
      inviteFailed = true;
      return;
    }
    now = Date.now();
    replace({ ...entry, letBackIn: value.invite });
    copied = { code: value.invite.code, done: await onClipboard };
  }

  async function copyAgain(invite: PendingInvite) {
    if (!(await copy(linkTo(invite)))) return;
    copied = { code: invite.code, done: true };
    justCopied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (justCopied = false), 1500);
  }

  async function cancelInvite(entry: MemberEntry, invite: PendingInvite) {
    await fetch(`/api/owner/invites/${encodeURIComponent(invite.code)}`, { method: "DELETE" }).catch(() => null);
    replace({ ...entry, letBackIn: null });
  }

  function pick(entry: MemberEntry) {
    picked = entry.id;
    note = null;
    confirmingThis = false;
    inviteFailed = false;
  }

  /** Sends a change. What the instance answers (true for an empty answer), or null when it refused. */
  async function send<T = true>(method: string, path: string): Promise<T | null> {
    const response = await fetch(path, { method, headers: { Accept: "application/json" } }).catch(() => null);
    if (!response?.ok) return null;
    return response.status === 204 ? (true as T) : ((await response.json()) as T);
  }
</script>

<svelte:window onfocus={refresh} />
<svelte:document {onvisibilitychange} />

{#if known.state === "loading"}
  <div class="grid h-40 place-items-center"><Loading /></div>
{:else if known.state === "loaded"}
  {@const hereNow = people.filter((entry) => entry.present.length > 0).length}
  <div class="owner-columns">
    <section class="grid gap-1" aria-label="Members">
      <h2 class="text-muted-foreground flex h-control-sm items-center justify-between text-xs font-normal">
        <span>{hereNow} here now</span>
        <span class="text-dim tabular-nums">{people.length}</span>
      </h2>
      <ul class="-mx-3 grid gap-0.5">
        {#each people as entry (entry.id)}
          {@const chosen = entry.id === picked}
          {@const away = entry.present.length === 0}
          <li>
            <button
              type="button"
              class={[
                "flex h-row w-full items-center gap-2.5 rounded-md px-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                chosen ? "bg-raised" : "hover:bg-raised",
              ]}
              aria-current={chosen ? "true" : undefined}
              onclick={() => pick(entry)}
            >
              <Avatar name={entry.name} {away} ring={chosen ? "var(--raised)" : "var(--stage)"} />
              <span class="min-w-0 flex-1 truncate font-medium">
                {entry.name}{#if entry.owner}<span class="text-dim ml-1 font-normal">· owner</span>{/if}
              </span>
              <span class={["text-xs tabular-nums", away ? "text-muted-foreground" : "text-soft"]}>{lastVisit(entry)}</span>
            </button>
          </li>
        {/each}
      </ul>
      <!-- Always there, so a screen reader hears a warning when it appears. -->
      <div class={["grid gap-1", unconfirmed.length > 0 && "pt-2"]} role="status">
        {#each unconfirmed as cutOff (cutOff.member)}
          <p class="text-warn flex items-center gap-2 text-xs">
            <CircleAlert class="size-icon-sm shrink-0" aria-hidden="true" />
            <span>Couldn't confirm that {cutOff.name} was cut off. Still trying.</span>
          </p>
        {/each}
      </div>
      {#if note}
        <p class="text-muted-foreground py-2 text-xs" role="status">{note}</p>
      {:else if people.length === 1}
        <p class="text-dim py-2">Nobody else yet. Invite someone, and they show up here once they press Join.</p>
      {/if}
    </section>

    <Inspector label={person ? person.name : "Member"}>
      {#if !person}
        <div class="grid gap-1">
          <p class="font-medium">{people.length === 1 ? "Only you so far" : `${people.length} members, ${hereNow} here now`}</p>
          <p class="text-muted-foreground text-xs">
            Pick someone to change their rooms, see their devices, let them back in or remove them.
          </p>
        </div>
      {:else}
        {@const entry = person}
        <header class="flex items-center gap-3">
          <Avatar name={entry.name} large away={entry.present.length === 0} ring="var(--raised)" />
          <span class="grid min-w-0 gap-0.5">
            <h2 class="truncate text-base font-medium">{entry.name}</h2>
            <p class="text-muted-foreground truncate text-xs">{entry.owner ? "The owner, with every room" : presentLine(entry)}</p>
          </span>
        </header>

        <fieldset class="grid gap-1.5">
          <legend class="text-muted-foreground mb-1.5 text-xs">Rooms</legend>
          <ul class="-mx-2 grid gap-0.5">
            {#each rooms as room (room.address)}
              {@const has = entry.owner || entry.rooms.includes(room.address)}
              <li>
                <label
                  class={[
                    "flex h-row items-center gap-2.5 rounded-md px-2 transition-colors duration-150",
                    entry.owner ? "" : "hover:bg-raised-2 cursor-pointer",
                  ]}
                >
                  <Checkbox
                    bind:checked={() => has, (on) => tick(entry, room.address, on)}
                    disabled={entry.owner || granting === room.address || removing}
                  />
                  <span class="truncate font-medium">{room.name}</span>
                  {#if entry.present.includes(room.address)}<span class="text-dim ml-auto text-xs">here</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
        </fieldset>

        <section class="grid gap-1.5" aria-label="Devices">
          <h3 class="text-muted-foreground text-xs font-normal">Devices</h3>
          {#if entry.devices.length === 0}
            <p class="text-dim">No device left. "Let back in" gives them a way back.</p>
          {:else}
            <ul class="-mx-2 grid gap-0.5">
              {#each entry.devices as device (device.id)}
                {@const label = deviceLabel(device.browser, device.os)}
                {@const asking = device.current && confirmingThis}
                <li
                  class={[
                    "flex h-item-row items-center gap-3 rounded-md pr-1 pl-2 transition-colors duration-150",
                    asking ? "bg-raised-2" : "hover:bg-raised-2",
                  ]}
                  aria-label={label}
                >
                  <span class="grid min-w-0 flex-1 gap-0.5">
                    <span class="truncate font-medium">{label}</span>
                    <span class="text-muted-foreground truncate text-xs">
                      {#if asking}
                        This page becomes “nothing here”.
                      {:else if device.current}
                        This device
                      {:else}
                        Last used {timeAgo(device.lastUsed, now)}
                      {/if}
                    </span>
                  </span>
                  {#if asking}
                    <Button variant="ghost" size="sm" class="hover:bg-raised" onclick={() => (confirmingThis = false)}>Keep</Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      class="bg-stop/14 text-stop"
                      disabled={forgetting === device.id}
                      onclick={() => forget(entry, device)}
                    >
                      Forget
                    </Button>
                  {:else}
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={forgetting === device.id}
                      onclick={() => forget(entry, device)}
                    >
                      Forget
                    </Button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        {#if !entry.owner}
          {@const invite = entry.letBackIn}
          <div class="border-raised-2 grid gap-4 border-t pt-5">
            {#if invite}
              {@const done = copied?.code === invite.code && copied.done}
              <section class="grid gap-3" aria-label="Let back in" aria-live="polite">
                <div class="grid gap-0.5">
                  <p class="font-medium">{done ? `${entry.name}'s link is on your clipboard` : `${entry.name}'s link is ready`}</p>
                  <p class="text-muted-foreground text-xs">
                    Using it forgets their other devices and keeps their name and rooms. It works once, and expires
                    {timeLeft(invite.expiresAt, now)}.
                  </p>
                </div>
                <p class="bg-raised-2 text-soft rounded-md px-2.5 py-2 text-xs break-all select-all" aria-label="Invite link">
                  {linkTo(invite)}
                </p>
                <div class="flex items-center gap-1.5">
                  <Button variant="secondary" class="bg-raised-2 min-w-28" onclick={() => copyAgain(invite)}>
                    {#if justCopied}<Check />Copied{:else}<Copy />{done ? "Copy again" : "Copy"}{/if}
                  </Button>
                  <IconButton label="Cancel invite" variant="destructive" onclick={() => cancelInvite(entry, invite)}>
                    <X />
                  </IconButton>
                </div>
              </section>
            {/if}

            <div class="grid gap-2">
              <div class="flex flex-wrap gap-1.5">
                <Button variant="secondary" class="bg-raised-2" disabled={inviting} onclick={() => letBackIn(entry)}>
                  <KeyRound />Let back in
                </Button>
                <Button variant="destructive" onclick={() => askToRemove(entry)}>Remove from graeae</Button>
              </div>
              {#if inviteFailed}
                <p class="text-muted-foreground text-xs" role="alert">The invite was not made. Try again.</p>
              {/if}
            </div>
          </div>
        {/if}
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
