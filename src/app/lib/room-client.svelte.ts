// The room client: the browser's side of the signaling connection. One per tab showing a
// room. It holds the whole room as the instance last sent it and applies each change as
// it arrives; the protocol is in `src/shared/socket/`. Its connection beats and
// reconnects by itself (`connection.svelte.ts`), and a reconnect brings the whole room.
//
// It also carries the tab's media connection's side of the conversation: it asks the
// instance for the connection the first time the tab shares or watches, passes offers
// and answers between the media client and the instance, one negotiation at a time, and
// keeps this tab's own shares and the pictures of what it watches. The media client
// never talks to the instance itself.
//
// A lost signaling connection does not touch the media connection: what the tab sends
// and watches keeps flowing while the socket reconnects. A reconnect within the grace
// period finds the same tab, and lets go of whatever ended meanwhile. A tab that comes
// back after its grace period ran out has lost its media connection with everything on
// it: it makes a new one, starts its shares again with the captures it still holds, and
// watches again what it watched, where those shares are still live.

import type { QualityName } from "../../shared/encoding.ts";
import {
  applyMessage,
  roomSocketPath,
  type ClientMessage,
  type LiveShare,
  type MediaChange,
  type MediaState,
  type QualityChoice,
  type RoomView,
  type ServerMessage,
  type ShareKind,
  type SharesRequest,
} from "../../shared/socket/index.ts";
import { qualityOf, sameShare } from "../../shared/socket/watching.ts";
import { getJson } from "./api.ts";
import { Connection } from "./connection.svelte.ts";
import { createMediaClient, type BrowserFamily, type Capture, type Offer } from "./media/index.ts";

/** What this tab receives of a share it watches. */
export interface Picture {
  share: LiveShare;
  /** The transceiver it arrives on. */
  video: string;
  /** The share's picture; null when there is none to show (the fake media client). */
  stream: MediaStream | null;
  /** The quality it arrives at, from the frames received; null before the first. */
  received: QualityName | null;
}

/** One of this tab's own shares, from the press of its button until it has ended. */
export interface OwnShare {
  kind: ShareKind;
  /** Starting: not live yet. Live: being sent. Stopping: stop was pressed, and the instance is closing it. */
  state: "starting" | "live" | "stopping";
  /** What is captured, once the browser has it. */
  capture: Capture | null;
  /**
   * A screen share's screen audio: on, or turned off by the sharer. Null when the share
   * has no sound: a webcam, or a screen share that ended up video only.
   */
  audio: "on" | "off" | null;
}

export class RoomClient {
  /** The room as the instance last described it, or null until the first full state. */
  view = $state<RoomView | null>(null);
  /** This tab's own shares. Another tab's or device's shares of yours are only in `view`. */
  mine = $state.raw<OwnShare[]>([]);
  /** The kind of share that last failed to start, until the next attempt. */
  failed = $state<ShareKind | null>(null);
  /** The pictures of the shares this tab watches. Whether a share is on the stage is `view`'s to say. */
  pictures = $state.raw<Picture[]>([]);
  /** Shares this tab has asked to watch, until the instance has answered. */
  asking = $state.raw<LiveShare[]>([]);
  /**
   * The member this tab follows: it watches everything they share, and a share they
   * start later joins the stage by itself. Null when it follows nobody.
   */
  following = $state<string | null>(null);
  /** Qualities this tab has chosen for shares it watches, until the instance answers. */
  choosing = $state.raw<{ share: LiveShare; quality: QualityChoice }[]>([]);

