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
  /** Set when the instance closed the socket itself and has already told the room. */
  cutOff?: true;
}

/**
 * The close code of a socket whose device the instance no longer remembers. The page
 * learns nothing more from it than from any refusal: it becomes "nothing here".
 */
export const GONE_CLOSE_CODE = 4404;

/** What a list of rooms' socket remembers about its tab. It shows no room. */
interface ListTab {
  id: string;
  member: string;
  device: string;
  list: true;
}

// Tags let the instance find sockets without waking every one of them. A device's tag
// finds the tabs to close when it is forgotten; a member's is there for removal (ticket
// 09). Both are on list sockets too.
const roomTag = (address: string) => `room:${address}`;
const memberTag = (id: string) => `member:${id}`;
const deviceTag = (id: string) => `device:${id}`;
const tabTag = (id: string) => `tab:${id}`;
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
    this.ctx.acceptWebSocket(ours, [roomTag(address), memberTag(member), deviceTag(device), tabTag(tab.id)]);
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
   * Returns the tab when it was showing a room, so the instance can end what it sent.
   */
  closed(socket: WebSocket, code?: number, reason?: string): Tab | null {
    // Finish the closing handshake the browser started.
    try {
      // Codes such as 1005 and 1006 describe a close and may not be sent; answer those with 1000.
      const echo = code !== undefined && (code === 1000 || (code >= 3000 && code < 5000));
      socket.close(echo ? code : 1000, reason);
    } catch {
      // Already closed.
    }
    const tab = attachment(socket);
    if (!tab || !isRoomTab(tab) || tab.cutOff) return null;
    this.left(tab);
    return tab;
  }

  /**
   * Closes every tab of the device `id`, rooms and lists alike, which has just been
   * forgotten. Each room hears that the member left where that was their last tab there.
   * Returns the room tabs it closed, so the instance can end what they were sending.
   */
  closeDevice(id: string): Tab[] {
    const closed: Tab[] = [];
    for (const socket of this.ctx.getWebSockets(deviceTag(id))) {
      const tab = tabOf(socket);
      if (!tab) continue;
      if (isRoomTab(tab)) socket.serializeAttachment({ ...tab, cutOff: true } satisfies Tab);
      // Said as well as done: a close frame can be lost on the way, a message is not.
      send(socket, { type: "gone" });
      try {
        socket.close(GONE_CLOSE_CODE, "");
      } catch {
        // Already closed.
      }
      if (isRoomTab(tab)) {
        this.left(tab);
        closed.push(tab);
      }
    }
    return closed;
  }

  /** `tab` is gone: the room hears that its member left if it was their last tab there. */
  private left(tab: Tab) {
    const others = this.tabs(tab.room).filter((other) => other.id !== tab.id);
    if (!others.some((other) => other.member === tab.member)) {
      this.toRoom(tab.room, { type: "presence", change: { type: "left", member: tab.member } }, tab.id);
      this.presenceChanged(tab.room);
    }
  }

  /**
   * A message from a tab showing a room, with the tab it came from. Null when it is not
   * JSON or comes from a list of rooms. The message is only shaped like a
   * `ClientMessage`: whoever acts on it checks what it holds.
   */
  received(socket: WebSocket, data: string | ArrayBuffer): { tab: Tab; message: ClientMessage } | null {
    const tab = tabOf(socket);
    if (!tab || !isRoomTab(tab) || typeof data !== "string") return null;
    try {
      const message: unknown = JSON.parse(data);
      if (typeof message !== "object" || message === null) return null;
      return { tab, message: message as ClientMessage };
    } catch {
      return null;
    }
  }

  /** Whether the tab `id` still has its socket open. */
  isOpen(id: string): boolean {
    return this.ctx.getWebSockets(tabTag(id)).some((socket) => tabOf(socket) !== null);
  }

  /** Sends `message` to the one tab `id`, if it is still open. */
  toTab(id: string, message: ServerMessage) {
    for (const socket of this.ctx.getWebSockets(tabTag(id))) {
      if (tabOf(socket)) send(socket, message);
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

  /** Sends `message` to every open tab of `member` on the room at `address`. */
  toMemberIn(address: string, member: string, message: ServerMessage) {
    for (const socket of this.ctx.getWebSockets(memberTag(member))) {
      const tab = tabOf(socket);
      if (tab && isRoomTab(tab) && tab.room === address) send(socket, message);
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
