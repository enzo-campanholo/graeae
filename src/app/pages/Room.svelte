<script lang="ts">
  // A room: the bar of people on the left and the stage filling the rest. This is the
  // shell; the room's state, watching and sharing arrive with their own tickets.
  import { sample, SampleScene } from "$sample";
  import BarHeader from "$lib/components/room/BarHeader.svelte";
  import Bar from "$lib/components/room/Bar.svelte";
  import OwnShare from "$lib/components/room/OwnShare.svelte";
  import PeopleHeading from "$lib/components/room/PeopleHeading.svelte";
  import PersonRow from "$lib/components/room/PersonRow.svelte";
  import Rail from "$lib/components/room/Rail.svelte";
  import ShareButtons from "$lib/components/room/ShareButtons.svelte";
  import Shortcuts from "$lib/components/room/Shortcuts.svelte";
  import Stage from "$lib/components/room/Stage.svelte";
  import StageEmpty from "$lib/components/room/StageEmpty.svelte";
  import StageTile from "$lib/components/room/StageTile.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { load, type Load } from "$lib/api.js";
  import { isShortcut } from "$lib/keys.js";
  import { readStored, writeStored } from "$lib/stored.js";
  import type { RoomAnswer } from "../../shared/api.ts";
  import type { Params } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  let { params }: { params: Params } = $props();

  const room = sample?.room ?? null;

  // The room as the instance knows it. Who is here and what is live arrive with presence.
  let known = $state<Load<RoomAnswer>>({ state: "loading" });

  $effect(() => {
    if (sample) return;
    const path = `/api/rooms/${encodeURIComponent(params.room ?? "")}`;
    let current = true;
    known = { state: "loading" };
    load<RoomAnswer>(path, (value) => {
      if (current) known = value;
    });
    return () => {
      current = false;
    };
  });

  const answer = $derived(known.state === "loaded" ? known.data : null);
  const name = $derived(room?.name ?? answer?.room.name ?? null);

  // Whether the bar is folded into the rail is kept on this device.
  const FOLDED_KEY = "graeae:rail";
  let folded = $state(readStored(FOLDED_KEY) === "1");

  function fold(value: boolean) {
    folded = value;
    writeStored(FOLDED_KEY, value ? "1" : "0");
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "[" && isShortcut(event)) {
      event.preventDefault();
      fold(!folded);
    }
  }

  const live = $derived(
    room ? room.people.reduce((n, person) => n + Number(!!person.screen) + Number(!!person.webcam), 0) : 0,
  );
  const webcamLive = $derived(!!room?.mine.some((share) => share.kind === "webcam"));
</script>

<svelte:head>
  {#if known.state !== "refused"}<title>{name ? `${name} · graeae` : "graeae"}</title>{/if}
</svelte:head>

<svelte:window {onkeydown} />

{#if known.state === "refused"}
  <NothingHere />
{:else}
  <div class="flex h-dvh py-2 pr-2">
    {#if folded}
      <Rail
        people={(room?.people ?? []).map((person) => ({
          id: person.id,
          name: person.name,
          followed: person.followed,
          sharing: !!(person.screen || person.webcam),
        }))}
        onexpand={() => fold(false)}
      >
        {#snippet foot()}
          <ShareButtons compact {webcamLive} />
        {/snippet}
      </Rail>
    {:else}
      <Bar>
        {#snippet header()}
          <BarHeader
            {name}
            home={room?.home}
            gear={room?.gear ?? answer?.me.owner}
            oncollapse={() => fold(true)}
          />
        {/snippet}

        {#if answer}
          <section aria-label="Here">
            <PeopleHeading label="Here" count={1} />
            <PersonRow name={answer.me.name} you />
          </section>
        {:else if room}
          <section aria-label="Here">
            <PeopleHeading label="Here" count={room.people.length + 1} />
            {#each room.people as person (person.id)}
              <PersonRow
                name={person.name}
                followed={person.followed}
                screen={person.screen}
                webcam={person.webcam}
              />
            {/each}
            <PersonRow name={room.me} you />
            <Shortcuts />
          </section>
          {#if room.away.length}
            <section class="mt-4" aria-label="Not here">
              <PeopleHeading label="Not here" count={room.away.length} />
              {#each room.away as name (name)}
                <PersonRow {name} away />
              {/each}
            </section>
          {/if}
        {/if}

        {#snippet foot()}
          {#each room?.mine ?? [] as share (share.kind)}
            <OwnShare kind={share.kind} watchers={share.watchers}>
              <SampleScene scene={share.scene} />
            </OwnShare>
          {/each}
          <ShareButtons {webcamLive} />
        {/snippet}
      </Bar>
    {/if}

    <Stage count={room?.stage.length ?? 0}>
      {#each room?.stage ?? [] as share (share.id)}
        <StageTile name={share.name} kind={share.kind}>
          <SampleScene scene={share.scene} />
        </StageTile>
      {/each}
      {#snippet empty()}
        <!-- Until the room is known, the stage says only that it is loading. -->
        {#if room || answer}<StageEmpty {live} />{:else}<Loading />{/if}
      {/snippet}
    </Stage>
  </div>
{/if}