  /** The signaling connection. */
  private readonly socket: Connection<ServerMessage>;
  private readonly media = createMediaClient();
  /** The tab's media connection, once asked for: whether it was made. */
  private connection: Promise<boolean> | null = null;
  /** Whether the tab's media connection is made: the instance handed it over. */
  private made = false;
  /** Whether the media connection falters, as the media client last said. */
  private faltering = false;
  /** Captures the browser ended by itself while their share was starting, to stop once it is live. */
  private readonly over = new WeakSet<Capture>();
  /** Requests waiting for their answer in the media area, oldest first. */
  private readonly waiting: { accepts: (change: MediaChange) => boolean; lost: () => void }[] = [];
  /** Shares being asked for that the tab no longer wants: each is stopped once it is watched. */
  private unwanted: LiveShare[] = [];
  /** Shares on the stage whose pull never reached the tab: each is watched again once its watch is closed. */
  private rewatch: LiveShare[] = [];
  /** The qualities a stage rebuilt after the grace period was watched at: each is chosen again once its share is watched. */
  private restoring: { share: LiveShare; quality: QualityChoice }[] = [];
  /** How to stop listening for the quality each watched share arrives at, by its video's mid. Nothing renders from it. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state: only the room client reads it
  private readonly listening = new Map<string, () => void>();
  /** The negotiation under way on the media connection, which the next one waits for. */
  private negotiating: Promise<unknown> = Promise.resolve();

  constructor(address: string) {
    this.socket = new Connection<ServerMessage>({
      path: roomSocketPath(address),
      receive: (message) => this.receive(message),
      // A refusal is the "nothing here" answer; a failed request is no answer.
      refused: async () => (await getJson(`/api/rooms/${encodeURIComponent(address)}`)) === null,
      // An answer the lost socket never got will not come on the next one.
      lost: () => {
        for (const request of this.waiting.splice(0)) request.lost();
      },
    });
  }

  /** Whether the instance refused this tab the room, so the page shows "nothing here". */
  get refused(): boolean {
    return this.socket.refused;
  }

  /** Whether the instance has gone unheard for about 3 seconds, while the connection reconnects. */
  get reconnecting(): boolean {
    return this.socket.reconnecting;
  }

  /** The browser family this tab runs in, which decides what the first-time notice says. */
  get browser(): BrowserFamily {
    return this.media.browser;
  }

  /** Starts a webcam share from this tab. One click, and no dialog of graeae's own. */
  shareWebcam() {
    return this.share("webcam", () => this.media.captureWebcam());
  }

  /**
   * Starts a screen share from this tab: straight to the browser's picker, and live once
   * the member has picked. Closing the picker shares nothing and says nothing.
   */
  shareScreen() {
    return this.share("screen", () => this.media.captureScreen());
  }

  /** Turns the sound of this tab's live screen share on or off, without stopping it. */
  setScreenAudio(on: boolean) {
    const share = this.mine.find((own) => own.kind === "screen");
    if (!share?.capture || share.audio === null) return;
    this.media.setAudio(share.capture, on);
    this.update("screen", { audio: on ? "on" : "off" });
  }

  /**
   * Starts a share of `kind` from this tab: capture, then `publish`. A capture the
   * browser ends by itself (its "stop sharing" bar, the shared tab closing) stops the
   * share.
   */
  private async share(kind: ShareKind, captured: () => Promise<Capture | null>) {
    if (this.mine.some((share) => share.kind === kind)) return;
    this.failed = null;
    this.mine = [...this.mine, { kind, state: "starting", capture: null, audio: null }];
    let capture: Capture | null;
    try {
      capture = await captured();
    } catch {
      this.mine = this.mine.filter((share) => share.kind !== kind);
      this.failed = kind;
      return;
    }
    if (!capture) {
      this.mine = this.mine.filter((share) => share.kind !== kind);
      return;
    }
    const own = capture;
    void own.ended.then(() => {
      const share = this.mine.find((candidate) => candidate.capture === own);
      if (share?.state === "live") this.stop(kind);
      else if (share) this.over.add(own);
    });
    this.update(kind, { capture, audio: capture.audio ? "on" : null });
    await this.publish(kind, own);
  }

