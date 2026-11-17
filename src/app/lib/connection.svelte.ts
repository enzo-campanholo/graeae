// A signaling connection as the page holds it: one WebSocket to the instance that beats
// every 5 seconds and reconnects by itself. The room client and the list client each
// keep one; what the messages mean is theirs.
//
// A connection is lost when its socket closes without the page leaving, or when the
// instance stops answering heartbeats. The page then checks over HTTP whether it is
// refused now ("nothing here", since a socket cannot say why it closed) and otherwise
// opens a new socket, at once and then backing off to every 5 seconds, for as long as the
// page is open. A new socket gets the whole state again, and nothing is replayed.
//
// A message sent while a socket is still opening waits for it to open, so a click in the
// moment before the room arrives is not lost. One sent while the connection is lost, with
// no socket opening, is not sent at all, and `send` says so.

import { HEARTBEAT, HEARTBEAT_EVERY_MS, LOST_CLOSE_CODE } from "../../shared/socket/heartbeat.ts";
import { every } from "./ticker.ts";

/** How often the connection looks at itself. */
const TICK_MS = 1_000;
/** How long an answer to a heartbeat, or a new socket's opening, may take before the socket is given up. */
const ANSWER_WITHIN_MS = 4_000;
/** The waits before each new try at connecting after a loss, the last repeated. */
const RETRY_MS = [250, 1_000, 2_000, 4_000, 5_000];
/** How long the instance may go unheard before the page says it is reconnecting. */
const RECONNECTING_AFTER_MS = 3_000;

export interface ConnectionOptions<Message> {
  /** The socket's path, such as `roomSocketPath(address)`, asked again for each new socket. */
  path: () => string;
  /** Each message the instance sends, other than answers to heartbeats and `gone`. */
  receive: (message: Message) => void;
  /** Asks the instance over HTTP whether this page is refused now. False when the answer cannot be had. */
  refused: () => Promise<boolean>;
  /** Hears each loss of the socket, before the next one is tried. */
  lost?: () => void;
}

export class Connection<Message extends { type: string }> {
  /** Whether the instance refused this page, so it shows "nothing here". Final. */
  refused = $state(false);
  /**
   * Whether the page has gone about 3 seconds without hearing the instance when it
   * should have, after having had the whole state at least once: an unanswered
   * heartbeat, or a lost socket and the new one not yet in. False again once a new
   * socket brings the whole state.
   */
  reconnecting = $state(false);

  private socket: WebSocket | null = null;
  /** When the socket was opened, or when the heartbeat that has not been answered was sent. */
  private waitingSince: number | null = null;
  /** When the connection was lost, until a new socket brings the whole state. */
  private lostSince: number | null = null;
  /** Whether a socket has brought the whole state yet. */
  private hadState = false;
  /** Messages sent while the socket was opening, to send once it is open. */
  private queued: string[] = [];
  private lastBeat = 0;
  private tries = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private ended = false;
  private readonly stopTicking: () => void;

  constructor(private readonly options: ConnectionOptions<Message>) {
    this.connect();
    this.stopTicking = every(TICK_MS, () => this.tick());
    window.addEventListener("online", this.retryNow);
  }

  /**
   * Sends `message` on the open socket, or once the socket that is opening has opened.
   * False when it cannot be sent: the connection is lost and no socket is opening, so
   * an answer to it will not come. Nothing is kept for a later socket.
   */
  send(message: unknown): boolean {
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    if (socket?.readyState === WebSocket.CONNECTING) {
      this.queued.push(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /** Leaves: a clean close, which ends the tab's presence at once. */
  close() {
    this.end();
    this.socket?.close(1000, "left");
    this.socket = null;
  }

  private connect() {
    clearTimeout(this.retry);
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${window.location.host}${this.options.path()}`);
    this.socket = socket;
    this.queued = [];
    this.waitingSince = Date.now();
    this.lastBeat = Date.now();

    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      for (const message of this.queued.splice(0)) socket.send(message);
    });
    socket.addEventListener("message", (event) => {
      if (socket !== this.socket || typeof event.data !== "string") return;
      this.waitingSince = null;
      const message = JSON.parse(event.data) as Message;
      if (message.type === HEARTBEAT.answer.type) return;
      if (message.type === "gone") {
        this.refused = true;
        this.close();
        return;
      }
      if (message.type === "state") {
        this.tries = 0;
        this.hadState = true;
        this.lostSince = null;
        this.reconnecting = false;
      }
      this.options.receive(message);
    });
    socket.addEventListener("close", () => {
      if (socket === this.socket) void this.lost();
    });
  }

  private tick() {
    if (this.ended) return;
    const now = Date.now();
    const unheardSince = this.lostSince ?? (this.hadState ? this.waitingSince : null);
    this.reconnecting = unheardSince !== null && now - unheardSince >= RECONNECTING_AFTER_MS;

    const socket = this.socket;
    if (!socket) return;
    if (this.waitingSince !== null && now - this.waitingSince > ANSWER_WITHIN_MS) {
      // Closing a dead connection can take minutes to be noticed, so it is let go now.
      this.socket = null;
      socket.close(LOST_CLOSE_CODE, "lost");
      void this.lost();
      return;
    }
    if (socket.readyState === WebSocket.OPEN && now - this.lastBeat >= HEARTBEAT_EVERY_MS) {
      socket.send(JSON.stringify(HEARTBEAT.beat));
      this.lastBeat = now;
      this.waitingSince ??= now;
    }
  }

  private async lost() {
    // Unheard since the heartbeat that went unanswered, or since now.
    if (this.hadState) this.lostSince ??= this.waitingSince ?? Date.now();
    this.socket = null;
    this.queued = [];
    if (this.ended) return;
    this.options.lost?.();
    // An answer that does not come is no answer, so a hung request cannot stop the retries.
    const refused = await Promise.race([
      this.options.refused().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ANSWER_WITHIN_MS)),
    ]);
    // Back online meanwhile, and already connecting again.
    if (this.ended || this.socket) return;
    if (refused) {
      this.refused = true;
      this.end();
      return;
    }
    const wait = RETRY_MS[Math.min(this.tries, RETRY_MS.length - 1)]!;
    this.tries += 1;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), wait);
  }

  /** The browser is back online: a connection waiting to try again tries now. */
  private readonly retryNow = () => {
    if (this.ended || this.socket) return;
    clearTimeout(this.retry);
    this.connect();
  };

  private end() {
    this.ended = true;
    this.reconnecting = false;
    clearTimeout(this.retry);
    this.stopTicking();
    window.removeEventListener("online", this.retryNow);
  }
}
