<script lang="ts">
  // The invite page: one button. Opening it uses nothing up; only the press does, and
  // the press remembers this browser and goes straight into the room.
  import { sample } from "$sample";
  import Loading from "$lib/components/Loading.svelte";
  import Mark from "$lib/components/Mark.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { load, postJson, type Load } from "$lib/api.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import type { InviteAnswer, JoinAnswer } from "../../shared/api.ts";
  import { navigate, type Params } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  let { params }: { params: Params } = $props();

  const path = $derived(`/api/invites/${encodeURIComponent(params.invite ?? "")}`);

  let known = $state<Load<InviteAnswer>>(sample ? { state: "loaded", data: sample.invite } : { state: "loading" });
  let joining = $state(false);
  holdUntil(() => known.state !== "loading");

  $effect(() => {
    if (sample) return;
    let current = true;
    load<InviteAnswer>(path, (value) => {
      if (current) known = value;
    });
    return () => {
      current = false;
    };
  });

  async function join() {
    if (sample) return;
    joining = true;
    const answer = await postJson<JoinAnswer>(path, {}).catch(() => null);
    // Refused at the press: used, cancelled or expired since the page was opened.
    if (answer === null) known = { state: "refused" };
    else navigate(answer.to, { replace: true });
  }
</script>

{#if known.state !== "refused"}<PageTitle title="graeae" />{/if}

{#if known.state === "refused"}
  <NothingHere />
{:else}
  <main class="grid min-h-dvh place-items-center p-6">
    <div class="grid justify-items-center gap-6 text-center">
      {#if known.state === "loading"}
        <Loading />
      {:else}
        <Mark size="lg" />
        <div class="grid justify-items-center gap-3">
          <Button size="lg" class="min-w-48" disabled={joining} onclick={join}>Join as {known.data.name}</Button>
          <p class="text-muted-foreground max-w-72 text-xs">graeae will remember this browser as yours.</p>
        </div>
      {/if}
    </div>
  </main>
{/if}
