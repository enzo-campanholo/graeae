// The tab's side of the instance's logs (ticket 48): what this page did, which the
// instance never sees otherwise. Every event is built by `src/shared/log.ts`, which lists
// the events and leaves out what must never be stored, and kept in memory until it is
// handed to the instance, which writes it beside its own lines (`src/shared/socket/log.ts`).
//
// How it leaves:
// - A page with a signaling socket, the room's or the list's, sends a batch on it with
//   every heartbeat, and at once for an error. A batch counts as delivered once the
//   instance answers the next heartbeat, since a socket keeps its order; if the socket is
//   lost first, the batch goes back in front of the rest. While the socket is down the
//   events wait, so the lead-up to a dropped connection reaches the instance once the
//   page reconnects.
// - A page with no socket (setup, invite, owner, "You") posts its batches to `/api/log`
//   every few seconds, and at once for an error. The instance takes them only from a
//   remembered device: a refused post keeps its events until the page moves to another
//   address, such as from an invite into the room.
// - Whatever is left goes with a beacon as the page goes away (`pagehide`).
// - A page the instance refused from the start sends nothing while it stays there.
//
// The buffer holds at most 2,000 events, dropping the oldest and counting the drops.

import { REFUSED_MARK } from "../../shared/api.ts";
import { errorFields, logLine, routeOf, type LogFields, type LogLevel } from "../../shared/log.ts";
import { LOG_PATH, MAX_BATCH_EVENTS, type LogRequest, type TabEvent } from "../../shared/socket/log.ts";
import { LogBuffer, type Batch } from "./log-buffer.ts";

/** The most events kept while they cannot be sent. */
const BUFFER_CAP = 2_000;
/** How often a page with no socket posts what it has. */
const POST_EVERY_MS = 5_000;
/** The most the beacons carry in all; browsers refuse more than 64 KB in flight. */
const BEACON_MAX_BYTES = 60 * 1024;

/** A signaling connection that carries batches: `connection.svelte.ts`. */
export interface LogSocket {
  /** Sends a batch now; false when the socket is not open. */
  sendLog(request: LogRequest): boolean;
}

/** Where a page's events go, as its connections come and go. */
class TabLog {
  /** This page load's id, on every event, so one load can be followed across its sockets and posts. */
  readonly page = newId();
  private readonly opened = performance.now();
  private readonly buffer = new LogBuffer<TabEvent>(BUFFER_CAP);
  private socket: LogSocket | null = null;
  /** The batches sent on the socket and not yet confirmed, oldest first. */
  private sent: Batch<TabEvent>[] = [];
  /** How many of `sent` the next heartbeat's answer confirms: those sent before it. */
  private confirmable = 0;
  /** The batch a post is carrying, until it is answered. */
  private posted: Batch<TabEvent> | null = null;
  /** The address the instance refused this page at when it loaded, if it did. */
  private readonly refusedAt =
    typeof document !== "undefined" && document.documentElement.hasAttribute(REFUSED_MARK)
      ? window.location.pathname
      : null;
  /** The address at which a post was refused: nothing more is posted until the page moves. */
  private heldAt: string | null = null;
  private started = false;

  info(event: string, fields?: LogFields) {
    this.record("info", event, fields);
  }

  warn(event: string, fields?: LogFields) {
    this.record("warn", event, fields);
  }

  /** A problem; with `error`, its name, message and stack. */
  error(event: string, error?: unknown, fields?: LogFields) {
    this.record("error", event, error === undefined ? fields : { ...fields, error: errorFields(error) });
  }

  /** Starts listening for the page's own events and posting, once, as the app starts. */
  start() {
    if (this.started) return;
    this.started = true;
    this.info("page.open", {
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      build: __GRAEAE_BUILD__,
      ...this.where(),
      refused: this.refusedAt !== null,
    });
    window.addEventListener("error", (event) => {
      this.error("error", event.error ?? event.message, { during: "window.onerror", file: event.filename, line: event.lineno });
    });
    window.addEventListener("unhandledrejection", (event) => {
      this.error("error", event.reason, { during: "unhandledrejection" });
    });
    document.addEventListener("visibilitychange", () => this.info(document.hidden ? "page.hidden" : "page.visible"));
    window.addEventListener("online", () => this.info("page.online"));
    window.addEventListener("offline", () => this.warn("page.offline"));
    window.addEventListener("pagehide", (event) => {
      this.info("page.leave", { persisted: event.persisted });
      this.beacon();
    });
    setInterval(() => void this.post(), POST_EVERY_MS);
  }