  /**
   * Sends `capture` as this tab's share of `kind`, which is starting: the media
   * connection the first time, the offer, the instance's answer. On a failure the
   * capture stops and the share is gone, and the page says it didn't start.
   */
  private async publish(kind: ShareKind, capture: Capture) {
    try {
      if (!(await this.connected())) throw new Error("no media connection");
      const live = await this.negotiate(async () => {
        const offer = await this.media.offer(capture);
        const answer = await this.request(
          // A share that starts again by itself sends the browser family too, through here.
          { type: "shares", request: startRequest(kind, offer, this.media.browser) },
          (change) => (change.type === "published" || change.type === "refused") && change.kind === kind,
        );
        if (answer.type !== "published") return false;
        await this.media.accept(answer.answer);
        return true;
      });
      if (!live) throw new Error("the share was refused");
      this.update(kind, { state: "live" });
      // The browser ended it while it was starting: it stops now that it can.
      if (this.over.has(capture)) this.stop(kind);
    } catch {
      this.media.stop(capture);
      this.mine = this.mine.filter((share) => share.capture !== capture);
      this.failed = kind;
    }
  }

  /**
   * Stops this tab's share of `kind`. The capture stops at once; the share stays listed
   * as stopping until the instance says it has ended for everyone.
   */
  stop(kind: ShareKind) {
    const share = this.mine.find((own) => own.kind === kind);
    if (share?.state !== "live") return;
    if (share.capture) this.media.stop(share.capture);
    this.update(kind, { state: "stopping" });
    // Sent again on the next socket if this one is lost.
    this.send({ type: "shares", request: { type: "stop", kind } });
  }

  /**
   * The quality this tab watches `share` at: the one it just chose, until the instance
   * answers, or the one the instance says.
   */
  quality(share: LiveShare): QualityChoice {
    const chosen = this.choosing.find((candidate) => sameShare(candidate.share, share));
    if (chosen) return chosen.quality;
    return this.view ? qualityOf(this.view.watching, share) : "auto";
  }

  /**
   * Watches `share`, a share this tab watches that goes out at two qualities, at
   * `quality`: "Auto", "1080p" or "720p". The instance sets it on the media server
   * mid-watch, and says which quality the tab then watches at.
   */
  chooseQuality(share: LiveShare, quality: QualityChoice) {
    if (!this.watches(share) || this.quality(share) === quality) return;
    share = { member: share.member, kind: share.kind };
    this.choosing = [...this.choosing.filter((candidate) => !sameShare(candidate.share, share)), { share, quality }];
    this.send({ type: "watching", request: { type: "quality", share, quality } });
  }

  /** Whether this tab watches `share`: it is on the tab's stage. */
  watches(share: LiveShare): boolean {
    return !!this.view?.watching.stage.some((watched) => sameShare(watched, share));
  }

  /**
   * Watches `share` if this tab does not, and stops watching it if it does: a click on
   * its icon. The rest of the stage stays as it is, and the tab follows nobody.
   */
  toggle(share: LiveShare) {
    this.following = null;
    if (this.wants(share)) this.drop(share);
    else void this.watch(share);
  }

  /**
   * Follows `member`: the stage becomes everything they share, now and later. Following
   * the member already watched alone changes nothing.
   */
  follow(member: string) {
    this.following = member;
    this.only((share) => share.member === member);
  }

  /**
   * A one-off pick of what others share in the room: every webcam, everything, or
   * nothing. The stage becomes exactly that, and the tab follows nobody.
   */
  pick(what: "webcams" | "everything" | "nothing") {
    this.following = null;
    const you = this.view?.people.you.id;
    this.only(
      (share) => what !== "nothing" && share.member !== you && (what === "everything" || share.kind === "webcam"),
    );
  }

