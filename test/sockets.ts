// A tab's signaling connection, as the tests drive it: open a room's socket or the list
// of rooms' socket, read what the instance sends, send requests, close it the way a
// closing tab does.

import { expect, onTestFinished } from "vitest";
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
  /** The next message the instance sent this tab, in order. */
  next(): Promise<Message>;
  /** Every message the instance has sent this tab so far, read or not, the full state first. */
  received(): readonly Message[];
  /** Sends a request, as the page does. */
  send(message: ClientMessage): void;
  /** Closes the socket cleanly, as a tab that is closed, reloaded or navigated away does. */
  close(): Promise<void>;
  /** Resolves once the socket has closed, whoever closed it; fails if it stays open. */
  closed(): Promise<void>;
}

/** The room at `/r/<address>` as `room` names it, or its bare address. */
export function addressOf(room: string): string {
  return room.replace(/^\/r\//, "");
}

/** Opens a tab on `room` and reads the full state it gets first. */
export async function openRoom(browser: Client, room: string): Promise<{ tab: Tab; state: RoomView }> {
  return open<ServerMessage, RoomView>(browser, roomSocketPath(addressOf(room)));
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
  const first = (await tab.next()) as Message & { state?: State };
  if (first.type !== "state") throw new Error(`expected the full state first, got ${JSON.stringify(first)}`);
  return { tab, state: first.state! };
}

function listen<Message>(socket: WebSocket): Tab<Message> {
  const all: Message[] = [];
  const arrived: Message[] = [];
  const waiting: ((message: Message) => void)[] = [];
  const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve()));

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string) as Message;
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
    received: () => [...all],
    send(message) {
      socket.send(JSON.stringify(message));
    },
    async close() {
      socket.close(1000, "left");
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
