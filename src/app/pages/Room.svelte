<script lang="ts">
  // A room: the bar of people on the left and the stage filling the rest. Who is here
  // and what is live come over the tab's socket; your own shares sit at the bar's foot.
  // A share's icon on its sharer's row puts it on this tab's stage or takes it off.
  import { sample, SampleScene } from "$sample";
  import BarHeader from "$lib/components/room/BarHeader.svelte";
  import Bar from "$lib/components/room/Bar.svelte";
  import OwnShare from "$lib/components/room/OwnShare.svelte";
  import PeopleHeading from "$lib/components/room/PeopleHeading.svelte";
  import PersonRow from "$lib/components/room/PersonRow.svelte";
  import Rail from "$lib/components/room/Rail.svelte";
  import SharePreview from "$lib/components/room/SharePreview.svelte";
  import ShareButtons from "$lib/components/room/ShareButtons.svelte";
  import Shortcuts from "$lib/components/room/Shortcuts.svelte";
  import Stage from "$lib/components/room/Stage.svelte";
  import StageEmpty from "$lib/components/room/StageEmpty.svelte";
  import StageTile from "$lib/components/room/StageTile.svelte";
  import WatchedPicture from "$lib/components/room/WatchedPicture.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import { isShortcut } from "$lib/keys.js";
  import { RoomClient } from "$lib/room-client.svelte.js";
  import { readStored, writeStored } from "$lib/stored.js";
  import type { LiveShare, Person, ShareKind } from "../../shared/socket/index.ts";
  import { sameShare } from "../../shared/socket/watching.ts";
  import type { Params } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  let { params }: { params: Params } = $props();

  const room = sample?.room ?? null;

  // The tab's one connection to the room, for as long as the page shows it. Leaving the
  // page closes it, which ends this tab's presence at once.
  let client = $state<RoomClient | null>(null);

  $effect(() => {
    if (sample) return;
    const opened = new RoomClient(params.room ?? "");
    client = opened;
    return () => opened.close();
  });

  const view = $derived(client?.view ?? null);
  const refused = $derived(client?.refused ?? false);
  const name = $derived(room?.name ?? view?.room.name ?? null);

  // The bar's people: those present first, then, dimmed, those with access who are not.
  // Each group is in alphabetical order, and your own row closes the present ones.
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  const people = $derived.by(() => {
    if (!view) return null;
    const present = new Set(view.presence.present);
    const others = view.people.members.filter((person) => person.id !== view.people.you.id);
    return {
      you: view.people.members.find((person) => person.id === view.people.you.id)?.name ?? "",
      here: others.filter((person) => present.has(person.id)).toSorted(byName),
      away: others.filter((person) => !present.has(person.id)).toSorted(byName),
    };
  });

  // Whether a member has a live share of a kind. Each live share is an icon on its
  // sharer's row, lit while this tab watches it.
  const isLive = (member: string, kind: ShareKind) =>
    !!view?.shares.live.some((share) => share.member === member && share.kind === kind);
  const rowShare = (member: string, kind: ShareKind) =>
    isLive(member, kind) ? { watched: !!client?.watches({ member, kind }) } : null;
  const toggle = (member: string, kind: ShareKind) => client?.toggle({ member, kind });

  const nameOf = (id: string) => view?.people.members.find((person) => person.id === id)?.name ?? "";

  // Your own shares from this tab, at the bar's foot once they are live.
  const mine = $derived((client?.mine ?? []).filter((share) => share.state !== "starting"));
  const webcamStarting = $derived(!!client?.mine.some((share) => share.kind === "webcam" && share.state === "starting"));
  // A webcam of yours live from any tab or device: one webcam share per member at a time.
  const webcamLive = $derived(
    room
      ? room.mine.some((share) => share.kind === "webcam")
      : !!view && (isLive(view.people.you.id, "webcam") || mine.some((share) => share.kind === "webcam")),
  );

  // Your own live shares sent from another tab or device, which this tab can watch.
  const ownRowShare = (kind: ShareKind) =>
    !!view && !mine.some((share) => share.kind === kind) ? rowShare(view.people.you.id, kind) : null;

  // The stage: the shares this tab watches, while they are live, in the order it began
  // watching them.
  const stage = $derived(
    (view?.watching.stage ?? [])
      .filter((share) => isLive(share.member, share.kind))
      .map((share) => ({
        share,
        key: `${share.member}:${share.kind}`,
        name: nameOf(share.member),
        stream: client?.pictures.find((picture) => sameShare(picture.share, share))?.stream ?? null,
      })),
  );

  // The names of the members watching one of your own shares, for its preview.
  const watchersOf = (share: LiveShare) =>
    (view?.watching.watchers.find((entry) => sameShare(entry.share, share))?.members ?? []).map(nameOf);

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

  // Shares others have live, which you could watch.
  const live = $derived(
    room
      ? room.people.reduce((n, person) => n + Number(!!person.screen) + Number(!!person.webcam), 0)
      : (view?.shares.live.filter((share) => share.member !== view.people.you.id).length ?? 0),
  );