  /**
   * Watches `share` on this tab: the media connection the first time, the instance's
   * pull and the media server's offer, the browser's answer. The share is on the stage
   * once the instance says `watched`. A refused watch leaves the stage as it was.
   */
  private async watch(share: LiveShare) {
    this.unwanted = this.unwanted.filter((candidate) => !sameShare(candidate, share));
    if (this.watches(share) || this.asking.some((asked) => sameShare(asked, share))) return;
    // Asked for by its name alone, whatever else the room's list says of it.
    share = { member: share.member, kind: share.kind };
    this.asking = [...this.asking, share];
    try {
      if (!(await this.connected())) return;
      await this.negotiate(async () => {
        const pulled = await this.request(
          { type: "watching", request: { type: "watch", share } },
          (change) => (change.type === "pulled" || change.type === "pull-refused") && sameShare(change.share, share),
        );
        if (pulled.type !== "pulled") return;
        const { answer, stream } = await this.media.pull(pulled.offer, pulled.video, pulled.audio);
        this.pictures = [
          ...this.pictures.filter((picture) => !sameShare(picture.share, share)),
          { share, video: pulled.video, stream, received: null },
        ];
        this.listen(share, pulled.video);
        await this.request({ type: "media", request: { type: "answer", answer } }, (change) => change.type === "answered");
      });
    } catch {
      // The connection was lost on the way: the stage comes back with the room's state.
    } finally {
      // Let go of a share the tab stopped wanting on the way, now that its negotiation is done.
      const unwanted = this.unwanted.some((candidate) => sameShare(candidate, share));
      this.asking = this.asking.filter((asked) => !sameShare(asked, share));
      this.unwanted = this.unwanted.filter((candidate) => !sameShare(candidate, share));
      if (unwanted) this.drop(share);
    }
  }

  /**
   * Stops watching `share` on this tab, and follows nobody: "stop watching" on the share.
   * It leaves the stage once the instance has closed its pull.
   */
  unwatch(share: LiveShare) {
    this.following = null;
    this.drop(share);
  }

  /** Makes the stage the live shares `keep` chooses: watches those it lacks and stops the rest. */
  private only(keep: (share: LiveShare) => boolean) {
    for (const share of [...(this.view?.watching.stage ?? []), ...this.asking]) if (!keep(share)) this.drop(share);
    for (const share of this.view?.shares.live ?? []) if (keep(share)) void this.watch(share);
  }

  /** Whether this tab watches `share` or is asking to, and still wants it. */
  private wants(share: LiveShare): boolean {
    const asked = this.asking.some((candidate) => sameShare(candidate, share));
    return (this.watches(share) || asked) && !this.unwanted.some((candidate) => sameShare(candidate, share));
  }

  /**
   * Stops watching `share`. One still being asked for is let go of once the instance
   * says it is watched, since its pull is under way.
   */
  private drop(share: LiveShare) {
    if (this.watches(share)) this.send({ type: "watching", request: { type: "unwatch", share } });
    else if (this.wants(share)) this.unwanted = [...this.unwanted, share];
  }

  /** Leaves the room: the instance ends this tab's presence, and what it shares, at once. */
  close() {
    for (const stop of this.listening.values()) stop();
    this.listening.clear();
    this.media.close();
    this.socket.close();
  }

