<script lang="ts">
  // The owner page's Invites section: the invites nobody has used yet, headed by "New
  // invite", and beside them the one picked, in the inspector. "New invite" is picked as
  // the section opens, so the inspector holds the form, which makes an invite and copies
  // its link at the press; the new invite then takes the form's place, with its link.
  // A picked invite shows its link to copy, and a way to cancel it. There is no
  // ready-made message; the owner pastes the link and says what they like.
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Plus from "@lucide/svelte/icons/plus";
  import type { CreateInviteAnswer, InvitesAnswer, PendingInvite } from "../../../shared/api.ts";
  import Loading from "$lib/components/Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { load, postJson, type Load } from "$lib/api.js";
  import { copy } from "$lib/clipboard.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { andList, timeLeft, timeRemaining } from "$lib/words.js";
  import Inspector from "./Inspector.svelte";

  const NAME_MAX = 40;

  let known = $state<Load<InvitesAnswer>>({ state: "loading" });
  load<InvitesAnswer>("/api/owner/invites", (value) => {
    known = value;
    // New members get the first room unless the owner ticks otherwise.
    if (value.state === "loaded") ticked = value.data.rooms.slice(0, 1).map((room) => room.address);
  });

  holdUntil(() => known.state !== "loading");

  const rooms = $derived(known.state === "loaded" ? known.data.rooms : []);
  const invites = $derived(known.state === "loaded" ? known.data.invites : []);

  let name = $state("");
  let ticked = $state<string[]>([]);
  let creating = $state(false);
  let failed = $state(false);
  /** The invite just made, and whether its link reached the clipboard. */
  let made = $state<{ invite: PendingInvite; copied: boolean } | null>(null);
  /** What the inspector shows: "new" for the form, or the code of the invite picked. */
  let picked = $state("new");

  const ready = $derived(name.trim() !== "" && ticked.length > 0 && !creating);

  // Expiry is shown in whole units, so the clock only needs to move once a minute.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  function linkTo(invite: PendingInvite): string {
    return `${window.location.origin}/invite/${invite.code}`;
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!ready) return;
    creating = true;
    failed = false;
    const sent = name;
    const answer = postJson<CreateInviteAnswer>("/api/owner/invites", { name: sent.trim(), rooms: ticked });
    // The link is handed to the clipboard now, while the press still counts, and
    // arrives there once the instance has made the invite.
    const copied = copy(
      answer.then((value) => (value ? linkTo(value.invite) : Promise.reject(new Error("refused")))),
    );
    const value = await answer.catch(() => null);
    creating = false;
    if (!value) {
      failed = true;
      return;
    }
    made = { invite: value.invite, copied: await copied };
    picked = value.invite.code;
    // Whatever was typed while the invite was being made stays.
    if (name === sent) name = "";
    if (known.state === "loaded") known.data.invites = [value.invite, ...known.data.invites];
  }

  function toggle(address: string, on: boolean) {
    ticked = on
      ? rooms.filter((room) => room.address === address || ticked.includes(room.address)).map((room) => room.address)
      : ticked.filter((value) => value !== address);
  }

  async function cancel(invite: PendingInvite) {
    await fetch(`/api/owner/invites/${encodeURIComponent(invite.code)}`, { method: "DELETE" }).catch(() => null);
    // Gone either way: cancelled now, or used or expired since the list was loaded.
    if (known.state === "loaded") known.data.invites = known.data.invites.filter((i) => i.code !== invite.code);
    if (made?.invite.code === invite.code) made = null;
    if (picked === invite.code) picked = "new";
  }

  // Which copy button last copied, so it can say so for a moment.
  let justCopied = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyAgain(invite: PendingInvite) {
    if (!(await copy(linkTo(invite)))) return;
    if (made?.invite.code === invite.code) made.copied = true;
    justCopied = invite.code;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (justCopied = null), 1500);
  }
</script>

