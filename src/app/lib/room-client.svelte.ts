// The room client: the browser's side of the signaling connection. One per tab showing a
// room. It holds the whole room as the instance last sent it and applies each change as
// it arrives; the protocol is in `src/shared/socket/`.
//
// It also carries the tab's media connection's side of the conversation: it asks the
// instance for the connection the first time the tab shares, passes the media client's
// offers to the instance and the instance's answers back, and keeps this tab's own
// shares. The media client never talks to the instance itself.

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
import { getJson } from "./api.ts";
import { createMediaClient, type Capture } from "./media/index.ts";

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
  /** Whether the instance refused this tab the room, so the page shows "nothing here". */
  refused = $state(false);
  /** This tab's own shares. Another tab's or device's shares of yours are only in `view`. */
  mine = $state.raw<OwnShare[]>([]);
  /** The kind of share that last failed to start, until the next attempt. */
  failed = $state<ShareKind | null>(null);

  private readonly socket: WebSocket;
  private readonly media = createMediaClient();
  /** The tab's media connection, once asked for: whether it was made. */
  private connection: Promise<boolean> | null = null;
  /** Requests waiting for their answer in the media area, oldest first. */
  private readonly waiting: ((change: MediaChange) => boolean)[] = [];

  constructor(private readonly address: string) {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${scheme}//${window.location.host}${roomSocketPath(address)}`);
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      this.receive(JSON.parse(event.data) as ServerMessage);
    });
    this.socket.addEventListener("close", () => {
      if (this.view === null) void this.checkRefused();
    });
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
      const offer = await this.media.offer(capture);
      const reply = this.answer((change) => (change.type === "published" || change.type === "refused") && change.kind === "webcam");
      this.send({ type: "shares", request: { type: "start", kind: "webcam", offer: offer.sdp, video: offer.video } });
      const answer = await reply;
      if (answer.type !== "published") throw new Error("the share was refused");
      await this.media.accept(answer.answer);
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

  /** Leaves the room: the instance ends this tab's presence, and what it shares, at once. */
  close() {
    this.media.close();
    this.socket.close(1000, "left");
  }

  private receive(message: ServerMessage) {
    if (message.type === "media") {
      const index = this.waiting.findIndex((accepts) => accepts(message.change));
      if (index >= 0) this.waiting.splice(index, 1);
      return;
    }
    this.view = applyMessage(this.view, message);
    if (message.type === "shares" && message.change.type === "ended") this.ended(message.change.share);
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
    return new Promise((resolve) => {
      this.waiting.push((change) => {
        if (!matches(change)) return false;
        resolve(change);
        return true;
      });
    });
  }

  private send(message: ClientMessage) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private update(kind: ShareKind, patch: Partial<OwnShare>) {
    this.mine = this.mine.map((share) => (share.kind === kind ? { ...share, ...patch } : share));
  }

  // A refused socket only shows the browser a failed connection, so ask the instance
  // over HTTP, where a refusal is the "nothing here" answer.
  private async checkRefused() {
    const room = await getJson(`/api/rooms/${encodeURIComponent(this.address)}`).catch(() => undefined);
    if (room === null) this.refused = true;
  }
}
