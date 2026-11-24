// The room client: the browser's side of the signaling connection. One per tab showing a
// room. It holds the whole room as the instance last sent it and applies each change as
// it arrives; the protocol is in `src/shared/socket/`. Its connection beats and
// reconnects by itself (`connection.svelte.ts`), and a reconnect brings the whole room.
//
// It also carries the side of the conversation about the tab's two media connections
// (ADR 0005): it asks the instance for the sending connection the first time the tab
// shares, and for the receiving connection the first time it watches, passes offers and
// answers between the media client and the instance, one negotiation at a time on each,
// and keeps this tab's own shares and the pictures of what it watches. The media client
// never talks to the instance itself.
//
// A lost signaling connection does not touch the media connections: what the tab sends
// and watches keeps flowing while the socket reconnects. A reconnect within the grace
// period finds the same tab, and lets go of whatever ended meanwhile. A tab that comes
// back after its grace period ran out has lost its media connections with everything on
// them: it makes new ones, starts its shares again with the captures it still holds, and
// watches again what it watched, where those shares are still live.
//
// Once the tab has its receiving connection it reports, once a minute, what that
// connection's transport has received since it opened, for the usage count
// (`usage-reports.ts`); the sending connection reports nothing. A receiving connection
// the instance dropped, or that is replaced, sends its final total first. One lost with
// the grace period sends none: the instance has already charged it, and the tab is a new
// one there.
//
// The browser giving up a connection is answered per connection: the sending one is
// restarted in place, keeping every share; the receiving one is replaced by a new one,
// onto which the instance pulls every watch again before closing the old pulls.
//
// 11 hours after a connection's relay credential was minted, the instance hands it a
// fresh one. On a direct path the tab takes it silently. On the relay a sending
// connection restarts with it, and if that fails, reconnects the ordinary way on the
// same socket: the instance ends its shares, and the tab makes a new one and starts its
// shares again; a receiving connection on the relay is replaced.

import type { QualityName } from "../../shared/encoding.ts";
import {
  applyMessage,
  roomSocketPath,
  type ClientMessage,
  type IceServer,
  type LiveShare,
  type MediaChange,
  type MediaPurpose,
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
import { tabLog } from "./log.ts";
import {
  createMediaClient,
  type BrowserFamily,
  type Capture,
  type MediaClient,
  type MediaHealth,
  type Offer,
} from "./media/index.ts";
import { renewal } from "./media/renewal.ts";
import type { SharerNotes } from "./media/sending.ts";
import { UsageReports } from "./usage-reports.ts";

/** The wait between a restart of a failed media connection that found no path and the next. */
const RESTART_AGAIN_MS = 2_000;

/** The two purposes of the tab's media connections, in the order a rebuild makes them again. */
const PURPOSES: readonly MediaPurpose[] = ["sending", "receiving"];

/** What the room client holds of one of the tab's media connections. */
interface Side {
  /** The connection, once asked for: whether it was made. */
  asked: Promise<boolean> | null;
  /** Whether it is made: the instance handed it over. */
  made: boolean;
  /** How it is doing, as the media client last said. */
  health: MediaHealth;
  /** Whether the tab is bringing back a connection the browser gave up on (`recover`). */
  recovering: boolean;
  /** The relay credential it holds: the one it was made with, or the last fresh one. */
  iceServers: IceServer[];
}

function newSide(): Side {
  return { asked: null, made: false, health: "fine", recovering: false, iceServers: [] };
}

/** A one-off pick of what others share: every webcam, everything, or nothing. */
export type Shortcut = "webcams" | "everything" | "nothing";

/** The picks in the order `picked` tries them, so an empty stage reads as "nothing". */
const PICKED_FIRST: readonly Shortcut[] = ["nothing", "everything", "webcams"];

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
  /** What only the sharer is told of it, from its statistics, once it is live. */
  notes: SharerNotes | null;
}

