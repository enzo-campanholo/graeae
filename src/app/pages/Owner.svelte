<script lang="ts" module>
  export const OWNER_SECTIONS = ["people", "invites", "rooms", "usage"] as const;
  export type OwnerSection = (typeof OWNER_SECTIONS)[number];
</script>

<script lang="ts">
  // The owner page: four sections in a navigation on the left, with the usage meter
  // always in view at its foot, and the chosen section in the inset panel. The meter and
  // the Usage section read the same figures, kept fresh while the page is in view.
  import Gauge from "@lucide/svelte/icons/gauge";
  import House from "@lucide/svelte/icons/house";
  import Link from "@lucide/svelte/icons/link";
  import Users from "@lucide/svelte/icons/users";
  import DoorOpen from "@lucide/svelte/icons/door-open";
  import type { Component } from "svelte";
  import { sample } from "$sample";
  import IconButton from "$lib/components/IconButton.svelte";
  import UsageMeter from "$lib/components/UsageMeter.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { getJson, load, type Load } from "$lib/api.js";
  import { heldBack } from "$lib/hold-back.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Swap from "$lib/components/Swap.svelte";
  import { OwnerUsage } from "$lib/owner-usage.svelte.js";
  import type { MeAnswer } from "../../shared/api.ts";
  import NothingHere from "./NothingHere.svelte";
  import Invites from "./owner/Invites.svelte";
  import People from "./owner/People.svelte";
  import OwnerRooms from "./owner/Rooms.svelte";
  import Usage from "./owner/Usage.svelte";

  let { section }: { section: OwnerSection } = $props();

  const sections: Record<OwnerSection, { label: string; icon: Component; description: string }> = {
    people: {
      label: "People",
      icon: Users,
      description: "Everyone you have let in, with their rooms, devices and last visit.",
    },
    invites: {
      label: "Invites",
      icon: Link,
      description: "Invite someone by name, and see the invites nobody has used yet.",
    },
    rooms: {
      label: "Rooms",
      icon: DoorOpen,
      description: "Rename a room or make a new one. A room's address never changes.",
    },
    usage: {
      label: "Usage",
      icon: Gauge,
      description: "What members have watched this month, against your usage budget.",
    },
  };

  // The section on screen. A move to another one keeps this one, the navigation's mark
  // included, until the next one has its list, then swaps all of it in one frame.
  // svelte-ignore state_referenced_locally
  let shown = $state(section);

  // The instance refuses the owner page to anyone else, but a page reached inside the
  // app was never fetched, so it asks who this is before showing anything.
  let me = $state<Load<MeAnswer>>(
    sample ? { state: "loaded", data: { name: "", owner: true, devices: [], home: "/" } } : { state: "loading" },
  );
  if (!sample) load<MeAnswer>("/api/me", (value) => (me = value));
  const owner = $derived(me.state === "loaded" && me.data.owner);
  // The house goes straight to the owner's one room, not through the list's redirect.
  // A new room can make it the list, so the answer is asked again after one is made. A
  // refresh that fails leaves the page as it is: the house is then at worst one redirect off.
  const home = $derived(me.state === "loaded" ? me.data.home : "/");
  function refreshHome() {
    getJson<MeAnswer>("/api/me")
      .then((data) => {
        if (data) me = { state: "loaded", data };
      })
      .catch(() => {});
  }

  // Asked for only once the instance has said this is the owner.
  const usage = new OwnerUsage();
  $effect(() => {
    if (owner && !sample) return usage.watch();
  });
  const meter = $derived(sample?.owner ?? usage.figures);

  // The page appears with the owner known and the meter's figures in; its section holds it too.
  holdUntil(() => me.state !== "loading" && (!owner || !!meter));
</script>

{#if owner}<PageTitle title="{sections[shown].label} · Owner · graeae" />{/if}

{#if me.state === "loading"}
  <main class="grid min-h-dvh place-items-center p-6"><Loading /></main>
{:else if !owner}
  <NothingHere />
{:else}
  <div class="flex h-dvh py-2 pr-2">
    <aside class="flex w-bar shrink-0 flex-col px-2">
      <!-- As the room's bar: the tools on a row, then the page's name under them at the
           headline step. Not a heading: each section's own name is the page's heading. -->
      <header>
        <div class="flex h-header items-center"><IconButton label="Rooms" href={home}><House /></IconButton></div>
        <p class="px-2 text-xl font-medium">Owner</p>
      </header>
      <nav class="grid gap-0.5 pt-3" aria-label="Owner page">
        {#each Object.entries(sections) as [key, item] (key)}
          {@const Icon = item.icon}
          <a
            href="/owner/{key}"
            aria-current={key === shown ? "page" : undefined}
            class={[
              "flex h-row items-center gap-2.5 rounded-md px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-icon [&_svg]:stroke-[1.75]",
              key === shown ? "bg-raised text-fg" : "text-muted-foreground hover:bg-raised hover:text-fg",
            ]}
          >
            <Icon />{item.label}
          </a>
        {/each}
      </nav>
      <a
        href="/owner/usage"
        class="hover:bg-raised mt-auto mb-1 rounded-md p-2 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {#if meter}
          <UsageMeter used={meter.used} budget={meter.budget} />
        {:else}
          <div class="grid gap-2" aria-hidden="true" {@attach heldBack}>
            <span class="bg-raised h-3 w-28 rounded-sm"></span>
            <span class="bg-raised h-1 rounded-full"></span>
          </div>
        {/if}
      </a>
    </aside>

    <main class="bg-stage min-w-0 flex-1 overflow-y-auto rounded-xl">
      <div class="mx-auto max-w-owner px-10 pt-9 pb-16">
        <Swap key={section} value={section} onshow={(key) => (shown = key)}>
          {#snippet children(key)}
            <div class="grid gap-8">
              <div class="grid gap-1">
                <h1 class="text-xl font-medium">{sections[key].label}</h1>
                <p class="text-muted-foreground">{sections[key].description}</p>
              </div>
              {#if key === "people" && !sample}<People />{/if}
              {#if key === "invites" && !sample}<Invites />{/if}
              {#if key === "rooms" && !sample}<OwnerRooms oncreated={refreshHome} />{/if}
              {#if key === "usage" && !sample}<Usage {usage} />{/if}
            </div>
          {/snippet}
        </Swap>
      </div>
    </main>
  </div>
{/if}
