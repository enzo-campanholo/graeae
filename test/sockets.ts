// A tab's signaling connection, as the tests drive it: open a room's socket, read what
// the instance sends, close it the way a closing tab does.

import { expect, onTestFinished } from "vitest";
import { roomSocketPath, type RoomView, type ServerMessage } from "../src/shared/socket/index.ts";
import type { Client } from "./harness.ts";

/** How long a test waits for a message before it fails. */
const WAIT_MS = 2000;

export interface Tab {
  /** The next message the instance sent this tab, in order. */
  next(): Promise<ServerMessage>;
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
  const { response, socket } = await browser.openSocket(roomSocketPath(addressOf(room)));
  expect(response.status, "the socket was refused").toBe(101);
  const tab = listen(socket!);
  const first = await tab.next();
  if (first.type !== "state") throw new Error(`expected the full state first, got ${JSON.stringify(first)}`);
  return { tab, state: first.state };
}

function listen(socket: WebSocket): Tab {
  const arrived: ServerMessage[] = [];
  const waiting: ((message: ServerMessage) => void)[] = [];
  const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve()));

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string) as ServerMessage;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else arrived.push(message);
  });
  // Every tab leaves before the next test resets the instance under it.
  onTestFinished(async () => {
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, "left");
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