export class RoomClient {
  /** The room as the instance last described it, or null until the first full state. */
  view = $state<RoomView | null>(null);
  /** This tab's own shares. Another tab's or device's shares of yours are only in `view`. */
  mine = $state.raw<OwnShare[]>([]);
  /** The kind of share that last failed to start, until the next attempt. */
  failed = $state<ShareKind | null>(null);
  /**
   * The kinds of share this tab sent until the member started them from another tab or
   * device instead, until dismissed or shared from here again: the page says so.
   */
  handedOver = $state.raw<ShareKind[]>([]);
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
  /**
   * The tab this page is on the instance, as the last full state said. A new socket names
   * it, so a page back within its grace period is the same tab even while the instance
   * still holds its old socket open.
   */
  private tab: string | undefined;
  private readonly media = createMediaClient();
  /** The tab's two media connections, each made the first time it is needed. */
  private readonly sides: Record<MediaPurpose, Side> = { sending: newSide(), receiving: newSide() };
  /** A replacement of the receiving connection cut short by the lost socket: asked for again on the next. */
  private replaceAgain = false;
  /**
   * How many times the receiving connection has been replaced, counted once the instance
   * has made the new one: a `moved` that arrived before that was meant for the old one.
   */
  private replacements = 0;
  /** Captures the browser ended by itself while their share was starting, to stop once it is live. */
  private readonly over = new WeakSet<Capture>();
  /** Requests waiting for their answer in the media area, oldest first. */
  private readonly waiting: { accepts: (change: MediaChange) => boolean; lost: () => void }[] = [];
  /** Shares being asked for that the tab no longer wants: each is stopped once it is watched. */
  private unwanted = $state.raw<LiveShare[]>([]);
  /** Shares on the stage the tab has asked to stop watching, until the instance has closed their pull. */
  private leaving = $state.raw<LiveShare[]>([]);
  /**
   * Shares on the stage to watch afresh once their watch is closed: one whose pull never
   * reached the tab, or one chosen again while it was leaving.
   */
  private rewatch = $state.raw<LiveShare[]>([]);
  /** When each share being asked for was asked for, by its key, to time its arrival (`timed`). */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state: only the room client reads it
  private readonly askedAt = new Map<string, number>();
  /** The qualities a stage rebuilt after the grace period was watched at: each is chosen again once its share is watched. */
  private restoring: { share: LiveShare; quality: QualityChoice }[] = [];
  /** How to stop listening for the quality each watched share arrives at, by its key. Nothing renders from it. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state: only the room client reads it
  private readonly listening = new Map<string, () => void>();
  /** The negotiation under way on each media connection, which the next one on it waits for. */
  private readonly negotiating: Record<MediaPurpose, Promise<unknown>> = { sending: Promise.resolve(), receiving: Promise.resolve() };
  /** The usage reports, once the receiving connection is made. */
  private readonly usage = new UsageReports(
    () => this.media.transport(),
    (request) => this.send({ type: "usage", request }),
    () => this.synced,
    () => this.media.reportEvery,
  );
  /**
   * Whether this socket has brought the room's state. Until it has, the tab may be a new
   * one on the instance, its grace period run out, and a report of the old receiving
   * connection's total would be charged to it in full again.
   */
  private synced = false;
  /** Whether the tab is making its sending connection again after a failed restart: the stage says it is reconnecting. */
  private rebuilding = $state(false);
  /** The captures of this tab's shares being carried to a new sending connection: their ending on the old one keeps them. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state: only the room client reads it
  private readonly carrying = new Set<Capture>();

  constructor(address: string) {
    this.socket = new Connection<ServerMessage>({
      kind: "room",
      path: () => roomSocketPath(address, this.tab),
      receive: (message) => this.receive(message),
      // A refusal is the "nothing here" answer; a failed request is no answer.
      refused: async () => (await getJson(`/api/rooms/${encodeURIComponent(address)}`)) === null,
      // An answer the lost socket never got will not come on the next one.
      lost: () => {
        this.synced = false;
        for (const request of this.waiting.splice(0)) request.lost();
      },
    });
  }

  /** Whether the instance refused this tab the room, so the page shows "nothing here". */
  get refused(): boolean {
    return this.socket.refused;
  }

  /**
   * Whether the tab is reconnecting: the instance has gone unheard for about 3 seconds
   * while the connection reconnects, or the sending connection is being made again.
   */
  get reconnecting(): boolean {
    return this.socket.reconnecting || this.rebuilding;
  }

  /** The browser family this tab runs in, which decides what the first-time notice says. */
  get browser(): BrowserFamily {
    return this.media.browser;
  }

  /**
   * Starts a webcam share from this tab. One click, and no dialog of graeae's own. With
   * `handOver`, a webcam of the member's live from another tab or device stops there and
   * this one replaces it.
   */
  shareWebcam({ handOver = false } = {}) {
    return this.share("webcam", () => this.media.captureWebcam(), handOver);
  }

  /**
   * Starts a screen share from this tab: straight to the browser's picker, and live once
   * the member has picked. Closing the picker shares nothing and says nothing.
   */
  shareScreen({ handOver = false } = {}) {
    return this.share("screen", () => this.media.captureScreen(), handOver);
  }

