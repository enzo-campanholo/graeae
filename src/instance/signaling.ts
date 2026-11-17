// The instance's side of the signaling connections: every open tab's socket, held as a
// hibernating WebSocket so the instance can sleep while tabs sit open. Who is present in
// a room is read from these sockets and nowhere else (ADR 0002).
//
// The message protocol itself is in `src/shared/socket/`, which the page imports too.

import type { ClientMessage, RoomView, ServerMessage } from "../shared/socket/index.ts";

/** What each socket remembers about its tab, kept with it through hibernation. */
export interface Tab {
  /** This tab's own id, unique per socket. */
  id: string;
  member: string;
  device: string;
  /** The address of the room the tab is showing. */
  room: string;
  /** Set when the instance closed the socket itself and has already told the room. */
  cutOff?: true;
}

/**
 * The close code of a socket whose device the instance no longer remembers. The page
 * learns nothing more from it than from any refusal: it becomes "nothing here".
 */
export const GONE_CLOSE_CODE = 4404;

// Tags let the instance find sockets without waking every one of them. A device's tag
// finds the tabs to close when it is forgotten; a member's is there for removal (ticket 09).
const roomTag = (address: string) => `room:${address}`;
const memberTag = (id: string) => `member:${id}`;
const deviceTag = (id: string) => `device:${id}`;

export class Signaling {
  constructor(private readonly ctx: DurableObjectState) {}

  /**
   * Opens a socket for a tab of `member` on `device` showing the room at `address`, whom
   * the caller has already checked. Tells the room's other tabs if the member has just
   * arrived, then sends the new tab the whole room, as `view` builds it once the tab is
   * counted. Returns the answer that hands the browser its end of the socket.
   */
  open(member: string, device: string, address: string, view: () => RoomView): Response {
    const arrived = !this.present(address).has(member);
    if (arrived) this.toRoom(address, { type: "presence", change: { type: "arrived", member } });

    const { 0: browserEnd, 1: ours } = new WebSocketPair();
    const tab: Tab = { id: crypto.randomUUID(), member, device, room: address };
    this.ctx.acceptWebSocket(ours, [roomTag(address), memberTag(member), deviceTag(device)]);
    ours.serializeAttachment(tab);
    send(ours, { type: "state", state: view() });
    return new Response(null, { status: 101, webSocket: browserEnd });
  }

  /**
   * A tab's socket has closed (with the browser's close `code`) or failed: its presence
   * ends now, and the room hears that its member left if this was their last tab there.
   */
  closed(socket: WebSocket, code?: number, reason?: string) {
    // Finish the closing handshake the browser started.
    try {
      // Codes such as 1005 and 1006 describe a close and may not be sent; answer those with 1000.
      const echo = code !== undefined && (code === 1000 || (code >= 3000 && code < 5000));
      socket.close(echo ? code : 1000, reason);
    } catch {
      // Already closed.
    }
    const tab = attachment(socket);
    if (tab && !tab.cutOff) this.left(tab);
  }

  /**
   * Closes every tab of the device `id`, which has just been forgotten. Each room hears
   * that the member left where that was their last tab there.
   */
  closeDevice(id: string) {
    for (const socket of this.ctx.getWebSockets(deviceTag(id))) {
      const tab = tabOf(socket);
      if (!tab) continue;
      socket.serializeAttachment({ ...tab, cutOff: true } satisfies Tab);
      // Said as well as done: a close frame can be lost on the way, a message is not.
      send(socket, { type: "gone" });
      try {
        socket.close(GONE_CLOSE_CODE, "");
      } catch {
        // Already closed.
      }
      this.left(tab);
    }
  }

  /** `tab` is gone: the room hears that its member left if it was their last tab there. */
  private left(tab: Tab) {
    const others = this.tabs(tab.room).filter((other) => other.id !== tab.id);
    if (!others.some((other) => other.member === tab.member)) {
      this.toRoom(tab.room, { type: "presence", change: { type: "left", member: tab.member } }, tab.id);
    }
  }

  /**
   * A message from a tab, read as a `ClientMessage`; null when it is not one. No area
   * asks anything of the instance yet (ticket 06 adds the heartbeat), so the instance
   * ignores every message, as it always will one it does not understand.
   */
  received(socket: WebSocket, data: string | ArrayBuffer): ClientMessage | null {
    if (!tabOf(socket) || typeof data !== "string") return null;
    try {
      return JSON.parse(data) as ClientMessage;
    } catch {
      return null;
    }
  }

  /** The ids of the members present in the room at `address`, each once. */
  present(address: string): Set<string> {
    return new Set(this.tabs(address).map((tab) => tab.member));
  }

  /** Sends `message` to every open tab on the room at `address`, except the tab `exceptTab`. */
  toRoom(address: string, message: ServerMessage, exceptTab?: string) {
    for (const socket of this.ctx.getWebSockets(roomTag(address))) {
      const tab = tabOf(socket);
      if (tab && tab.id !== exceptTab) send(socket, message);
    }
  }

  private tabs(address: string): Tab[] {
    return this.ctx
      .getWebSockets(roomTag(address))
      .map(tabOf)
      .filter((tab): tab is Tab => tab !== null);
  }
}

/** The tab behind an open socket, or null once it is closing. */
function tabOf(socket: WebSocket): Tab | null {
  return socket.readyState === WebSocket.OPEN ? attachment(socket) : null;
}

/** The tab a socket was opened for, whatever state the socket is in now. */
function attachment(socket: WebSocket): Tab | null {
  return (socket.deserializeAttachment() as Tab | null) ?? null;
}

function send(socket: WebSocket, message: ServerMessage) {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Closing as we speak: its close handler deals with it.
  }
}
