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

import {
  applyMessage,
  roomSocketPath,
  type ClientMessage,
  type LiveShare,
  type MediaChange,
  type RoomView,
  type ServerMessage,
  type ShareKind,
} from "../../shared/socket/index.ts";
import { sameShare } from "../../shared/socket/watching.ts";
import { getJson } from "./api.ts";
import { Connection } from "./connection.svelte.ts";
import { createMediaClient, type Capture } from "./media/index.ts";

/** What this tab receives of a share it watches. */
export interface Picture {
  share: LiveShare;
  /** The transceiver it arrives on. */
  video: string;
  /** The share's picture; null when there is none to show (the fake media client). */
  stream: MediaStream | null;
}

/** One of this tab's own shares, from the press of its button until it has ended. */
export interface OwnShare {
  kind: ShareKind;
  /** Starting: not live yet. Live: being sent. Stopping: stop was pressed, and the instance is closing it. */
  state: "starting" | "live" | "stopping";
  /** What is captured, once the browser has it. */
  capture: Capture | null;
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

  /** The signaling connection. */
  private readonly socket: Connection<ServerMessage>;
  private readonly media = createMediaClient();
  /** The tab's media connection, once asked for: whether it was made. */
  private connection: Promise<boolean> | null = null;
  /** Requests waiting for their answer in the media area, oldest first. */
  private readonly waiting: { accepts: (change: MediaChange) => boolean; lost: () => void }[] = [];
  /** Shares being asked for that the tab no longer wants: each is stopped once it is watched. */
  private unwanted: LiveShare[] = [];
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

  /**
   * Starts a webcam share from this tab: capture, the media connection the first time,
   * the offer, the instance's answer. One click, and no dialog of graeae's own.
   */
  async shareWebcam() {
    if (this.mine.some((share) => share.kind === "webcam")) return;
    this.failed = null;
    this.mine = [...this.mine, { kind: "webcam", state: "starting", capture: null }];
    let capture: Capture | null = null;
    try {
      capture = await this.media.captureWebcam();
      this.update("webcam", { capture });
      if (!(await this.connected())) throw new Error("no media connection");
      const live = await this.negotiate(async () => {
        const offer = await this.media.offer(capture!);
        const reply = this.answer(
          (change) => (change.type === "published" || change.type === "refused") && change.kind === "webcam",
        );
        this.send({ type: "shares", request: { type: "start", kind: "webcam", offer: offer.sdp, video: offer.video } });
        const answer = await reply;
        if (answer.type !== "published") return false;
        await this.media.accept(answer.answer);
        return true;
      });
      if (!live) throw new Error("the share was refused");
      this.update("webcam", { state: "live" });
    } catch {
      if (capture) this.media.stop(capture);
      this.mine = this.mine.filter((share) => share.kind !== "webcam");
      this.failed = "webcam";
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
    this.send({ type: "shares", request: { type: "stop", kind } });
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
    this.asking = [...this.asking, share];
    try {
      if (!(await this.connected())) return;
      await this.negotiate(async () => {
        const reply = this.answer(
          (change) => (change.type === "pulled" || change.type === "pull-refused") && sameShare(change.share, share),
        );
        this.send({ type: "watching", request: { type: "watch", share } });
        const pulled = await reply;
        if (pulled.type !== "pulled") return;
        const { answer, stream } = await this.media.pull(pulled.offer, pulled.video);
        this.pictures = [...this.pictures.filter((picture) => !sameShare(picture.share, share)), { share, video: pulled.video, stream }];
        const answered = this.answer((change) => change.type === "answered");
        this.send({ type: "media", request: { type: "answer", answer } });
        await answered;
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
    this.media.close();
    this.socket.close();
  }

  private receive(message: ServerMessage) {
    if (message.type === "media") {
      const index = this.waiting.findIndex((request) => request.accepts(message.change));
      if (index >= 0) this.waiting.splice(index, 1);
      return;
    }
    this.view = applyMessage(this.view, message);
    if (message.type === "shares" && message.change.type === "ended") this.ended(message.change.share);
    if (message.type === "watching" && message.change.type === "unwatched") this.unwatched(message.change.share);
    // A share the member followed starts: it joins the stage by itself.
    if (message.type === "shares" && message.change.type === "started" && message.change.share.member === this.following)
      void this.watch(message.change.share);
    // The member followed has left the room: the tab follows nobody.
    if (this.following && !this.view?.presence.present.includes(this.following)) this.following = null;
  }

  /** The instance closed this tab's pull of `share`: the tab lets go of its picture. */
  private unwatched(share: LiveShare) {
    const picture = this.pictures.find((candidate) => sameShare(candidate.share, share));
    if (!picture) return;
    this.media.drop(picture.video);
    this.pictures = this.pictures.filter((candidate) => candidate !== picture);
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
    if (own.capture) this.media.stop(own.capture);
    this.mine = this.mine.filter((candidate) => candidate !== own);
  }

  /** The tab's media connection, made the first time it is needed. False if it could not be made. */
  private connected(): Promise<boolean> {
    this.connection ??= (async () => {
      const reply = this.answer((change) => change.type === "connected" || change.type === "unavailable");
      this.send({ type: "media", request: { type: "connect" } });
      const change = await reply;
      if (change.type !== "connected") {
        this.connection = null;
        return false;
      }
      this.media.connect(change.iceServers);
      return true;
    })();
    return this.connection;
  }

  /** The next change in the media area that `matches`, which answers a request just sent. */
  private answer(matches: (change: MediaChange) => boolean): Promise<MediaChange> {
    return new Promise((resolve, reject) => {
      this.waiting.push({
        accepts: (change) => {
          if (!matches(change)) return false;
          resolve(change);
          return true;
        },
        lost: () => reject(new Error("the connection was lost")),
      });
    });
  }

  private send(message: ClientMessage) {
    this.socket.send(message);
  }

  private update(kind: ShareKind, patch: Partial<OwnShare>) {
    this.mine = this.mine.map((share) => (share.kind === kind ? { ...share, ...patch } : share));
  }

}