</script>

<svelte:head>
  {#if !refused}<title>{name ? `${name} · graeae` : "graeae"}</title>{/if}
</svelte:head>

<svelte:window {onkeydown} />

{#if refused}
  <NothingHere />
{:else}
  <div class="flex h-dvh py-2 pr-2">
    {#if folded}
      <Rail
        people={room
          ? room.people.map((person) => ({
              id: person.id,
              name: person.name,
              followed: person.followed,
              sharing: !!(person.screen || person.webcam),
            }))
          : (people?.here ?? []).map(({ id, name }) => ({
              id,
              name,
              followed: false,
              sharing: isLive(id, "screen") || isLive(id, "webcam"),
            }))}
        onexpand={() => fold(false)}
      >
        {#snippet foot()}
          <ShareButtons compact {webcamLive} {webcamStarting} onwebcam={() => client?.shareWebcam()} />
        {/snippet}
      </Rail>
    {:else}
      <Bar>
        {#snippet header()}
          <BarHeader
            {name}
            home={room?.home ?? (view ? view.people.you.rooms > 1 : false)}
            gear={room?.gear ?? view?.people.you.owner}
            oncollapse={() => fold(true)}
          />
        {/snippet}

        {#if people}
          <section aria-label="Here">
            <PeopleHeading label="Here" count={people.here.length + 1} />
            {#each people.here as person (person.id)}
              <PersonRow
                name={person.name}
                screen={rowShare(person.id, "screen")}
                webcam={rowShare(person.id, "webcam")}
                ontoggle={(kind) => toggle(person.id, kind)}
              />
            {/each}
            <PersonRow
              name={people.you}
              you
              screen={ownRowShare("screen")}
              webcam={ownRowShare("webcam")}
              ontoggle={(kind) => view && toggle(view.people.you.id, kind)}
            />
          </section>
          {#if people.away.length}
            <section class="mt-4" aria-label="Not here">
              <PeopleHeading label="Not here" count={people.away.length} />
              {#each people.away as person (person.id)}
                <PersonRow name={person.name} away />
              {/each}
            </section>
          {/if}
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
          {#each mine as share (share.kind)}
            <OwnShare
              kind={share.kind}
              watchers={view ? watchersOf({ member: view.people.you.id, kind: share.kind }) : []}
              stopping={share.state === "stopping"}
              onstop={() => client?.stop(share.kind)}
            >
              <SharePreview kind={share.kind} stream={share.capture?.stream ?? null} />
            </OwnShare>
          {/each}
          {#if client?.failed === "webcam"}
            <p class="text-muted-foreground px-0.5 pb-2 text-xs" role="status">Your webcam didn't start. Try again.</p>
          {/if}
          <ShareButtons {webcamLive} {webcamStarting} onwebcam={() => client?.shareWebcam()} />
        {/snippet}
      </Bar>
    {/if}

    <Stage count={room?.stage.length ?? stage.length}>
      {#each room?.stage ?? [] as share (share.id)}
        <StageTile name={share.name} kind={share.kind}>
          <SampleScene scene={share.scene} />
        </StageTile>
      {/each}
      {#each stage as tile (tile.key)}
        <StageTile name={tile.name} kind={tile.share.kind} onstop={() => client?.unwatch(tile.share)}>
          <WatchedPicture name={tile.name} kind={tile.share.kind} stream={tile.stream} />
        </StageTile>
      {/each}
      {#snippet empty()}
        <!-- Until the room is known, the stage says only that it is loading. -->
        {#if room || view}<StageEmpty {live} />{:else}<Loading />{/if}
      {/snippet}
    </Stage>
  </div>
{/if}
