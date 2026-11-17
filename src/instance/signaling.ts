// The instance's side of the signaling connections: every open tab's socket, held as a
// hibernating WebSocket so the instance can sleep while tabs sit open. Who is present in
// a room is read from these sockets and nowhere else (ADR 0002).
//
// Two kinds of tab hold a socket: a tab showing a room, and a tab showing the list of
// rooms. Only the first makes its member present anywhere.
//
// The message protocol itself is in `src/shared/socket/`, which the page imports too.

import type { ClientMessage, RoomView, ServerMessage } from "../shared/socket/index.ts";
import type { ListMessage, ListState } from "../shared/socket/list.ts";

/** What each socket remembers about its tab, kept with it through hibernation. */
export interface Tab {
  /** This tab's own id, unique per socket. */
  id: string;
  member: string;
  device: string;
  /** The address of the room the tab is showing. */
  room: string;
}

/** What a list of rooms' socket remembers about its tab. It shows no room. */
interface ListTab {
  id: string;
  member: string;
  device: string;
  list: true;
}

// Tags let the instance find sockets without waking every one of them. A member's and a
// device's tags are there for cutting them off (tickets 07 and 09); they are on list
// sockets too.
const roomTag = (address: string) => `room:${address}`;
const memberTag = (id: string) => `member:${id}`;
const deviceTag = (id: string) => `device:${id}`;
const LIST_TAG = "list";

export class Signaling {
  /**
   * `presenceChanged` hears the address of each room whose present members just
   * changed, once the change is counted, so the lists of rooms can be told.
   */
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly presenceChanged: (address: string) => void = () => {},
  ) {}

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
    if (arrived) this.presenceChanged(address);
    return new Response(null, { status: 101, webSocket: browserEnd });
  }

  /**
   * Opens a socket for a tab of `member` on `device` showing the list of rooms, and sends
   * it the whole list. The member becomes present nowhere.
   */
  openList(member: string, device: string, list: ListState): Response {
    const { 0: browserEnd, 1: ours } = new WebSocketPair();
    const tab: ListTab = { id: crypto.randomUUID(), member, device, list: true };
    this.ctx.acceptWebSocket(ours, [LIST_TAG, memberTag(member), deviceTag(device)]);
    ours.serializeAttachment(tab);
    send(ours, { type: "state", state: list });
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
    if (!tab || !isRoomTab(tab)) return;
    const others = this.tabs(tab.room).filter((other) => other.id !== tab.id);
    if (!others.some((other) => other.member === tab.member)) {
      this.toRoom(tab.room, { type: "presence", change: { type: "left", member: tab.member } }, tab.id);
      this.presenceChanged(tab.room);
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

  /** Sends `message` to every open tab of `member` that is showing a room, whichever room. */
  toMember(member: string, message: ServerMessage) {
    for (const socket of this.ctx.getWebSockets(memberTag(member))) {
      const tab = tabOf(socket);
      if (tab && isRoomTab(tab)) send(socket, message);
    }
  }

  /** Sends `message` to every open list of rooms whose member is one of `members`. */
  toLists(members: ReadonlySet<string>, message: ListMessage) {
    for (const socket of this.ctx.getWebSockets(LIST_TAG)) {
      const tab = tabOf(socket);
      if (tab && members.has(tab.member)) send(socket, message);
    }
  }

  private tabs(address: string): Tab[] {
    return this.ctx
      .getWebSockets(roomTag(address))
      .map(tabOf)
      .filter((tab): tab is Tab => tab !== null && isRoomTab(tab));
  }
}

function isRoomTab(tab: Tab | ListTab): tab is Tab {
  return !("list" in tab);
}

/** The tab behind an open socket, or null once it is closing. */
function tabOf(socket: WebSocket): Tab | ListTab | null {
  return socket.readyState === WebSocket.OPEN ? attachment(socket) : null;
}

/** The tab a socket was opened for, whatever state the socket is in now. */
function attachment(socket: WebSocket): Tab | ListTab | null {
  return (socket.deserializeAttachment() as Tab | ListTab | null) ?? null;
}

function send(socket: WebSocket, message: ServerMessage | ListMessage) {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Closing as we speak: its close handler deals with it.
  }
}