  private receive(message: ServerMessage) {
    if (message.type === "media") {
      // Its media faltered too long and the instance let go of it: the next share or watch makes a new one.
      if (message.change.type === "dropped") {
        this.resetMedia();
        return;
      }
      const index = this.waiting.findIndex((request) => request.accepts(message.change));
      if (index >= 0) this.waiting.splice(index, 1);
      return;
    }
    const before = this.view;
    this.view = applyMessage(this.view, message);
    if (message.type === "state" && before) this.rejoined(before, message.media);
    if (message.type === "shares" && message.change.type === "ended") this.ended(message.change.share);
    if (message.type === "watching" && message.change.type === "unwatched") this.unwatched(message.change.share);
    // The instance has answered a choice of quality, or the share left the stage. A whole
    // new state after a reconnect answers every choice whose answer was lost with the socket.
    if (message.type === "state") this.choosing = [];
    if (message.type === "watching" && (message.change.type === "quality" || message.change.type === "unwatched")) {
      const { share } = message.change;
      this.choosing = this.choosing.filter((candidate) => !sameShare(candidate.share, share));
    }
    // A share of a rebuilt stage is watched again: back to the quality it was watched at.
    if (message.type === "watching" && message.change.type === "watched") {
      const { share } = message.change;
      const restored = this.restoring.find((candidate) => sameShare(candidate.share, share));
      this.restoring = this.restoring.filter((candidate) => candidate !== restored);
      if (restored) this.chooseQuality(share, restored.quality);
    }
    // A share the member followed starts: it joins the stage by itself.
    if (message.type === "shares" && message.change.type === "started" && message.change.share.member === this.following)
      void this.watch(message.change.share);
    // The member followed has left the room: the tab follows nobody.
    if (this.following && !this.view?.presence.present.includes(this.following)) this.following = null;
  }

  /**
   * A new socket brought the whole room again, after the tab held `before`. The same tab,
   * back within its grace period, lets go of what ended while it was away. A tab whose
   * grace period ran out finds its media connection gone with everything on it, and
   * builds it again: its shares start again with the captures it still holds, unless a
   * share of that kind of the member's went live meanwhile from elsewhere, and it
   * watches again what it watched, where those shares are still live. Nobody who watched
   * its shares before is carried over: for them those shares ended.
   */
  private rejoined(before: RoomView, media: MediaState) {
    const view = this.view!;
    const you = view.people.you.id;
    const liveOfYours = (kind: ShareKind) =>
      view.shares.live.some((share) => share.member === you && share.kind === kind);

    if (media.connected || !this.made) {
      for (const picture of this.pictures) if (!this.watches(picture.share)) this.unwatched(picture.share);
      for (const own of this.mine) {
        if (own.state === "starting") continue;
        if (!liveOfYours(own.kind)) this.tidy(own);
        // A stop the lost socket never carried.
        else if (own.state === "stopping") this.send({ type: "shares", request: { type: "stop", kind: own.kind } });
      }
      if (!this.made) return;
      // A watch whose pull the lost socket never brought is on the stage with no picture: ask again.
      for (const share of view.watching.stage) {
        if (this.pictures.some((picture) => sameShare(picture.share, share))) continue;
        this.rewatch = [...this.rewatch, share];
        this.send({ type: "watching", request: { type: "unwatch", share } });
      }
      // The instance may have missed the media connection faltering or recovering.
      this.send({ type: "media", request: { type: this.faltering ? "faltering" : "recovered" } });
      return;
    }

    this.resetMedia();
    this.pictures = [];
    // A watch at a chosen quality goes back to it once watched again; a new watch would be at Auto.
    this.restoring = before.watching.qualities;
    for (const own of this.mine) {
      // One still starting finds the new connection by itself.
      if (own.state === "starting") continue;
      if (own.state === "live" && own.capture && !liveOfYours(own.kind)) {
        this.update(own.kind, { state: "starting" });
        void this.publish(own.kind, own.capture);
      } else {
        this.tidy(own);
      }
    }
    if (this.following) this.follow(this.following);
    else
      for (const share of before.watching.stage)
        if (view.shares.live.some((live) => sameShare(live, share))) void this.watch(share);
  }

  /** The instance closed this tab's pull of `share`: the tab lets go of its picture. */
  private unwatched(share: LiveShare) {
    const picture = this.pictures.find((candidate) => sameShare(candidate.share, share));
    if (picture) {
      this.listening.get(picture.video)?.();
      this.listening.delete(picture.video);
      this.media.drop(picture.video);
      this.pictures = this.pictures.filter((candidate) => candidate !== picture);
    }
    if (this.rewatch.some((candidate) => sameShare(candidate, share))) {
      this.rewatch = this.rewatch.filter((candidate) => !sameShare(candidate, share));
      void this.watch(share);
    }
  }

