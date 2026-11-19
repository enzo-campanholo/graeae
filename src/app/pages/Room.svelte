<script lang="ts">
  // A room: the bar of people on the left and the stage filling the rest. Who is here
  // and what is live come over the tab's socket; your own shares sit at the bar's foot.
  // A share's icon on its sharer's row puts it on this tab's stage or takes it off.
  import { sample, SampleScene } from "$sample";
  import type { Scene } from "../sample/types.ts";
  import BarHeader from "$lib/components/room/BarHeader.svelte";
  import BudgetStrip from "$lib/components/room/BudgetStrip.svelte";
  import Bar from "$lib/components/room/Bar.svelte";
  import OwnShare from "$lib/components/room/OwnShare.svelte";
  import PeopleHeading from "$lib/components/room/PeopleHeading.svelte";
  import PersonRow from "$lib/components/room/PersonRow.svelte";
  import Rail from "$lib/components/room/Rail.svelte";
  import SharePreview from "$lib/components/room/SharePreview.svelte";
  import HandOverOffer from "$lib/components/room/HandOverOffer.svelte";
  import ScreenNotice from "$lib/components/room/ScreenNotice.svelte";
  import SharerNote from "$lib/components/room/SharerNote.svelte";
  import ShareButtons from "$lib/components/room/ShareButtons.svelte";
  import Shortcuts from "$lib/components/room/Shortcuts.svelte";
  import Stage from "$lib/components/room/Stage.svelte";
  import StageEmpty, { type LiveChoice } from "$lib/components/room/StageEmpty.svelte";
  import type { PanelPlace } from "$lib/components/room/FootPanel.svelte";
  import StageTile from "$lib/components/room/StageTile.svelte";
  import WatchedPicture from "$lib/components/room/WatchedPicture.svelte";
  import YouMenu from "$lib/components/YouMenu.svelte";
  import Loading from "$lib/components/Loading.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import { Hearing } from "$lib/hearing.js";
  import { isShortcut } from "$lib/keys.js";
  import { RoomClient } from "$lib/room-client.svelte.js";
  import { readStored, writeStored } from "$lib/stored.js";
  import { holdUntil, viewShown } from "$lib/swap.svelte.js";
  import type { LiveShare, Person, ShareKind } from "../../shared/socket/index.ts";
  import { sameShare } from "../../shared/socket/watching.ts";
  import type { Sharing } from "$lib/share.js";
  import type { Params } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  let { params }: { params: Params } = $props();

  const room = sample?.room ?? null;

  // The tab's one connection to the room, for as long as the page is mounted. Leaving the
  // page closes it once the next page swaps in, at most 300ms later (see
  // `$lib/swap.svelte.ts`), which ends this tab's presence.
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
  const owner = $derived(room?.gear ?? view?.people.you.owner ?? false);
  holdUntil(() => !!sample || refused || view !== null);

  // The bar's people: those present first, then, dimmed, those with access who are not.
  // Each group is in alphabetical order, and your own row closes the present ones.
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  const people = $derived.by(() => {
    if (!view) return null;
    const present = new Set(view.presence.present);
    const reconnecting = new Set(view.presence.reconnecting);
    const others = view.people.members.filter((person) => person.id !== view.people.you.id);
    return {
      you: view.people.members.find((person) => person.id === view.people.you.id)?.name ?? "",
      here: others
        .filter((person) => present.has(person.id))
        .map((person) => ({ ...person, reconnecting: reconnecting.has(person.id) }))
        .toSorted(byName),
      away: others.filter((person) => !present.has(person.id)).toSorted(byName),
    };
  });
  // Your own name, for the avatar in the header and at the rail's foot.
  const me = $derived(room?.me ?? (people?.you || null));

  // Whether a member has a live share of a kind. Each live share is an icon on its
  // sharer's row, lit while this tab watches it.
  const isLive = (member: string, kind: ShareKind) =>
    !!view?.shares.live.some((share) => share.member === member && share.kind === kind);
  const rowShare = (member: string, kind: ShareKind) =>
    isLive(member, kind)
      ? {
          watched: !!client?.wants({ member, kind }),
          reconnecting: !!view?.shares.live.some(
            (share) => share.member === member && share.kind === kind && share.reconnecting,
          ),
        }
      : null;
  const toggle = (member: string, kind: ShareKind) => client?.toggle({ member, kind });

  const nameOf = (id: string) => view?.people.members.find((person) => person.id === id)?.name ?? "";

  // Your own shares from this tab, at the bar's foot once they are live.
  const mine = $derived((client?.mine ?? []).filter((share) => share.state !== "starting"));
  const starting = (kind: ShareKind) =>
    !!client?.mine.some((share) => share.kind === kind && share.state === "starting");
  // A share of yours sent from this tab. One of each kind per member at a time: a share
  // of that kind live from another tab or device can be handed over to this one.
  const liveHere = (kind: ShareKind) =>
    room ? room.mine.some((share) => share.kind === kind) : mine.some((share) => share.kind === kind);
  const liveElsewhere = (kind: ShareKind) => !!view && !liveHere(kind) && isLive(view.people.you.id, kind);
  const shareButtons: Sharing = $derived({
    screenLive: liveHere("screen"),
    screenStarting: starting("screen"),
    webcamLive: liveHere("webcam"),
    webcamStarting: starting("webcam"),
  });

  // Pressing a share button while that kind of yours is live elsewhere offers to stop it
  // there and share from here. The offer goes once that share ends by itself.
  let offer = $state<ShareKind | null>(null);
  $effect(() => {
    if (offer && !liveElsewhere(offer)) offer = null;
  });

  // "Share screen" goes straight to the browser's picker. The first time on this device a
  // short notice comes first, once; going on from it is the click that opens the picker.
  const NOTICE_KEY = "graeae:screen-notice";
  let notice = $state(false);
  /** Whether the screen share the notice leads to hands over one live elsewhere. */
  let handingOver = false;

  // The notice and the offer open where the button pressed was: in the bar (or beside the
  // rail), or on the empty stage while it offers sharing. A key press asks in the bar.
  let pressedOn = $state<"bar" | "stage">("bar");

  function shareScreen(from: "bar" | "stage" = "bar") {
    if (!client || shareButtons.screenLive || shareButtons.screenStarting) return;
    pressedOn = from;
    if (liveElsewhere("screen")) {
      notice = false;
      offer = "screen";
    } else pickScreen(false);
  }

  function shareWebcam(from: "bar" | "stage" = "bar") {
    if (!client || shareButtons.webcamLive || shareButtons.webcamStarting) return;
    pressedOn = from;
    if (liveElsewhere("webcam")) {
      notice = false;
      offer = "webcam";
    } else void client.shareWebcam();
  }

  function pickScreen(handOver: boolean) {
    if (readStored(NOTICE_KEY) === "seen") void client?.shareScreen({ handOver });
    else {
      handingOver = handOver;
      notice = true;
    }
  }

  function noticeRead() {
    notice = false;
    writeStored(NOTICE_KEY, "seen");
    void client?.shareScreen({ handOver: handingOver });
  }

  function handOver() {
    const kind = offer;
    offer = null;
    if (kind === "screen") pickScreen(true);
    else if (kind === "webcam") void client?.shareWebcam({ handOver: true });
  }

  // Your own live shares sent from another tab or device, which this tab can watch.
  const ownRowShare = (kind: ShareKind) =>
    !!view && !mine.some((share) => share.kind === kind) ? rowShare(view.people.you.id, kind) : null;

  // The stage: the shares this tab watches, while they are live, in the order it began
  // watching them. A share is on it from the click that chose it, connecting until its
  // picture arrives, and off it from the click that let it go.
  // The sample's made-up shares stand in for them under `?sample`.
  interface Tile {
    key: string;
    name: string;
    kind: ShareKind;
    /** A screen share with no screen audio. */
    videoOnly?: boolean;
    /** A screen share with screen audio, which this tab hears. */
    sound?: boolean;
    /** A share at two qualities: the viewer may choose which they watch it at. */
    twoQualities?: boolean;
    /** It arrives at the lower of its two qualities. */
    lower?: boolean;
    /** Chosen, and on its way: the instance has not pulled it to this tab yet. */
    arriving?: boolean;
    share?: LiveShare;
    stream?: MediaStream | null;
    scene?: Scene;
  }
  const tiles: Tile[] = $derived(
    room
      ? room.stage.map((share) => ({ key: share.id, name: share.name, kind: share.kind, scene: share.scene }))
      : (client?.staged ?? [])
          .filter((share) => isLive(share.member, share.kind))
          .map((share) => {
            const listed = view?.shares.live.find((live) => sameShare(live, share));
            const picture = client?.pictures.find((candidate) => sameShare(candidate.share, share));
            const twoQualities = listed?.twoQualities === true;
            return {
              key: `${share.member}:${share.kind}`,
              name: nameOf(share.member),
              kind: share.kind,
              videoOnly: listed?.audio === false,
              sound: listed?.audio === true,
              twoQualities,
              lower: twoQualities && picture?.received === "720p",
              arriving: !picture,
              share,
              stream: picture?.stream ?? null,
            };
          }),
  );

  // The focused share, large above a strip of the others, while it is on the stage.
  let focusedKey = $state<string | null>(null);
  const focusedTile = $derived(tiles.find((tile) => tile.key === focusedKey) ?? null);
  $effect(() => {
    // A focused share that leaves the stage is forgotten, so it comes back into the grid.
    if (focusedKey && !focusedTile) focusedKey = null;
  });

  // What this tab hears of the watched shares with screen audio: all of them at once, each
  // at its member's volume, kept on this device, unless muted for this watch.
  const hearing = new Hearing();
  const sounding = $derived(tiles.filter((tile) => tile.sound).map((tile) => tile.key));
  $effect(() => hearing.keep(tiles.map((tile) => tile.key)));
  const audioOf = (tile: Tile) =>
    tile.sound && tile.share
      ? {
          volume: hearing.volume(tile.share.member),
          muted: hearing.isMuted(tile.key),
          only: sounding.length > 1 ? hearing.isOnly(tile.key, sounding) : null,
          onvolume: (volume: number) => tile.share && hearing.setVolume(tile.share.member, tile.key, volume),
          onmute: (muted: boolean) => hearing.setMuted(tile.key, muted),
          ononly: () => hearing.hearOnly(tile.key, sounding),
        }
      : null;

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

  // A room still on its way to the screen leaves keys to the page that is.
  const shown = viewShown();
  function onkeydown(event: KeyboardEvent) {
    if (!shown()) return;
    if (event.key === "[" && isShortcut(event)) {
      event.preventDefault();
      fold(!folded);
    } else if (event.key.toLowerCase() === "s" && !event.altKey && !event.repeat && isShortcut(event)) {
      event.preventDefault();
      shareScreen();
    }
  }

  // How far the month has gone into the usage budget, as you are told it: the owner from
  // 80%, everyone from 95%. A warning runs across the stage's top; once it is used up
  // the empty stage says so.
  const budget = $derived(view?.usage.budget ?? null);

  // Shares others have live, which you could watch, by name, a screen before a webcam.
  // The empty stage offers each of them, or sharing while there are none.
  const others: LiveChoice[] = $derived(
    (room
      ? room.people.flatMap((person) =>
          (["screen", "webcam"] as const)
            .filter((kind) => person[kind])
            .map((kind) => ({ member: person.id, name: person.name, kind })),
        )
      : (view?.shares.live ?? [])
          .filter((share) => share.member !== view?.people.you.id)
          .map((share) => ({ member: share.member, name: nameOf(share.member), kind: share.kind }))
    ).toSorted((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind)),
  );
  // A share of yours is live, from this tab or another.
  const yoursLive = $derived(
    room ? room.mine.length > 0 : !!view && (isLive(view.people.you.id, "screen") || isLive(view.people.you.id, "webcam")),
  );
  // The empty stage offers sharing, so what a press of its buttons asks opens there. This
  // is the branch of StageEmpty that shows its share buttons; should the stage stop
  // showing them meanwhile, what was asked moves to the bar, still open.
  const stageOffers = $derived(
    !!(room || view) && tiles.length === 0 && !client?.following && budget !== "used up" && others.length === 0,
  );
  const askOnStage = $derived(pressedOn === "stage" && stageOffers);