  /** The page's route as a line holds it: its pattern, and the ids it names. */
  where(pathname = window.location.pathname): LogFields {
    const { route, ...params } = routeOf(pathname);
    return { route, ...(Object.keys(params).length > 0 ? { params } : {}) };
  }

  /** `socket` is the page's signaling connection now: batches go over it. */
  attach(socket: LogSocket) {
    this.socket = socket;
    this.sent = [];
    this.confirmable = 0;
  }

  /**
   * `socket` has closed for good, cleanly: what it carried arrived, since a socket keeps
   * its order up to its close. What is left is posted.
   */
  detach(socket: LogSocket) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.sent = [];
    this.confirmable = 0;
    void this.post();
  }

  /** `socket` is about to send its heartbeat: a batch goes first, and its answer will confirm it. */
  beat(socket: LogSocket) {
    if (this.socket !== socket) return;
    this.sendOn(socket);
    this.confirmable = this.sent.length;
  }

  /** The instance answered `socket`'s heartbeat: the batches sent before it arrived. */
  heard(socket: LogSocket) {
    if (this.socket !== socket) return;
    this.sent.splice(0, this.confirmable);
    this.confirmable = 0;
  }

  /** `socket` was lost: what it may not have carried goes back, to go on the next one. */
  lost(socket: LogSocket) {
    if (this.socket !== socket) return;
    this.buffer.putBack(...this.sent.splice(0));
    this.confirmable = 0;
  }

  private record(level: LogLevel, event: string, fields: LogFields = {}) {
    const { source, ...line } = logLine("tab", event, fields);
    void source;
    this.buffer.add({ ...line, level, up: Math.round(performance.now() - this.opened), page: this.page } as TabEvent);
    if (level === "error") queueMicrotask(() => this.flush());
  }

  /** Sends what there is now, on the socket or by post. */
  private flush() {
    if (this.socket) this.sendOn(this.socket);
    else void this.post();
  }

  private sendOn(socket: LogSocket) {
    if (this.silent()) return;
    const batch = this.buffer.take(MAX_BATCH_EVENTS);
    if (!batch) return;
    if (socket.sendLog(request(batch))) this.sent.push(batch);
    else this.buffer.putBack(batch);
  }

  /** Posts what there is, for a page with no socket, one batch at a time. */
  private async post() {
    if (this.socket || this.posted || this.silent()) return;
    const batch = this.buffer.take(MAX_BATCH_EVENTS);
    if (!batch) return;
    this.posted = batch;
    // The address it was sent from: the page may move before the answer comes.
    const from = window.location.pathname;
    let delivered = false;
    try {
      const response = await fetch(LOG_PATH, { method: "POST", body: JSON.stringify(request(batch)) });
      delivered = response.ok;
      if (!delivered) this.heldAt = from;
    } catch {
      // No answer: tried again with the next post.
    } finally {
      this.posted = null;
      if (!delivered) this.buffer.putBack(batch);
    }
  }

  /** As the page goes away: everything not yet confirmed, in beacons the browser sends after it. */
  private beacon() {
    if (this.silent()) return;
    // What went on the open socket arrives with it, as its close keeps its order; a post
    // under way may arrive too, and is left to its answer.
    let left = BEACON_MAX_BYTES;
    let max = MAX_BATCH_EVENTS;
    for (;;) {
      const batch = this.buffer.take(max);
      if (!batch) return;
      const body = JSON.stringify(request(batch));
      if (body.length > left) {
        this.buffer.putBack(batch);
        // The oldest that fit go; the rest stay, and are lost with the page.
        if (batch.events.length <= 1) return;
        max = Math.ceil(batch.events.length / 2);
        continue;
      }
      if (!navigator.sendBeacon(LOG_PATH, body)) {
        this.buffer.putBack(batch);
        return;
      }
      left -= body.length;
    }
  }

  /** Whether nothing may be sent now: the page is where the instance refused it. */
  private silent(): boolean {
    const here = window.location.pathname;
    if (this.heldAt !== null && this.heldAt !== here) this.heldAt = null;
    return here === this.refusedAt || here === this.heldAt;
  }
}

function request(batch: Batch<TabEvent>): LogRequest {
  return { type: "events", events: batch.events, ...(batch.dropped > 0 ? { dropped: batch.dropped } : {}) };
}

function newId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** The page's log: one per page load. */
export const tabLog = new TabLog();