  /** Keeps the picture of `share`, arriving on `video`, told of the quality it arrives at. */
  private listen(share: LiveShare, video: string) {
    this.listening.get(video)?.();
    const stop = this.media.received(video, (received) => {
      this.pictures = this.pictures.map((picture) =>
        picture.video === video && sameShare(picture.share, share) ? { ...picture, received } : picture,
      );
    });
    this.listening.set(video, stop);
  }

  /** Runs `negotiation` on the media connection once every earlier one is done. */
  private negotiate<T>(negotiation: () => Promise<T>): Promise<T> {
    const turn = this.negotiating.then(negotiation);
    this.negotiating = turn.catch(() => undefined);
    return turn;
  }

  /** A share ended. If it was this tab's own, the tab tidies its side. */
  private ended(share: LiveShare) {
    if (share.member !== this.view?.people.you.id) return;
    const own = this.mine.find((candidate) => candidate.kind === share.kind && candidate.state !== "starting");
    if (!own) return;
    this.tidy(own);
  }

  /** Stops `own`'s capture and forgets the share. */
  private tidy(own: OwnShare) {
    if (own.capture) this.media.stop(own.capture);
    this.mine = this.mine.filter((candidate) => candidate !== own);
  }

  /** Lets go of the media connection, keeping the captures: the next share or watch makes a new one. */
  private resetMedia() {
    for (const stop of this.listening.values()) stop();
    this.listening.clear();
    this.media.reset();
    this.connection = null;
    this.made = false;
    this.faltering = false;
  }

  /** The tab's media connection, made the first time it is needed. False if it could not be made. */
  private connected(): Promise<boolean> {
    this.connection ??= (async () => {
      const change = await this.request(
        { type: "media", request: { type: "connect" } },
        (change) => change.type === "connected" || change.type === "unavailable",
      );
      if (change.type !== "connected") {
        this.connection = null;
        return false;
      }
      this.media.connect(change.iceServers, (faltering) => this.falter(faltering));
      this.made = true;
      return true;
    })().catch(() => {
      // The socket was lost before the answer came: the next share or watch asks again.
      this.connection = null;
      return false;
    });
    return this.connection;
  }

  /** The media connection falters, or recovers: the instance gives this tab's shares 30 seconds. */
  private falter(faltering: boolean) {
    this.faltering = faltering;
    this.send({ type: "media", request: { type: faltering ? "faltering" : "recovered" } });
  }

  /**
   * Sends `message` and gives the next change in the media area that `matches`, which
   * answers it. Fails at once when the connection is lost and the message could not go.
   */
  private request(message: ClientMessage, matches: (change: MediaChange) => boolean): Promise<MediaChange> {
    const reply = new Promise<MediaChange>((resolve, reject) => {
      this.waiting.push({
        accepts: (change) => {
          if (!matches(change)) return false;
          resolve(change);
          return true;
        },
        lost: () => reject(new Error("the connection was lost")),
      });
    });
    if (!this.socket.send(message)) this.waiting.pop()?.lost();
    return reply;
  }

  private send(message: ClientMessage) {
    this.socket.send(message);
  }

  private update(kind: ShareKind, patch: Partial<OwnShare>) {
    this.mine = this.mine.map((share) => (share.kind === kind ? { ...share, ...patch } : share));
  }
}

/** What the page sends to start a share of `kind` with `offer`. */
/**
 * What the page sends to start a share of `kind` with `offer`. A screen share says the
 * browser family sending it, whose encoding plan says how many qualities it goes out at.
 */
function startRequest(kind: ShareKind, offer: Offer, browser: BrowserFamily): SharesRequest {
  if (kind === "webcam") return { type: "start", kind, offer: offer.sdp, video: offer.video };
  const audio = offer.audio ? { audio: offer.audio } : {};
  return { type: "start", kind, offer: offer.sdp, video: offer.video, browser, ...audio };
}