</script>

{#if !refused}<PageTitle title={name ? `${name} · graeae` : "graeae"} />{/if}

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
              reconnecting: !!person.reconnecting,
            }))
          : (people?.here ?? []).map(({ id, name, reconnecting }) => ({
              id,
              name,
              followed: client?.following === id,
              sharing: isLive(id, "screen") || isLive(id, "webcam"),
              reconnecting,
            }))}
        onexpand={() => fold(false)}
        onfollow={(id) => client?.follow(id)}
      >
        {#snippet foot()}
          {#if !askOnStage}{@render askFirst("rail")}{/if}
          <ShareButtons compact {...shareButtons} onscreen={() => shareScreen()} onwebcam={() => shareWebcam()} />
          <div class="mt-3"><YouMenu name={me} {owner} side="right" large newTab /></div>
        {/snippet}
      </Rail>
    {:else}
      <Bar>
        {#snippet header()}
          <BarHeader
            {name}
            {me}
            home={room?.home ?? (view ? view.people.you.rooms > 1 : false)}
            gear={owner}
            oncollapse={() => fold(true)}
          />
        {/snippet}

        {#if people}
          <section aria-label="Here">
            <PeopleHeading label="Here" count={people.here.length + 1} actions={shortcuts} />
            {#each people.here as person (person.id)}
              <PersonRow
                name={person.name}
                reconnecting={person.reconnecting}
                followed={client?.following === person.id}
                screen={rowShare(person.id, "screen")}
                webcam={rowShare(person.id, "webcam")}
                onfollow={() => client?.follow(person.id)}
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
            <PeopleHeading label="Here" count={room.people.length + 1} actions={shortcuts} />
            {#each room.people as person (person.id)}
              <PersonRow
                name={person.name}
                reconnecting={person.reconnecting}
                followed={person.followed}
                screen={person.screen}
                webcam={person.webcam}
              />
            {/each}
            <PersonRow name={room.me} you />
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
              paired={mine.length > 1}
              watchers={view ? watchersOf({ member: view.people.you.id, kind: share.kind }) : []}
              audio={share.audio}
              notes={share.notes}
              stopping={share.state === "stopping"}
              onstop={() => client?.stop(share.kind)}
              onaudio={(on) => client?.setScreenAudio(on)}
            >
              <SharePreview kind={share.kind} stream={share.capture?.stream ?? null} />
            </OwnShare>
          {/each}
          {#if client?.handedOver.length}
            <div aria-live="polite">
              <SharerNote label="Dismiss" ondismiss={() => client?.dismissHandedOver()}>Now sharing from your other device.</SharerNote>
            </div>
          {/if}
          {#if client?.failed}
            <p class="text-muted-foreground px-0.5 pb-2 text-xs" role="status">
              Your {client.failed === "screen" ? "screen share" : "webcam"} didn't start. Try again.
            </p>
          {/if}
          {#if !askOnStage}{@render askFirst("foot")}{/if}
          <ShareButtons {...shareButtons} onscreen={() => shareScreen()} onwebcam={() => shareWebcam()} />
        {/snippet}
      </Bar>
    {/if}

    <Stage
      count={tiles.length}
      focused={focusedTile ? focusedShare : undefined}
      {strip}
      warning={budget === "80%" || budget === "95%" ? budgetWarning : undefined}
      reconnecting={client?.reconnecting ?? false}
    >
      {#each tiles as tile (tile.key)}
        {@render stageTile(tile, "grid")}
      {/each}
      {#snippet empty()}
        <!-- Until the room is known, the stage says only that it is loading. -->
        {#if room || view}<StageEmpty
            shares={others}
            {yoursLive}
            sharing={shareButtons}
            following={client?.following ? nameOf(client.following) : null}
            usedUp={budget === "used up"}
            owner={view?.people.you.owner ?? false}
            oneverything={() => client?.pick("everything")}
            onwatch={(share) => toggle(share.member, share.kind)}
            onscreen={() => shareScreen("stage")}
            onwebcam={() => shareWebcam("stage")}
            panel={askOnStage ? askFirstOnStage : undefined} />{:else}<Loading />{/if}
      {/snippet}
    </Stage>
  </div>
{/if}

<!-- What a press of a share button asks first: the first-time notice before the picker, or
     the offer to hand a share over. -->
{#snippet askFirst(place: PanelPlace)}
  {#if notice && client}
    <ScreenNotice {place} browser={client.browser} oncontinue={noticeRead} oncancel={() => (notice = false)} />
  {:else if offer}
    <HandOverOffer {place} kind={offer} oncontinue={handOver} oncancel={() => (offer = null)} />
  {/if}
{/snippet}

{#snippet askFirstOnStage()}{@render askFirst("stage")}{/snippet}

<!-- The watch shortcuts, at the right of the "Here" heading. -->
{#snippet shortcuts()}
  <Shortcuts picked={room ? room.picked : (client?.picked ?? null)} onpick={(what) => client?.pick(what)} />
{/snippet}

{#snippet budgetWarning()}
  {#if budget === "80%" || budget === "95%"}<BudgetStrip level={budget} owner={view?.people.you.owner ?? false} />{/if}
{/snippet}

{#snippet focusedShare()}
  {#if focusedTile}{@render stageTile(focusedTile, "focused")}{/if}
{/snippet}

{#snippet strip()}
  {#each tiles.filter((tile) => tile !== focusedTile) as tile (tile.key)}
    <li>{@render stageTile(tile, "strip")}</li>
  {/each}
{/snippet}

{#snippet stageTile(tile: Tile, place: "grid" | "focused" | "strip")}
  <StageTile
    name={tile.name}
    kind={tile.kind}
    videoOnly={tile.videoOnly}
    audio={audioOf(tile)}
    quality={tile.twoQualities && tile.share && client?.watches(tile.share)
      ? { value: client.quality(tile.share), onchoose: (quality) => tile.share && client?.chooseQuality(tile.share, quality) }
      : null}
    lower={tile.lower}
    {place}
    onstop={tile.share ? () => tile.share && client?.unwatch(tile.share) : undefined}
    onfocus={() => (focusedKey = tile.key)}
    onunfocus={() => (focusedKey = null)}
  >
    {#if tile.scene}
      <SampleScene scene={tile.scene} />
    {:else}
      <WatchedPicture
        name={tile.name}
        kind={tile.kind}
        stream={tile.stream ?? null}
        arriving={tile.arriving}
        onframe={() => tile.share && client?.shown(tile.share)}
        volume={tile.share ? hearing.volume(tile.share.member) : 100}
        muted={hearing.isMuted(tile.key)}
        small={place === "strip"}
      />
    {/if}
  </StageTile>
{/snippet}
