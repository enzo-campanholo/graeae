<script lang="ts">
  // The owner page's Invites section: a form that makes an invite and copies its link at
  // the press, beside the invites nobody has used yet, each with copy and cancel. There
  // is no ready-made message; the owner pastes the link and says what they like.
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import X from "@lucide/svelte/icons/x";
  import type { CreateInviteAnswer, InvitesAnswer, PendingInvite } from "../../../shared/api.ts";
  import IconButton from "$lib/components/IconButton.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { load, postJson, type Load } from "$lib/api.js";
  import { copy } from "$lib/clipboard.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { andList, timeLeft } from "$lib/words.js";

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
  <div class="owner-columns">
    <section class="grid gap-1" aria-label="Pending invites">
      <h2 class="text-muted-foreground flex h-control-sm items-center justify-between text-xs font-normal">
        <span>Waiting to be used</span>
        <span class="text-dim tabular-nums">{invites.length}</span>
      </h2>
      {#if invites.length === 0}
        <p class="text-dim py-2">
          No invites waiting. Someone you invite shows up nowhere until they press Join.
        </p>
      {:else}
        <ul class="-mx-3 grid gap-0.5">
          {#each invites as invite (invite.code)}
            <li
              class="hover:bg-raised group flex h-item-row items-center gap-3 rounded-md pr-2 pl-3 transition-colors duration-150"
              aria-label={invite.name}
            >
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="truncate font-medium">{invite.name}</span>
                <span class="text-muted-foreground truncate text-xs">
                  {andList(invite.rooms.map((room) => room.name))} · expires {timeLeft(invite.expiresAt, now)}
                </span>
              </span>
              <IconButton label={justCopied === invite.code ? "Copied" : "Copy link"} onclick={() => copyAgain(invite)}>
                {#if justCopied === invite.code}<Check />{:else}<Copy />{/if}
              </IconButton>
              <IconButton label="Cancel invite" variant="destructive" onclick={() => cancel(invite)}>
                <X />
              </IconButton>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <div class="grid gap-6">
      <form class="grid gap-5" onsubmit={create} aria-label="New invite">
        <label class="grid gap-1.5">
          <span class="text-muted-foreground text-xs">Display name</span>
          <Input
            bind:value={name}
            maxlength={NAME_MAX}
            placeholder="The name everyone will see"
            autocomplete="off"
            spellcheck={false}
            oninput={() => (failed = false)}
          />
        </label>

        <fieldset class="grid gap-1.5">
          <legend class="text-muted-foreground mb-1.5 text-xs">Rooms</legend>
          <ul class="-mx-2 grid gap-0.5">
            {#each rooms as room (room.address)}
              <li>
                <label
                  class="hover:bg-raised flex h-row cursor-pointer items-center gap-2.5 rounded-md px-2 transition-colors duration-150"
                >
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
          <Button type="submit" class="w-fit" disabled={!ready}>
            <Copy />Create and copy link
          </Button>
          {#if failed}
            <p class="text-muted-foreground text-xs" role="alert">
              The invite was not made. Check the name and rooms, then try again.
            </p>
          {/if}
        </div>
      </form>

      {#if made}
        {@const { invite, copied } = made}
        {@const link = linkTo(invite)}
        <section class="bg-raised grid gap-3 rounded-lg p-3" aria-label="Invite just made" aria-live="polite">
          <div class="grid gap-0.5">
            <p class="font-medium">
              {copied ? `${invite.name}'s link is on your clipboard` : `${invite.name}'s link is ready`}
            </p>
            <p class="text-muted-foreground text-xs">
              {copied ? "Paste it to them. It works once, for 7 days." : "Copy it and send it to them. It works once, for 7 days."}
            </p>
          </div>
          <!-- The whole link, wrapped, so the owner can see it is the one they sent. -->
          <p class="bg-raised-2 text-soft rounded-md px-2.5 py-2 text-xs break-all select-all" aria-label="Invite link">
            {link}
          </p>
          <Button variant="secondary" class="bg-raised-2 hover:bg-raised-2 w-fit min-w-28" onclick={() => copyAgain(invite)}>
            {#if justCopied === invite.code}<Check />Copied{:else}<Copy />{copied ? "Copy again" : "Copy"}{/if}
          </Button>
        </section>
      {/if}
    </div>
  </div>
{/if}
