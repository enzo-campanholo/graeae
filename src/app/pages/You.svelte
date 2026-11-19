<script lang="ts">
  // The "You" page, the same for every member and the owner: your display name, your
  // devices with Forget, and Add a device. Dark or light is chosen here too.
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Plus from "@lucide/svelte/icons/plus";
  import { sample } from "$sample";
  import PlainPage from "$lib/components/plain/PlainPage.svelte";
  import Section from "$lib/components/plain/Section.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { getJson, load, postJson, type Load } from "$lib/api.js";
  import { copy } from "$lib/clipboard.js";
  import { heldBack } from "$lib/hold-back.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { theme, themes } from "$lib/theme.svelte.js";
  import { deviceLabel, timeAgo, timeLeft } from "$lib/words.js";
  import type { DeviceInvite, DeviceInviteAnswer, DeviceSummary, Me, MeAnswer } from "../../shared/api.ts";
  import NothingHere from "./NothingHere.svelte";

  const NAME_MAX = 40;

  let known = $state<Load<MeAnswer>>(sample ? { state: "loaded", data: sample.you } : { state: "loading" });
  if (!sample) {
    load<MeAnswer>("/api/me", (value) => {
      known = value;
      if (value.state === "loaded") name = value.data.name;
    });
  }

  const you = $derived(known.state === "loaded" ? known.data : null);
  holdUntil(() => known.state !== "loading");

  // Last use is shown in whole minutes at best, so the clock moves every few seconds,
  // often enough for an Add a device link's expiry too.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 5_000);
    return () => clearInterval(timer);
  });

  // Display name.
  let name = $state(sample?.you.name ?? "");
  let saving = $state(false);
  let saved = $state(false);
  let nameFailed = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const nameChanged = $derived(!!you && name.trim() !== "" && name.trim() !== you.name);

  async function saveName(event: SubmitEvent) {
    event.preventDefault();
    if (!you || !nameChanged || saving || sample) return;
    saving = true;
    const answer = await postJson<Me>("/api/me/name", { name: name.trim() }).catch(() => null);
    saving = false;
    if (!answer) {
      nameFailed = true;
      return;
    }
    you.name = answer.name;
    name = answer.name;
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), 1500);
  }

  // Devices. Forgetting another device is done at the press, since adding it back is
  // one invite away. Forgetting this one asks first: coming back on it takes an invite.
  let confirmingThis = $state(false);
  let forgetting = $state<string | null>(null);

  async function forget(device: DeviceSummary) {
    if (!you || sample) return;
    if (device.current && !confirmingThis) {
      confirmingThis = true;
      return;
    }
    forgetting = device.id;
    const response = await fetch(`/api/me/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" }).catch(
      () => null,
    );
    forgetting = null;
    confirmingThis = false;
    // This browser is now a stranger here: the page is "nothing here", like any other.
    if (device.current && response?.ok) known = { state: "refused" };
    else if (response?.ok) you.devices = you.devices.filter((d) => d.id !== device.id);
    else await refresh();
  }

  // Add a device: a link for another browser, copied at the press and shown too.
  let made = $state<{ invite: DeviceInvite; copied: boolean; devices: string[] } | null>(null);
  let adding = $state(false);
  let addFailed = $state(false);
  let justCopied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const expired = $derived(!!made && now >= made.invite.expiresAt);

  function linkTo(invite: DeviceInvite): string {
    return `${window.location.origin}/invite/${invite.code}`;
  }

  async function addDevice() {
    if (!you || adding || sample) return;
    adding = true;
    addFailed = false;
    const answer = postJson<DeviceInviteAnswer>("/api/me/devices", {});
    // Handed to the clipboard now, while the press still counts.
    const copied = copy(answer.then((value) => (value ? linkTo(value.invite) : Promise.reject(new Error("refused")))));
    const value = await answer.catch(() => null);
    adding = false;
    if (!value) {
      addFailed = true;
      return;
    }
    now = Date.now();
    made = { invite: value.invite, copied: await copied, devices: you.devices.map((d) => d.id) };
  }

  async function copyAgain() {
    if (!made || !(await copy(linkTo(made.invite)))) return;
    made.copied = true;
    justCopied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (justCopied = false), 1500);
  }

  // Coming back from the other browser shows the device it became.
  async function refresh() {
    if (sample || known.state !== "loaded") return;
    const answer = await getJson<MeAnswer>("/api/me").catch(() => undefined);
    if (answer === undefined) return;
    if (answer === null) {
      known = { state: "refused" };
      return;
    }
    known.data.devices = answer.devices;
    if (made && answer.devices.some((d) => !made!.devices.includes(d.id))) made = null;
  }

  function onvisibilitychange() {
    if (document.visibilityState === "visible") void refresh();
  }
</script>

<svelte:window onfocus={refresh} />
<svelte:document {onvisibilitychange} />

{#if known.state === "refused"}
  <NothingHere />
{:else}
  <PlainPage title="You" you={false} gear={!!you?.owner} home={you?.home}>
    <Section title="Display name" description="The name everyone in your rooms sees.">
      <form class="grid gap-2" onsubmit={saveName}>
        <div class="flex gap-1.5">
          <Input
            class="max-w-72"
            bind:value={name}
            aria-label="Display name"
            aria-invalid={nameFailed || undefined}
            maxlength={NAME_MAX}
            autocomplete="off"
            spellcheck={false}
            disabled={!you}
            oninput={() => (nameFailed = false)}
          />
          <Button type="submit" variant="secondary" class="min-w-24" disabled={!nameChanged || saving}>
            {#if saved && !nameChanged}<Check />Saved{:else}Save{/if}
          </Button>
        </div>
        {#if nameFailed}
          <p class="text-muted-foreground text-xs" role="alert">
            That name was not saved. A name is 1 to {NAME_MAX} characters.
          </p>
        {/if}
      </form>
    </Section>

    <Section title="Devices" description="The browsers graeae remembers as yours.">
      <ul class="-mx-3 grid gap-0.5" aria-label="Your devices">
        {#if !you}
          {#each [0, 1] as i (i)}
            <li class="flex h-item-row flex-col justify-center gap-2 px-3" aria-hidden="true" {@attach heldBack}>
              <span class="bg-raised h-3.5 w-36 rounded-sm"></span>
              <span class="bg-raised h-3 w-24 rounded-sm opacity-60"></span>
            </li>
          {/each}
        {:else}
          {#each you.devices as device (device.id)}
            {@const label = deviceLabel(device.browser, device.os)}
            {@const asking = device.current && confirmingThis}
            <li
              class={[
                "flex h-item-row items-center gap-4 rounded-md pr-2 pl-3 transition-colors duration-150",
                asking ? "bg-raised" : "hover:bg-raised",
              ]}
              aria-label={label}
            >
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="truncate font-medium">{label}</span>
                <span class="text-muted-foreground truncate text-xs">
                  {#if asking}
                    Coming back on this browser will take a new invite.
                  {:else if device.current}
                    This device
                  {:else}
                    Last used {timeAgo(device.lastUsed, now)}
                  {/if}
                </span>
              </span>
              {#if asking}
                <Button variant="ghost" size="sm" onclick={() => (confirmingThis = false)}>Keep</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  class="bg-stop/14 text-stop"
                  disabled={forgetting === device.id}
                  onclick={() => forget(device)}
                >
                  Forget this device
                </Button>
              {:else}
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={forgetting === device.id}
                  onclick={() => forget(device)}
                >
                  Forget
                </Button>
              {/if}
            </li>
          {/each}
        {/if}
      </ul>

      <div class="grid gap-3">
        <div class="flex items-center gap-3">
          <Button variant="secondary" disabled={!you || adding} onclick={addDevice}><Plus />Add a device</Button>
          {#if addFailed}
            <p class="text-muted-foreground text-xs" role="alert">The link was not made. Try again.</p>
          {/if}
        </div>

        {#if made}
          {@const { invite, copied } = made}
          <section class="bg-raised grid gap-3 rounded-lg p-3" aria-label="Link for another browser" aria-live="polite">
            {#if expired}
              <div class="grid gap-0.5">
                <p class="font-medium">That link has run out</p>
                <p class="text-muted-foreground text-xs">Press Add a device again for a fresh one.</p>
              </div>
            {:else}
              <div class="grid gap-0.5">
                <p class="font-medium">{copied ? "The link is on your clipboard" : "Your link is ready"}</p>
                <p class="text-muted-foreground text-xs">
                  {copied ? "Open it in your other browser." : "Copy it to your other browser."}
                  It works once, and expires {timeLeft(invite.expiresAt, now)}.
                </p>
              </div>
              <!-- The whole link, wrapped, so it can be checked against the one pasted. -->
              <p class="bg-raised-2 text-soft rounded-md px-2.5 py-2 text-xs break-all select-all" aria-label="Device link">
                {linkTo(invite)}
              </p>
              <Button variant="secondary" class="bg-raised-2 hover:bg-raised-2 w-fit min-w-28" onclick={copyAgain}>
                {#if justCopied}<Check />Copied{:else}<Copy />{copied ? "Copy again" : "Copy"}{/if}
              </Button>
            {/if}
          </section>
        {/if}
      </div>
    </Section>

    <Section title="Appearance">
      <div class="bg-raised flex w-fit gap-0.5 rounded-md p-0.5" role="radiogroup" aria-label="Appearance">
        {#each themes as option (option.value)}
          <button
            type="button"
            role="radio"
            aria-checked={theme.current === option.value}
            class={[
              "h-control-sm rounded-sm px-3 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              theme.current === option.value ? "bg-raised-2 text-fg" : "text-muted-foreground hover:text-fg",
            ]}
            onclick={() => theme.set(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </Section>
  </PlainPage>
{/if}
