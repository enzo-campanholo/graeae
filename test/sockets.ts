// A tab's signaling connection, as the tests drive it: open a room's socket or the list
// of rooms' socket, read what the instance sends, send requests and heartbeats, and close
// it the way a closing tab does or lose it the way a dropped connection does.
//
// A test tab sends no heartbeat by itself: it falls silent unless the test has it beat,
// since the test's clock moves only when the test moves it.

import { expect, onTestFinished } from "vitest";
import { HEARTBEAT, LOST_CLOSE_CODE } from "../src/shared/socket/heartbeat.ts";
import { LIST_SOCKET_PATH, type ListMessage, type ListState } from "../src/shared/socket/list.ts";
import {
  roomSocketPath,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from "../src/shared/socket/index.ts";
import type { Client } from "./harness.ts";

/** How long a test waits for a message before it fails. */
const WAIT_MS = 2000;

export interface Tab<Message = ServerMessage> {
  /** The tab's id on the instance, as a room's full state names it; undefined on the list of rooms. */
  readonly id: string | undefined;
  /** The next message the instance sent this tab, in order. Answers to heartbeats are not among them. */
  next(): Promise<Message>;
  /**
   * Sends a heartbeat and waits for the instance's answer. Whatever the instance sent this
   * tab before answering has arrived by then, so `queued()` shows all of it.
   */
  heartbeat(): Promise<void>;
  /** The messages that have arrived and not been read yet, left unread. */
  queued(): Message[];
  /** Every message the instance has sent this tab so far, read or not, the full state first. */
  received(): readonly Message[];
  /** Sends a request, as the page does. */
  send(message: ClientMessage): void;
  /** Closes the socket cleanly, as a tab that is closed, reloaded or navigated away does. */
  close(): Promise<void>;
  /**
   * Loses the connection, as a browser does when it gives up on a connection that went
   * dead and opens another. The instance hears the socket close, but not a leave.
   */
  drop(): Promise<void>;
  /** Resolves once the socket has closed, whoever closed it; fails if it stays open. */
  closed(): Promise<void>;
}

/** The room at `/r/<address>` as `room` names it, or its bare address. */
export function addressOf(room: string): string {
  return room.replace(/^\/r\//, "");
}

/**
 * Opens a tab on `room` and reads the full state it gets first. With `tab`, it is a page
 * reconnecting, naming the tab the instance told it it was.
 */
export async function openRoom(
  browser: Client,
  room: string,
  options: { tab?: string } = {},
): Promise<{ tab: Tab; state: RoomView }> {
  return open<ServerMessage, RoomView>(browser, roomSocketPath(addressOf(room), options.tab));
}

/** Opens a tab on the list of rooms and reads the full list it gets first. */
export async function openList(browser: Client): Promise<{ tab: Tab<ListMessage>; state: ListState }> {
  return open<ListMessage, ListState>(browser, LIST_SOCKET_PATH);
}

async function open<Message extends { type: string }, State>(
  browser: Client,
  path: string,
): Promise<{ tab: Tab<Message>; state: State }> {
  const { response, socket } = await browser.openSocket(path);
  expect(response.status, "the socket was refused").toBe(101);
  const tab = listen<Message>(socket!);
  const first = (await tab.next()) as Message & { state?: State; tab?: string };
  if (first.type !== "state") throw new Error(`expected the full state first, got ${JSON.stringify(first)}`);
  return { tab: { ...tab, id: first.tab }, state: first.state! };
}

function listen<Message>(socket: WebSocket): Omit<Tab<Message>, "id"> {
  const all: Message[] = [];
  const arrived: Message[] = [];
  const waiting: ((message: Message) => void)[] = [];
  const answers: (() => void)[] = [];
  const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve()));

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string) as Message & { type?: string };
    if (message.type === HEARTBEAT.answer.type) {
      answers.shift()?.();
      return;
    }
    all.push(message);
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else arrived.push(message);
  });
  // Every tab leaves before the next test resets the instance under it. A restart of
  // the instance has already cut its socket, which can then no longer be touched.
  onTestFinished(async () => {
    try {
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, "left");
    } catch {
      return;
    }
    await closed;
  });

  return {
    next() {
      const message = arrived.shift();
      if (message) return Promise.resolve(message);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no message within ${WAIT_MS}ms`)), WAIT_MS);
        waiting.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
    heartbeat() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no answer to a heartbeat within ${WAIT_MS}ms`)), WAIT_MS);
        answers.push(() => {
          clearTimeout(timer);
          resolve();
        });
        socket.send(JSON.stringify(HEARTBEAT.beat));
      });
    },
    queued() {
      return [...arrived];
    },
    received: () => [...all],
    send(message) {
      socket.send(JSON.stringify(message));
    },
    async close() {
      socket.close(1000, "left");
      await closed;
    },
    async drop() {
      socket.close(LOST_CLOSE_CODE, "lost");
      await closed;
    },
    closed() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`still open after ${WAIT_MS}ms`)), WAIT_MS);
        void closed.then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
