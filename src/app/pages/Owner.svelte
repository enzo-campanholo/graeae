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
  import { load, type Load } from "$lib/api.js";
  import { OwnerUsage } from "$lib/owner-usage.svelte.js";
  import type { Me } from "../../shared/api.ts";
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

  const current = $derived(sections[section]);

  // The instance refuses the owner page to anyone else, but a page reached inside the
  // app was never fetched, so it asks who this is before showing anything.
  let me = $state<Load<Me>>(sample ? { state: "loaded", data: { name: "", owner: true } } : { state: "loading" });
  if (!sample) load<Me>("/api/me", (value) => (me = value));
  const owner = $derived(me.state === "loaded" && me.data.owner);

  // Asked for only once the instance has said this is the owner.
  const usage = new OwnerUsage();
  $effect(() => {
    if (owner && !sample) return usage.watch();
  });
  const meter = $derived(sample?.owner ?? usage.figures);
</script>

<svelte:head>
  {#if owner}<title>{current.label} · Owner · graeae</title>{/if}
</svelte:head>

{#if me.state === "loading"}
  <main class="grid min-h-dvh place-items-center p-6"><Loading /></main>
{:else if !owner}
  <NothingHere />
{:else}
  <div class="flex h-dvh py-2 pr-2">
    <aside class="flex w-56 shrink-0 flex-col px-2">
      <header class="grid h-11 grid-cols-[28px_1fr_28px] items-center">
        <IconButton label="Rooms" href="/"><House /></IconButton>
        <span class="text-center text-sm font-medium">Owner</span>
      </header>
      <nav class="grid gap-0.5 pt-3" aria-label="Owner page">
        {#each Object.entries(sections) as [key, item] (key)}
          {@const Icon = item.icon}
          <a
            href="/owner/{key}"
            aria-current={key === section ? "page" : undefined}
            class={[
              "flex h-8 items-center gap-2.5 rounded-md px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[15px] [&_svg]:stroke-[1.75]",
              key === section ? "bg-raised text-fg" : "text-muted-foreground hover:bg-raised hover:text-fg",
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
          <div class="grid gap-2" aria-hidden="true">
            <span class="bg-raised h-2.5 w-24 rounded-sm"></span>
            <span class="bg-raised h-1 rounded-full"></span>
          </div>
        {/if}
      </a>
    </aside>

    <main class="bg-stage min-w-0 flex-1 overflow-y-auto rounded-xl">
      <div class="mx-auto grid max-w-[880px] gap-8 px-10 pt-9 pb-16">
        <div class="grid gap-1">
          <h1 class="text-xl font-medium tracking-[-0.01em]">{current.label}</h1>
          <p class="text-muted-foreground">{current.description}</p>
        </div>
        {#if section === "people" && !sample}<People />{/if}
        {#if section === "invites" && !sample}<Invites />{/if}
        {#if section === "rooms" && !sample}<OwnerRooms />{/if}
        {#if section === "usage" && !sample}<Usage {usage} />{/if}
      </div>
    </main>
  </div>
{/if}
