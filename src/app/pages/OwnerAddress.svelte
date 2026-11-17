<script lang="ts">
  // `/owner` opens on People; `/owner/<section>` opens that section, and any other
  // section is an address like any other the app does not know.
  import { navigate, type Params } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";
  import Owner, { OWNER_SECTIONS, type OwnerSection } from "./Owner.svelte";

  let { params }: { params: Params } = $props();

  const section = $derived(params.section);
  const known = $derived(OWNER_SECTIONS.includes(section as OwnerSection));

  $effect(() => {
    if (section === undefined) navigate("/owner/people", { replace: true });
  });
</script>

{#if known}
  <Owner section={section as OwnerSection} />
{:else if section !== undefined}
  <NothingHere />
{/if}
