// A signaling connection as the page holds it: one WebSocket to the instance that beats
// every 5 seconds and reconnects by itself. The room client and the list client each
// keep one; what the messages mean is theirs.
//
// A connection is lost when its socket closes without the page leaving, or when the
// instance stops answering heartbeats. The page then checks over HTTP whether it is
// refused now ("nothing here", since a socket cannot say why it closed) and otherwise
// opens a new socket, at once and then backing off to every 5 seconds, for as long as the
// page is open. A new socket gets the whole state again, and nothing is replayed.

import { HEARTBEAT, HEARTBEAT_EVERY_MS, LOST_CLOSE_CODE } from "../../shared/socket/heartbeat.ts";
import { every } from "./ticker.ts";

/** How often the connection looks at itself. */
const TICK_MS = 1_000;
/** How long an answer to a heartbeat, or a new socket's opening, may take before the socket is given up. */
const ANSWER_WITHIN_MS = 4_000;
/** The waits before each new try at connecting after a loss, the last repeated. */
const RETRY_MS = [250, 1_000, 2_000, 4_000, 5_000];

export interface ConnectionOptions<Message> {
  /** The socket's path, such as `roomSocketPath(address)`. */
  path: string;
  /** Each message the instance sends, other than answers to heartbeats and `gone`. */
  receive: (message: Message) => void;
  /** Asks the instance over HTTP whether this page is refused now. False when the answer cannot be had. */
  refused: () => Promise<boolean>;
}

export class Connection<Message extends { type: string }> {
  /** Whether the instance refused this page, so it shows "nothing here". Final. */
  refused = $state(false);

  private socket: WebSocket | null = null;
  /** When the socket was opened, or when the heartbeat that has not been answered was sent. */
  private waitingSince: number | null = null;
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

  /** Leaves: a clean close, which ends the tab's presence at once. */
  close() {
    this.end();
    this.socket?.close(1000, "left");
    this.socket = null;
  }

  private connect() {
    clearTimeout(this.retry);
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${window.location.host}${this.options.path}`);
    this.socket = socket;
    this.waitingSince = Date.now();
    this.lastBeat = Date.now();

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
      if (message.type === "state") this.tries = 0;
      this.options.receive(message);
    });
    socket.addEventListener("close", () => {
      if (socket === this.socket) void this.lost();
    });
  }

  private tick() {
    const socket = this.socket;
    if (this.ended || !socket) return;
    const now = Date.now();
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
    this.socket = null;
    if (this.ended) return;
    const refused = await this.options.refused().catch(() => false);
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
    clearTimeout(this.retry);
    this.stopTicking();
    window.removeEventListener("online", this.retryNow);
  }
}