{#if known.state === "loading"}
  <div class="grid h-40 place-items-center"><Loading /></div>
{:else if known.state === "loaded"}
  {@const chosen = invites.find((invite) => invite.code === picked) ?? null}
  <div class="owner-columns">
    <section class="grid gap-1" aria-label="Pending invites">
      <h2 class="text-muted-foreground flex h-control-sm items-center justify-between text-xs font-normal">
        <span>Not used yet</span>
        <span class="text-dim tabular-nums">{invites.length}</span>
      </h2>
      <button
        type="button"
        class={[
          "-mx-3 flex h-row items-center gap-2.5 rounded-md px-3 text-left font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-icon [&_svg]:stroke-[1.75]",
          chosen ? "text-muted-foreground hover:bg-raised hover:text-fg" : "bg-raised text-fg",
        ]}
        aria-current={chosen ? undefined : "true"}
        onclick={() => (picked = "new")}
      >
        <Plus />New invite
      </button>
      {#if invites.length === 0}
        <p class="text-dim py-2">No unused invites. Someone you invite appears in People once they press Join.</p>
      {:else}
        <ul class="-mx-3 grid gap-0.5">
          {#each invites as invite (invite.code)}
            {@const on = invite.code === chosen?.code}
            <li aria-label={invite.name}>
              <button
                type="button"
                class={[
                  "flex h-row w-full items-center gap-3 rounded-md px-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-raised" : "hover:bg-raised",
                ]}
                aria-current={on ? "true" : undefined}
                onclick={() => (picked = invite.code)}
              >
                <span class="min-w-0 flex-1 truncate">
                  <span class="font-medium">{invite.name}</span>
                  <span class="text-muted-foreground ml-2 text-xs">{andList(invite.rooms.map((room) => room.name))}</span>
                </span>
                <span class="text-muted-foreground text-xs tabular-nums">{timeRemaining(invite.expiresAt, now)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <Inspector label={chosen ? chosen.name : "New invite"}>
      {#if !chosen}
        <form class="grid gap-5" onsubmit={create} aria-label="New invite">
          <h2 class="text-base font-medium">New invite</h2>
          <label class="grid gap-1.5">
            <span class="text-muted-foreground text-xs">Display name</span>
            <Input
              bind:value={name}
              maxlength={NAME_MAX}
              placeholder="The name everyone will see"
              autocomplete="off"
              spellcheck={false}
              class="bg-raised-2"
              oninput={() => (failed = false)}
            />
          </label>

          <fieldset class="grid gap-1.5">
            <legend class="text-muted-foreground mb-1.5 text-xs">Rooms</legend>
            <ul class="-mx-2 grid gap-0.5">
              {#each rooms as room (room.address)}
                <li>
                  <label class="hover:bg-raised-2 flex h-row cursor-pointer items-center gap-2.5 rounded-md px-2 transition-colors duration-150">
                    <Checkbox
                      checked={ticked.includes(room.address)}
                      onCheckedChange={(on) => toggle(room.address, on)}
                    />
                    <span class="truncate font-medium">{room.name}</span>
                  </label>
                </li>
              {/each}
            </ul>
          </fieldset>

          <div class="grid gap-2">
            <Button type="submit" class="w-fit" disabled={!ready}><Copy />Create and copy link</Button>
            {#if failed}
              <p class="text-muted-foreground text-xs" role="alert">
                Couldn't make the invite. Check the name and rooms, then try again.
              </p>
            {/if}
          </div>
        </form>
      {:else}
        {@const fresh = made?.invite.code === chosen.code}
        {@const copied = fresh && !!made?.copied}
        <header class="grid gap-0.5" aria-live="polite">
          <h2 class="text-base font-medium">{chosen.name}</h2>
          <p class="text-muted-foreground text-xs">
            {#if copied}
              {chosen.name}'s link is on your clipboard. Send it to them.
            {:else if fresh}
              {chosen.name}'s link is ready. Copy it and send it to them.
            {:else}
              Nobody has used this invite yet.
            {/if}
            It works once and expires {timeLeft(chosen.expiresAt, now)}.
          </p>
        </header>
        <!-- The whole link, wrapped, so the owner can see it is the one they sent. -->
        <p class="bg-raised-2 text-soft rounded-md px-2.5 py-2 text-xs break-all select-all" aria-label="Invite link">
          {linkTo(chosen)}
        </p>
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-xs">Rooms</span>
          <p class="font-medium">{andList(chosen.rooms.map((room) => room.name))}</p>
        </div>
        <div class="border-raised-2 flex flex-wrap gap-1.5 border-t pt-5">
          <Button variant="secondary" class="bg-raised-2 min-w-28" onclick={() => copyAgain(chosen)}>
            {#if justCopied === chosen.code}<Check />Copied{:else}<Copy />{copied ? "Copy again" : "Copy link"}{/if}
          </Button>
          <Button variant="destructive" onclick={() => cancel(chosen)}>Cancel invite</Button>
        </div>
      {/if}
    </Inspector>
  </div>
{/if}