  /** The page has said that this tab's shares were handed over: it says so no more. */
  dismissHandedOver() {
    this.handedOver = [];
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
  private async share(kind: ShareKind, captured: () => Promise<Capture | null>, handOver: boolean) {
    if (this.mine.some((share) => share.kind === kind)) return;
    this.failed = null;
    this.handedOver = this.handedOver.filter((handed) => handed !== kind);
    this.mine = [...this.mine, { kind, state: "starting", capture: null, audio: null, notes: null }];
    tabLog.info("share.asked", { kind, handOver });
    tabLog.info("capture.asked", { kind });
    let capture: Capture | null;
    try {
      capture = await captured();
    } catch (error) {
      tabLog.warn("capture.refused", { kind, error });
      this.mine = this.mine.filter((share) => share.kind !== kind);
      this.failed = kind;
      tabLog.warn("share.failed", { kind, why: "capture refused" });
      return;
    }
    if (!capture) {
      tabLog.info("capture.refused", { kind, why: "the picker was closed" });
      this.mine = this.mine.filter((share) => share.kind !== kind);
      return;
    }
    tabLog.info("capture.granted", { kind, audio: capture.audio });
    const own = capture;
    void own.ended.then(() => {
      tabLog.info("capture.ended", { kind, by: "the browser" });
      const share = this.mine.find((candidate) => candidate.capture === own);
      if (share?.state === "live") this.stop(kind);
      else if (share) this.over.add(own);
    });
    this.update(kind, { capture, audio: capture.audio ? "on" : null });
    await this.publish(kind, own, handOver);
  }

  /**
   * Sends `capture` as this tab's share of `kind`, which is starting: the sending
   * connection the first time, the offer, the instance's answer. On a failure the
   * capture stops and the share is gone, and the page says it didn't start. With
   * `handOver`, the member's share of that kind live elsewhere is replaced by this one.
   */
  private async publish(kind: ShareKind, capture: Capture, handOver = false) {
    try {
      if (!(await this.connected("sending"))) throw new Error("no sending connection");
      const live = await this.negotiate("sending", async () => {
        const offer = await this.media.offer(capture);
        tabLog.info("share.offered", { kind, offer: offer.sdp, video: offer.video, ...(offer.audio ? { audio: offer.audio } : {}) });
        const answer = await this.request(
          // A share that starts again by itself sends the browser family too, through here.
          { type: "shares", request: startRequest(kind, offer, this.media, handOver) },
          (change) => (change.type === "published" || change.type === "refused") && change.kind === kind,
        );
        if (answer.type !== "published") return false;
        await this.media.accept(answer.answer);
        return true;
      });
      if (!live) throw new Error("the share was refused");
      tabLog.info("share.confirmed", { kind });
      this.update(kind, { state: "live" });
      this.media.notes(capture, (notes) => {
        this.mine = this.mine.map((share) => (share.capture === capture ? { ...share, notes } : share));
      });
      // The browser ended it while it was starting: it stops now that it can.
      if (this.over.has(capture)) this.stop(kind);
    } catch (error) {
      tabLog.warn("share.failed", { kind, error });
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
    tabLog.info("share.stopped", { kind });
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
    tabLog.info("quality.chosen", { share, quality });
    this.choosing = [...this.choosing.filter((candidate) => !sameShare(candidate.share, share)), { share, quality }];
    this.send({ type: "watching", request: { type: "quality", share, quality } });
  }

  /** Whether this tab watches `share`: the instance has it on the tab's stage. */
  watches(share: LiveShare): boolean {
    return !!this.view?.watching.stage.some((watched) => sameShare(watched, share));
  }

  /**
   * Whether `share` is on this tab's stage as the member last chose it: watched or asked
   * for, and not let go of since. The page shows this from the click on, while the
   * instance and the media server catch up.
   */
  wants(share: LiveShare): boolean {
    const has = (list: LiveShare[]) => list.some((candidate) => sameShare(candidate, share));
    if (has(this.rewatch)) return true;
    if (has(this.unwanted) || has(this.leaving)) return false;
    return this.watches(share) || has(this.asking);
  }

  /**
   * The shares on this tab's stage as the member chose them (`wants`): those the instance
   * has on it, in the order it began watching them, then those still being asked for.
   */
  get staged(): LiveShare[] {
    const stage = this.view?.watching.stage ?? [];
    const asked = this.asking.filter((share) => !stage.some((watched) => sameShare(watched, share)));
    return [...stage, ...asked].filter((share) => this.wants(share));
  }

  /**
   * The page has shown the first frame of `share`'s picture: the end of its arrival, for
   * the timings a watch leaves in the browser's performance timeline (`timed`).
   */
  shown(share: LiveShare) {
    const asked = this.askedAt.get(keyOf(share));
    tabLog.info("watch.shown", { share, ...(asked === undefined ? {} : { ms: Math.round(performance.now() - asked) }) });
    this.timed(share, "first frame");
    this.askedAt.delete(keyOf(share));
  }

  /**
   * Watches `share` if this tab does not, and stops watching it if it does: a click on
   * its icon. The rest of the stage stays as it is, and the tab follows nobody. Either
   * shows at once (`wants`).
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
  pick(what: Shortcut) {
    this.following = null;
    this.only(this.chooses(what));
  }

  /**
   * The one-off pick the stage holds as the member chose it (`staged`), from the click
   * on: "nothing" while it is empty, and "everything" over "webcams" while only webcams
   * are live. Null while it holds anything else, such as a share started since, and
   * while the tab follows a member, whose stage is about a person even when empty.
   */
  get picked(): Shortcut | null {
    if (this.following) return null;
    const staged = this.staged;
    const live = this.view?.shares.live ?? [];
    const holds = (what: Shortcut) => {
      const chosen = live.filter(this.chooses(what));
      return chosen.length === staged.length && chosen.every((share) => staged.some((on) => sameShare(on, share)));
    };
    return PICKED_FIRST.find(holds) ?? null;
  }

  /** Which live shares a pick puts on the stage. */
  private chooses(what: Shortcut): (share: LiveShare) => boolean {
    const you = this.view?.people.you.id;
    return (share) => what !== "nothing" && share.member !== you && (what === "everything" || share.kind === "webcam");
  }

  /**
   * Watches `share` on this tab: the receiving connection the first time, the instance's
   * pull and the media server's offer, the browser's answer. The share is on the stage
   * once the instance says `watched`. A refused watch leaves the stage as it was. One
   * asked for while the receiving connection is being replaced waits until it is done.
   */
  private async watch(share: LiveShare) {
    if (this.unwanted.some((candidate) => sameShare(candidate, share)))
      this.unwanted = this.unwanted.filter((candidate) => !sameShare(candidate, share));
    // Still leaving: watched afresh once the instance has closed its pull.
    if (this.leaving.some((candidate) => sameShare(candidate, share))) {
      this.leaving = this.leaving.filter((candidate) => !sameShare(candidate, share));
      this.rewatch = [...this.rewatch, { member: share.member, kind: share.kind }];
      return;
    }
    if (this.watches(share) || this.asking.some((asked) => sameShare(asked, share))) return;
    // The instance refuses every watch while the usage budget is used up: nothing to show.
    if (this.view?.usage.budget === "used up") return;
    // Asked for by its name alone, whatever else the room's list says of it.
    share = { member: share.member, kind: share.kind };
    tabLog.info("watch.asked", { share });
    this.asking = [...this.asking, share];
    this.askedAt.set(keyOf(share), performance.now());
    let lost = false;
    try {
      if (!(await this.connected("receiving"))) {
        tabLog.warn("watch.failed", { share, why: "no receiving connection" });
        return;
      }
      this.timed(share, "media connection");
      await this.negotiate("receiving", async () => {
        this.timed(share, "turn");
        const pulled = await this.request(
          { type: "watching", request: { type: "watch", share } },
          (change) => (change.type === "pulled" || change.type === "pull-refused") && sameShare(change.share, share),
        );
        this.timed(share, "pull");
        if (pulled.type !== "pulled") {
          tabLog.warn("watch.refused", { share });
          return;
        }
        tabLog.info("watch.pulled", { share, offer: pulled.offer, video: pulled.video, ...(pulled.audio ? { audio: pulled.audio } : {}) });
        const answer = await this.takePull(share, pulled);
        this.timed(share, "answer");
        tabLog.info("watch.confirmed", { share, answer, ms: Math.round(performance.now() - (this.askedAt.get(keyOf(share)) ?? 0)) });
      });
    } catch (error) {
      // The connection was lost on the way: the stage comes back with the room's state.
      tabLog.warn("watch.failed", { share, error });
      lost = true;
    } finally {
      // Let go of a share the tab stopped wanting on the way, now that its negotiation is
      // done. One whose answer the lost socket never brought stays let go of: the room's
      // state on the next socket says whether the instance pulled it all the same.
      const unwanted = this.unwanted.some((candidate) => sameShare(candidate, share));
      this.asking = this.asking.filter((asked) => !sameShare(asked, share));
      if (!this.pictures.some((picture) => sameShare(picture.share, share))) this.askedAt.delete(keyOf(share));
      if (!lost || !unwanted) {
        this.unwanted = this.unwanted.filter((candidate) => !sameShare(candidate, share));
        if (unwanted) this.drop(share);
      }
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

  /**
   * Stops watching `share`, which leaves the stage at once (`wants`). One still being
   * asked for is let go of once the instance says it is watched, since its pull is under
   * way. One to be watched afresh is not, its unwatch being on its way already.
   */
  private drop(share: LiveShare) {
    if (!this.wants(share)) return;
    share = { member: share.member, kind: share.kind };
    tabLog.info("watch.left", { share });
    if (this.rewatch.some((candidate) => sameShare(candidate, share))) {
      this.rewatch = this.rewatch.filter((candidate) => !sameShare(candidate, share));
      if (this.watches(share)) this.leaving = [...this.leaving, share];
    } else if (this.watches(share)) {
      this.leaving = [...this.leaving, share];
      this.send({ type: "watching", request: { type: "unwatch", share } });
    } else this.unwanted = [...this.unwanted, share];
  }

  /** Leaves the room: the instance ends this tab's presence, and what it shares, at once. */
  close() {
    this.usage.stop();
    for (const stop of this.listening.values()) stop();
    this.listening.clear();
    for (const purpose of PURPOSES) this.sides[purpose] = newSide();
    this.media.close();
    this.socket.close();
  }

  private receive(message: ServerMessage) {
    if (message.type === "media") {
      const index = this.waiting.findIndex((request) => request.accepts(message.change));
      if (index >= 0) {
        this.waiting.splice(index, 1);
        return;
      }
      // The instance let go of one of the tab's connections: the sending one's media
      // faltered too long, or the receiving one carries nothing any more. The next share
      // or watch makes a new one.
      if (message.change.type === "dropped") {
        const { connection } = message.change;
        tabLog.warn("media.dropped", { connection, made: this.sides[connection].made });
        if (connection === "receiving" && this.sides.receiving.made) this.usage.report({ final: true });
        this.resetMedia(connection);
      }
      if (message.change.type === "handed-over") this.handedOverFrom(message.change.kind);
      if (message.change.type === "moved") this.moved(message.change);
      if (message.change.type === "renewed") void this.renew(message.change.connection, message.change.iceServers);
      return;
    }
    const before = this.view;
    this.view = applyMessage(this.view, message);
    if (message.type === "state" && before) this.rejoined(before, message.media);
    if (message.type === "state") {
      this.synced = true;
      this.tab = message.tab;
    }
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
    // Watching is allowed again after the usage budget stop: a tab following a member
    // watches what they share once more, as it would a share they started.
    if (message.type === "usage" && before?.usage.budget === "used up" && message.change.budget !== "used up" && this.following)
      this.follow(this.following);
    // The member followed has left the room: the tab follows nobody.
    if (this.following && !this.view?.presence.present.includes(this.following)) this.following = null;
    // A share has left once the instance has it off the stage, however that came about.
    if (this.leaving.some((share) => !this.watches(share))) this.leaving = this.leaving.filter((share) => this.watches(share));
  }

  /**
   * A new socket brought the whole room again, after the tab held `before`. The same tab,
   * back within its grace period, lets go of what ended while it was away. A tab whose
   * grace period ran out finds its media connections gone with everything on them, and
   * builds them again: its shares start again with the captures it still holds, unless a
   * share of that kind of the member's went live meanwhile from elsewhere, and it
   * watches again what it watched, where those shares are still live. Nobody who watched
   * its shares before is carried over: for them those shares ended. Each connection is
   * looked at on its own: one the instance no longer holds is built again.
   */
  private rejoined(before: RoomView, media: MediaState) {
    const made = PURPOSES.filter((purpose) => this.sides[purpose].made);
    const lost = made.filter((purpose) => !media.connected.includes(purpose));
    tabLog.info("media.rejoined", { connected: media.connected, made, sending: media.sending, rebuild: lost });
    const view = this.view!;
    const you = view.people.you.id;
    const liveOfYours = (kind: ShareKind) =>
      view.shares.live.some((share) => share.member === you && share.kind === kind);
    // A watch let go of on its way, whose answer the lost socket never brought: it leaves
    // the stage if the instance pulled it all the same.
    for (const share of this.unwanted) if (this.watches(share)) this.leaving = [...this.leaving, share];
    this.unwanted = this.unwanted.filter((share) => this.asking.some((asked) => sameShare(asked, share)));

    if (!lost.includes("sending")) {
      for (const own of this.mine) {
        if (own.state === "starting") continue;
        // Started from another tab or device while this one was away.
        if (!media.sending.includes(own.kind) && liveOfYours(own.kind)) this.handedOverFrom(own.kind);
        else if (!media.sending.includes(own.kind)) this.tidy(own);
        // A stop the lost socket never carried.
        else if (own.state === "stopping") this.send({ type: "shares", request: { type: "stop", kind: own.kind } });
      }
      // The instance may have missed the sending connection faltering or recovering.
      if (this.sides.sending.made)
        this.send({ type: "media", request: { type: this.sides.sending.health !== "fine" ? "faltering" : "recovered" } });
    }
    if (!lost.includes("receiving")) {
      for (const picture of this.pictures) if (!this.watches(picture.share)) this.unwatched(picture.share);
      if (this.sides.receiving.made) {
        // An unwatch the lost socket may never have carried, of a share leaving or to be watched afresh.
        for (const share of [...this.leaving, ...this.rewatch])
          if (this.watches(share)) this.send({ type: "watching", request: { type: "unwatch", share } });
        // A watch whose pull the lost socket never brought is on the stage with no picture: ask again.
        for (const share of view.watching.stage) {
          if ([...this.leaving, ...this.rewatch].some((other) => sameShare(other, share))) continue;
          if (this.pictures.some((picture) => sameShare(picture.share, share))) continue;
          this.rewatch = [...this.rewatch, share];
          this.send({ type: "watching", request: { type: "unwatch", share } });
        }
        // A replacement the lost socket cut short starts again.
        if (this.replaceAgain) void this.replace();
      }
    }

    if (lost.length > 0) void this.rebuild(before.watching, lost);
  }

  /**
   * Builds the tab's `lost` media connections again, the instance having closed the old
   * ones with everything on them: a new one, made by the first share or watch. Its shares
   * start again with the captures it still holds, unless a share of that kind of the
   * member's is live from elsewhere, and it watches again what was on `before`'s stage
   * and still is live, or follows again the member it followed. Settles once each has
   * been asked for.
   */
  private rebuild(before: RoomView["watching"], lost: readonly MediaPurpose[]): Promise<unknown> {
    tabLog.warn("media.rebuild", { connections: lost, stage: before.stage, mine: this.mine.map((own) => ({ kind: own.kind, state: own.state })) });
    const view = this.view!;
    const you = view.people.you.id;
    const liveOfYours = (kind: ShareKind) =>
      view.shares.live.some((share) => share.member === you && share.kind === kind);
    for (const purpose of lost) this.resetMedia(purpose);
    const asked: Promise<unknown>[] = [];
    if (lost.includes("sending"))
      for (const own of this.mine) {
        // One still starting finds the new connection by itself.
        if (own.state === "starting") continue;
        if (own.state === "live" && own.capture && !liveOfYours(own.kind)) {
          this.update(own.kind, { state: "starting" });
          asked.push(this.publish(own.kind, own.capture));
        } else if (own.state === "live" && liveOfYours(own.kind)) {
          // Started from another tab or device meanwhile.
          this.handedOverFrom(own.kind);
        } else {
          this.tidy(own);
        }
      }
    if (!lost.includes("receiving")) return Promise.all(asked);
    this.pictures = [];
    // A watch at a chosen quality goes back to it once watched again; a new watch would be at Auto.
    this.restoring = before.qualities;
    // What was leaving went with the old connection, and is not watched again. What was
    // to be watched afresh is, being on `before`'s stage.
    const left = this.leaving;
    this.leaving = [];
    this.rewatch = [];
    if (this.following) this.follow(this.following);
    else
      for (const share of before.stage)
        if (view.shares.live.some((live) => sameShare(live, share)) && !left.some((gone) => sameShare(gone, share)))
          asked.push(this.watch(share));
    return Promise.all(asked);
  }

  /**
   * The instance handed `connection` a fresh relay credential, 11 hours after its last was
   * minted. On a direct path the tab takes it silently. On the relay the sending
   * connection restarts with it, and reconnects the ordinary way if the restart fails, or
   * if the switch in `renewal.ts` says to reconnect instead; the receiving connection is
   * replaced, since it is never restarted.
   */
  private async renew(connection: MediaPurpose, iceServers: IceServer[]) {
    const side = this.sides[connection];
    if (!side.made) return;
    side.iceServers = iceServers;
    const relayed = await this.media.relayed(connection).catch(() => false);
    const how = renewal(relayed);
    tabLog.info("media.renew", { connection, how, relayed });
    if (how === "silently") {
      this.media.renew(connection, iceServers);
      return;
    }
    if (connection === "receiving") {
      await this.replace();
      return;
    }
    if (how === "restart" && (await this.restart(iceServers))) return;
    await this.reconnectMedia();
  }

  /**
   * Restarts the sending connection with the fresh credential `iceServers`, as its next
   * negotiation. True once the connection has its path back.
   */
  private restart(iceServers: IceServer[]): Promise<boolean> {
    return this.negotiate("sending", async () => {
      if (!this.sides.sending.made) return false;
      const { sdp: offer, mid } = await this.media.restart(iceServers);
      tabLog.info("pc.restart", { offer, mid });
      const answer = await this.request(
        { type: "media", request: { type: "restart", offer, mid } },
        (change) => change.type === "restarted" || change.type === "restart-refused",
      ).catch(async (error: unknown) => {
        await this.media.abandonRestart();
        throw error;
      });
      if (answer.type !== "restarted") {
        tabLog.warn("pc.restart-failed", { why: "refused" });
        await this.media.abandonRestart();
        return false;
      }
      await this.media.restarted(answer.answer);
      tabLog.info("pc.restarted");
      return true;
    }).catch((error: unknown) => {
      tabLog.warn("pc.restart-failed", { error });
      return false;
    });
  }

  /**
   * The ordinary reconnect path on the same socket, after a failed restart of the sending
   * connection: the instance ends every share it carried and lets it go, and the tab
   * builds it again (`rebuild`). The stage says "Reconnecting…" meanwhile. Done once.
   */
  private async reconnectMedia() {
    if (!this.sides.sending.made || this.rebuilding || !this.view) return;
    tabLog.warn("media.reconnect", { connection: "sending" });
    this.rebuilding = true;
    const before = this.view.watching;
    // Its own shares end on the old connection, but keep their captures for the new one.
    for (const own of this.mine) if (own.state === "live" && own.capture) this.carrying.add(own.capture);
    try {
      await this.negotiate("sending", () =>
        this.request(
          { type: "media", request: { type: "reconnect" } },
          (change) => change.type === "dropped" && change.connection === "sending",
        ),
      );
      this.carrying.clear();
      await this.rebuild(before, ["sending"]);
    } catch (error) {
      // The socket was lost on the way: the room's state on the next one says whether
      // the instance let the connection go, and the tab rebuilds from that.
      tabLog.warn("media.reconnect-failed", { error });
    } finally {
      this.carrying.clear();
      this.rebuilding = false;
    }
  }

  /** The instance closed this tab's pull of `share`: the tab lets go of its picture. */
  private unwatched(share: LiveShare) {
    this.dropPicture(share);
    if (this.rewatch.some((candidate) => sameShare(candidate, share))) {
      this.rewatch = this.rewatch.filter((candidate) => !sameShare(candidate, share));
      void this.watch(share);
    }
  }

  /** Lets go of the picture of `share`, if the tab has one. */
  private dropPicture(share: LiveShare) {
    const picture = this.pictures.find((candidate) => sameShare(candidate.share, share));
    if (!picture) return;
    this.askedAt.delete(keyOf(share));
    this.listening.get(keyOf(share))?.();
    this.listening.delete(keyOf(share));
    this.media.drop(picture.video);
    this.pictures = this.pictures.filter((candidate) => candidate !== picture);
  }

  /**
   * A share this tab watches was handed over to another tab or device of its sharer in
   * this room: the instance closed the old pull and pulled the new share in its place. It
   * stays on the stage; its picture is the new one once the tab has answered, in turn
   * with its other negotiations. A replacement of the receiving connection that went
   * through first pulled the new share onto the new connection as one of its steps, so
   * this offer, for the old one, is not taken.
   */
  private moved({ share, offer, video, audio }: Extract<MediaChange, { type: "moved" }>) {
    const replacements = this.replacements;
    void this.negotiate("receiving", async () => {
      if (this.replacements !== replacements) {
        tabLog.info("watch.moved", { share, video, by: "the replacement" });
        return;
      }
      this.dropPicture(share);
      await this.takePull(share, { offer, video, ...(audio === undefined ? {} : { audio }) });
      tabLog.info("watch.moved", { share, video });
    }).catch((error: unknown) => {
      // The connection was lost on the way: the stage comes back with the room's state.
      tabLog.warn("watch.failed", { share, error, during: "a hand-over" });
    });
  }

  /**
   * The member started this tab's share of `kind` from another tab or device instead: the
   * instance has closed it here. The tab lets go of its capture, and the page says why.
   */
  private handedOverFrom(kind: ShareKind) {
    tabLog.info("share.handed-over", { kind });
    const own = this.mine.find((candidate) => candidate.kind === kind && candidate.state !== "starting");
    if (own) this.tidy(own);
    if (!this.handedOver.includes(kind)) this.handedOver = [...this.handedOver, kind];
  }

  /**
   * Takes the media server's `offer` pulling `share` onto the receiving connection: the
   * share's picture is the new one at once, and the instance has the tab's answer, which
   * this gives, once it settles.
   */
  private async takePull(share: LiveShare, { offer, video, audio }: { offer: string; video: string; audio?: string }): Promise<string> {
    const { answer, stream } = await this.media.pull(offer, video, audio);
    this.pictures = [...this.pictures.filter((picture) => !sameShare(picture.share, share)), { share, video, stream, received: null }];
    this.listen(share, video);
    await this.request({ type: "media", request: { type: "answer", answer } }, (change) => change.type === "answered");
    return answer;
  }

  /** Keeps the picture of `share`, arriving on `video`, told of the quality it arrives at. */
  private listen(share: LiveShare, video: string) {
    this.listening.get(keyOf(share))?.();
    const stop = this.media.received(video, (received) => {
      this.pictures = this.pictures.map((picture) =>
        picture.video === video && sameShare(picture.share, share) ? { ...picture, received } : picture,
      );
    });
    this.listening.set(keyOf(share), stop);
  }

  /**
   * Leaves in the browser's performance timeline how long `share` took to reach `step` of
   * its arrival since it was asked for, as "graeae watch: <step>": "media connection" once
   * the tab has one, "turn" once its earlier negotiations are done, "pull" once the
   * instance has pulled it, "answer" once the media server has the tab's answer, and
   * "first frame". Nothing reads them: they are for measuring a watch on real media, with
   * `performance.getEntriesByType("measure")`.
   */
  private timed(share: LiveShare, step: WatchStep) {
    const start = this.askedAt.get(keyOf(share));
    if (start === undefined) return;
    performance.measure(`graeae watch: ${step}`, { start, end: performance.now(), detail: keyOf(share) });
  }

  /** Runs `negotiation` on the `connection` once every earlier one on it is done. */
  private negotiate<T>(connection: MediaPurpose, negotiation: () => Promise<T>): Promise<T> {
    const turn = this.negotiating[connection].then(negotiation);
    this.negotiating[connection] = turn.catch(() => undefined);
    return turn;
  }

  /** A share ended. If it was this tab's own, the tab tidies its side. */
  private ended(share: LiveShare) {
    if (share.member !== this.view?.people.you.id) return;
    const own = this.mine.find((candidate) => candidate.kind === share.kind && candidate.state !== "starting");
    if (!own || (own.capture && this.carrying.has(own.capture))) return;
    this.tidy(own);
  }

  /** Stops `own`'s capture and forgets the share. */
  private tidy(own: OwnShare) {
    if (own.capture) this.media.stop(own.capture);
    this.mine = this.mine.filter((candidate) => candidate !== own);
  }

  /**
   * Replaces the receiving connection with a new one, as its next negotiation: the tab
   * sends the old one's final total, the instance makes the new one and pulls each watch
   * onto it in turn, each picture moving over as the tab answers its pull, and then
   * closes the old pulls. Every other negotiation on the receiving connection, a watch
   * asked for meanwhile among them, waits until it is done, and every offer the tab gets
   * meanwhile, a hand-over's among them, is one of its steps. True once it is.
   */
  private replace(): Promise<boolean> {
    this.replaceAgain = false;
    return this.negotiate("receiving", async () => {
      const side = this.sides.receiving;
      if (!side.made) return false;
      tabLog.info("media.replace", { connection: "receiving", watching: this.pictures.length });
      this.usage.stop();
      this.usage.report({ final: true });
      await this.usage.sent();
      this.replaceAgain = true;
      const made = await this.request(
        { type: "media", request: { type: "replace" } },
        (change) => (change.type === "connected" || change.type === "unavailable") && change.connection === "receiving",
      );
      if (made.type !== "connected") {
        // The instance kept the old connection: its watches stay on it, as do the reports.
        this.replaceAgain = false;
        tabLog.warn("media.unavailable", { connection: "receiving", during: "a replacement" });
        this.usage.start();
        return false;
      }
      this.replacements += 1;
      side.iceServers = made.iceServers;
      side.health = "fine";
      this.media.replace(made.iceServers, (health) => this.healthChanged("receiving", health));
      this.usage.start();
      for (;;) {
        const step = await this.awaitChange((change) => change.type === "pulled" || change.type === "replaced");
        if (step.type !== "pulled") break;
        await this.takePull(step.share, step);
      }
      this.replaceAgain = false;
      this.media.retire();
      tabLog.info("media.replaced", { connection: "receiving", watching: this.pictures.length });
      return true;
    }).catch((error: unknown) => {
      // The socket was lost on the way: asked for again once the next one has the room.
      tabLog.warn("media.replace-failed", { connection: "receiving", error });
      return false;
    });
  }

  /** Lets go of `connection`, keeping the captures: the next share or watch makes a new one. */
  private resetMedia(connection: MediaPurpose) {
    if (connection === "receiving") {
      this.usage.stop();
      for (const stop of this.listening.values()) stop();
      this.listening.clear();
      this.replaceAgain = false;
    }
    this.media.reset(connection);
    this.sides[connection] = newSide();
  }

  /** The tab's `connection`, made the first time it is needed. False if it could not be made. */
  private connected(connection: MediaPurpose): Promise<boolean> {
    const side = this.sides[connection];
    const asked = (side.asked ??= (async () => {
      const change = await this.request(
        { type: "media", request: { type: "connect", connection } },
        (change) => (change.type === "connected" || change.type === "unavailable") && change.connection === connection,
      );
      // Let go of while it was being made: the next share or watch asks again.
      if (this.sides[connection] !== side) return false;
      if (change.type !== "connected") {
        tabLog.warn("media.unavailable", { connection });
        side.asked = null;
        return false;
      }
      tabLog.info("media.connected", { connection });
      side.iceServers = change.iceServers;
      this.media.connect(connection, change.iceServers, (health) => this.healthChanged(connection, health));
      side.made = true;
      if (connection === "receiving") this.usage.start();
      return true;
    })().catch((error: unknown) => {
      // The socket was lost before the answer came: the next share or watch asks again.
      tabLog.warn("media.unavailable", { connection, error });
      side.asked = null;
      return false;
    }));
    return asked;
  }

  /**
   * How `connection` is doing has changed. The instance hears when the sending
   * connection falters, which gives this tab's shares 30 seconds, and when it recovers;
   * a faltering receiving connection ends nothing. One the browser has given up on is
   * brought back (`recover`).
   */
  private healthChanged(connection: MediaPurpose, health: MediaHealth) {
    const side = this.sides[connection];
    (health === "fine" ? tabLog.info : tabLog.warn).call(tabLog, "media.health", { connection, health });
    const was = side.health;
    side.health = health;
    if (connection === "sending" && (health === "fine") !== (was === "fine"))
      this.send({ type: "media", request: { type: health === "fine" ? "recovered" : "faltering" } });
    if (health === "failed") void this.recover(connection);
  }

  /**
   * Brings back `connection` the browser gave up on, keeping every share and watch: the
   * sending connection is restarted, the receiving one replaced. Again a moment after
   * each try that finds no path, as the network may still be down. Stops once it
   * recovers, or once it is no longer this tab's: the instance let it go, its shares
   * having faltered for 30 seconds, or the tab left.
   */
  private async recover(connection: MediaPurpose) {
    const side = this.sides[connection];
    if (side.recovering) return;
    side.recovering = true;
    try {
      while (this.sides[connection] === side && side.made && side.health === "failed") {
        if (connection === "sending" ? await this.restart(side.iceServers) : await this.replace()) return;
        await new Promise((resolve) => setTimeout(resolve, RESTART_AGAIN_MS));
      }
    } finally {
      side.recovering = false;
    }
  }

  /** The next change in the media area that `matches`, which comes unasked. Fails when the socket is lost first. */
  private awaitChange<T extends MediaChange>(matches: (change: MediaChange) => change is T): Promise<T>;
  private awaitChange(matches: (change: MediaChange) => boolean): Promise<MediaChange>;
  private awaitChange(matches: (change: MediaChange) => boolean): Promise<MediaChange> {
    return new Promise<MediaChange>((resolve, reject) => {
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

  /**
   * Sends `message` and gives the next change in the media area that `matches`, which
   * answers it. Fails at once when the connection is lost and the message could not go.
   */
  private request(message: ClientMessage, matches: (change: MediaChange) => boolean): Promise<MediaChange> {
    const reply = this.awaitChange(matches);
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

/**
 * What the page sends to start a share of `kind` with `offer` from `media`. A screen
 * share says the browser family sending it, and whether it goes out at two qualities.
 * A hand-over says so.
 */
function startRequest(kind: ShareKind, offer: Offer, media: MediaClient, handOver: boolean): SharesRequest {
  const replacing = handOver ? { handOver: true as const } : {};
  if (kind === "webcam") return { type: "start", kind, offer: offer.sdp, video: offer.video, ...replacing };
  const audio = offer.audio ? { audio: offer.audio } : {};
  const twoQualities = media.plan(kind).qualities.length > 1 ? { twoQualities: true as const } : {};
  const browser = media.browser;
  return { type: "start", kind, offer: offer.sdp, video: offer.video, browser, ...audio, ...twoQualities, ...replacing };
}

/** A step of a watch's arrival, as `RoomClient.timed` measures it. */
type WatchStep = "media connection" | "turn" | "pull" | "answer" | "first frame";

/** A share's key: its member and its kind. */
function keyOf(share: LiveShare): string {
  return `${share.member}:${share.kind}`;
}
