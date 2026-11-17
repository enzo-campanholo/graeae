// The instance's side of the signaling connections: every open tab's socket, held as a
// hibernating WebSocket so the instance can sleep while tabs sit open. Who is present in
// a room is read from these sockets (ADR 0002), and from the tabs whose connection was
// lost and which are still in their grace period.
//
// Two kinds of tab hold a socket: a tab showing a room, and a tab showing the list of
// rooms. Only the first makes its member present anywhere.
//
// The grace period. Every tab beats every 5 seconds. A tab whose socket fails, or closes
// with `LOST_CLOSE_CODE`, is kept as a lost tab, and its member stays present until 30
// seconds after it was last heard; a socket that stays open but falls silent is treated
// the same way and closed when its time runs out. A browser that reconnects to the same
// room from the same device takes its lost tab back, id and all. After 10 seconds in
// which none of a present member's tabs in a room was heard, that room is told the member
// is "reconnecting", and told again when one is heard. Lost tabs and the marks the rooms
// were told are kept in storage, so they outlast the instance sleeping. The instance's
// alarm wakes it for each of these moments.
//
// The message protocol itself is in `src/shared/socket/`, which the page imports too.

import {
  GRACE_MS,
  HEARTBEAT,
  LOST_CLOSE_CODE,
  RECONNECTING_AFTER_MS,
  SILENT_CLOSE_CODE,
} from "../shared/socket/heartbeat.ts";
import type { ClientMessage, RoomView, ServerMessage } from "../shared/socket/index.ts";
import type { ListMessage, ListState } from "../shared/socket/list.ts";

/** What each socket remembers about its tab, kept with it through hibernation. */
export interface Tab {
  /** This tab's own id, unique per socket, and kept by the socket that takes over a lost tab. */
  id: string;
  member: string;
  device: string;
  /** The address of the room the tab is showing. */
  room: string;
  /** When the instance last heard from the tab: its opening or its latest heartbeat. */
  heardAt: number;
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
  heardAt: number;
  cutOff?: true;
}

// Tags let the instance find sockets without waking every one of them. A device's tag
// finds the tabs to close when it is forgotten; a member's is there for removal (ticket
// 09). Both are on list sockets too.
const roomTag = (address: string) => `room:${address}`;
const memberTag = (id: string) => `member:${id}`;
const deviceTag = (id: string) => `device:${id}`;
const tabTag = (id: string) => `tab:${id}`;
const LIST_TAG = "list";

// Storage keys. Lost tabs are rare and short-lived, so each change rewrites the whole list.
const LOST_KEY = "signaling:lost";
const MARKS_KEY = "signaling:reconnecting";

/** The members each room has been told are "reconnecting", by address. */
type Marks = Record<string, string[]>;

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
   * arrived, or is heard again after the "reconnecting" mark, then sends the new tab the
   * whole room, as `view` builds it for the tab once it is counted. Returns the answer that hands
   * the browser its end of the socket.
   */
  open(member: string, device: string, address: string, view: (tab: string) => RoomView): Response {
    const arrived = !this.present(address).has(member);
    if (arrived) this.toRoom(address, { type: "presence", change: { type: "arrived", member } });
    const resumed = this.resume(device, address);

    const { 0: browserEnd, 1: ours } = new WebSocketPair();
    const tab: Tab = { id: resumed?.id ?? crypto.randomUUID(), member, device, room: address, heardAt: Date.now() };
    this.ctx.acceptWebSocket(ours, [roomTag(address), memberTag(member), deviceTag(device), tabTag(tab.id)]);
    ours.serializeAttachment(tab);
    this.mark(address, tab.id);
    send(ours, { type: "state", state: view(tab.id) });
    if (arrived) this.presenceChanged(address);
    this.schedule();
    return new Response(null, { status: 101, webSocket: browserEnd });
  }

  /**
   * Opens a socket for a tab of `member` on `device` showing the list of rooms, and sends
   * it the whole list. The member becomes present nowhere.
   */
  openList(member: string, device: string, list: ListState): Response {
    const { 0: browserEnd, 1: ours } = new WebSocketPair();
    const tab: ListTab = { id: crypto.randomUUID(), member, device, list: true, heardAt: Date.now() };
    this.ctx.acceptWebSocket(ours, [LIST_TAG, memberTag(member), deviceTag(device)]);
    ours.serializeAttachment(tab);
    send(ours, { type: "state", state: list });
    this.schedule();
    return new Response(null, { status: 101, webSocket: browserEnd });
  }

  /**
   * A tab's socket has closed (with the browser's close `code`) or failed (no code). A
   * clean close ends its presence now, and the room hears that its member left if this
   * was their last tab there. A lost connection keeps the tab for its grace period.
   * Returns the tab when it was showing a room and has left, so the instance can end
   * what it sent; null for a lost one, whose time comes with the alarm.
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
    if (code === undefined || code === 1006 || code === LOST_CLOSE_CODE) {
      this.saveLost([...this.lost(), tab]);
      this.schedule();
      return null;
    }
    this.left(tab);
    return tab;
  }

  /**
   * Closes every tab of the device `id`, rooms and lists alike, which has just been
   * forgotten, and ends any of its lost tabs' grace periods. Each room hears that the
   * member left where that was their last tab there. Returns the room tabs it ended, so
   * the instance can end what they were sending.
   */
  closeDevice(id: string): Tab[] {
    const lost = this.lost();
    const ended = lost.filter((tab) => tab.device === id);
    if (ended.length > 0) this.saveLost(lost.filter((tab) => tab.device !== id));
    for (const tab of ended) this.left(tab);

    for (const socket of this.ctx.getWebSockets(deviceTag(id))) {
      const tab = tabOf(socket);
      if (!tab) continue;
      socket.serializeAttachment({ ...tab, cutOff: true });
      // Said as well as done: a close frame can be lost on the way, a message is not.
      send(socket, { type: "gone" });
      try {
        socket.close(GONE_CLOSE_CODE, "");
      } catch {
        // Already closed.
      }
      if (isRoomTab(tab)) {
        this.left(tab);
        ended.push(tab);
      }
    }
    return ended;
  }

  /**
   * A message from a tab. A heartbeat, from a room or a list, is answered here and gives
   * null. Anything else from a tab showing a room comes back with that tab; it is only
   * shaped like a `ClientMessage`, and whoever acts on it checks what it holds. Null too
   * when it is not JSON or comes from a list of rooms.
   */
  received(socket: WebSocket, data: string | ArrayBuffer): { tab: Tab; message: ClientMessage } | null {
    const tab = tabOf(socket);
    if (!tab || typeof data !== "string") return null;
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
    if (typeof message !== "object" || message === null) return null;
    if ((message as { type?: unknown }).type !== HEARTBEAT.beat.type) {
      return isRoomTab(tab) ? { tab, message: message as ClientMessage } : null;
    }

    socket.serializeAttachment({ ...tab, heardAt: Date.now() });
    send(socket, HEARTBEAT.answer);
    // A heartbeat can only take a mark away, and only its own member's.
    if (isRoomTab(tab) && this.reconnecting(tab.room).includes(tab.member)) this.mark(tab.room);
    return null;
  }

  /**
   * The instance's alarm: ends the presence of every tab whose grace period has run out,
   * closing its socket if it is still open, and marks the members who have fallen silent.
   * Then sets the alarm for the next such moment. Returns the room tabs whose time ran
   * out, so the instance can end what they were sending.
   */
  alarm(): Tab[] {
    const now = Date.now();
    const expired = (tab: Tab | ListTab) => tab.heardAt + GRACE_MS <= now;

    const lost = this.lost();
    const ended = lost.filter(expired);
    if (ended.length > 0) this.saveLost(lost.filter((tab) => !expired(tab)));
    for (const tab of ended) this.left(tab);

    const silent: Tab[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      const tab = tabOf(socket);
      if (!tab || !expired(tab)) continue;
      socket.serializeAttachment({ ...tab, cutOff: true });
      try {
        socket.close(SILENT_CLOSE_CODE, "");
      } catch {
        // Already closed.
      }
      if (isRoomTab(tab)) {
        this.left(tab);
        silent.push(tab);
      }
    }

    const rooms = new Set([...this.roomTabs().map((tab) => tab.room), ...Object.keys(this.marks())]);
    for (const address of rooms) this.mark(address);
    this.schedule();
    return [...ended, ...silent];
  }

  /** Whether the tab `id` still has its socket open. A tab in its grace period does not. */
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

  /** The ids of the members the room at `address` has been told are "reconnecting". */
  reconnecting(address: string): string[] {
    return this.marks()[address] ?? [];
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

  /** `tab` is gone: the room hears that its member left if it was their last tab there. */
  private left(tab: Tab) {
    const others = this.tabs(tab.room).filter((other) => other.id !== tab.id);
    if (others.some((other) => other.member === tab.member)) {
      // Their other tabs may all be silent: the mark depends on those alone now.
      this.mark(tab.room);
      return;
    }
    this.unmark(tab.room, tab.member);
    this.toRoom(tab.room, { type: "presence", change: { type: "left", member: tab.member } }, tab.id);
    this.presenceChanged(tab.room);
  }

  /**
   * Takes back the lost tab of `device` on the room at `address`, the one heard last, as
   * a browser reconnects to that room. Undefined when there is none.
   */
  private resume(device: string, address: string): Tab | undefined {
    const lost = this.lost();
    const mine = lost.filter((tab) => tab.device === device && tab.room === address);
    if (mine.length === 0) return undefined;
    const resumed = mine.reduce((latest, tab) => (tab.heardAt > latest.heardAt ? tab : latest));
    this.saveLost(lost.filter((tab) => tab !== resumed));
    return resumed;
  }

  /**
   * Brings the room at `address`'s "reconnecting" marks up to date: a present member none
   * of whose tabs there was heard in the last 10 seconds is marked, and one who is heard
   * again is not. The room's tabs, but `exceptTab`, hear each change.
   */
  private mark(address: string, exceptTab?: string) {
    const now = Date.now();
    const heard = new Map<string, number>();
    for (const tab of this.tabs(address)) heard.set(tab.member, Math.max(heard.get(tab.member) ?? 0, tab.heardAt));
    const silent = [...heard].filter(([, at]) => now - at >= RECONNECTING_AFTER_MS).map(([member]) => member);

    const before = this.reconnecting(address);
    const marked = silent.filter((member) => !before.includes(member));
    const back = before.filter((member) => heard.has(member) && !silent.includes(member));
    const gone = before.filter((member) => !heard.has(member));
    if (marked.length === 0 && back.length === 0 && gone.length === 0) return;

    this.saveMarks(address, silent);
    for (const member of marked) {
      this.toRoom(address, { type: "presence", change: { type: "reconnecting", member } }, exceptTab);
    }
    for (const member of back) {
      this.toRoom(address, { type: "presence", change: { type: "reconnected", member } }, exceptTab);
    }
  }

  /** Forgets that the room at `address` was told `member` is "reconnecting", without telling it. */
  private unmark(address: string, member: string) {
    const before = this.reconnecting(address);
    if (before.includes(member)) this.saveMarks(address, before.filter((other) => other !== member));
  }

  /**
   * Sets the alarm for the next moment a tab's grace period runs out or a member falls
   * silent. Heartbeats only push those moments later, so an alarm set here before a
   * heartbeat is at worst early: it finds nothing to do and sets the next one.
   */
  private schedule() {
    const now = Date.now();
    const moments: number[] = [];
    for (const tab of [...this.allTabs(), ...this.lost()]) {
      moments.push(tab.heardAt + GRACE_MS);
      if (isRoomTab(tab)) moments.push(tab.heardAt + RECONNECTING_AFTER_MS);
    }
    const next = Math.min(...moments.filter((moment) => moment > now));
    if (Number.isFinite(next)) void this.ctx.storage.setAlarm(next);
    else void this.ctx.storage.deleteAlarm();
  }

  /** Every tab that keeps its member present in the room at `address`: open, and lost in its grace period. */
  private tabs(address: string): Tab[] {
    const open = this.ctx
      .getWebSockets(roomTag(address))
      .map(tabOf)
      .filter((tab): tab is Tab => tab !== null && isRoomTab(tab));
    return [...open, ...this.lost().filter((tab) => tab.room === address)];
  }

  /** Every open room tab, whichever room. */
  private roomTabs(): Tab[] {
    return this.allTabs().filter(isRoomTab);
  }

  /** Every open tab, rooms and lists alike. */
  private allTabs(): (Tab | ListTab)[] {
    return this.ctx
      .getWebSockets()
      .map(tabOf)
      .filter((tab): tab is Tab | ListTab => tab !== null);
  }

  private lost(): Tab[] {
    return this.ctx.storage.kv.get<Tab[]>(LOST_KEY) ?? [];
  }

  private saveLost(tabs: Tab[]) {
    if (tabs.length > 0) this.ctx.storage.kv.put(LOST_KEY, tabs);
    else this.ctx.storage.kv.delete(LOST_KEY);
  }

  private marks(): Marks {
    return this.ctx.storage.kv.get<Marks>(MARKS_KEY) ?? {};
  }

  private saveMarks(address: string, members: string[]) {
    const others = { ...this.marks() };
    delete others[address];
    const marks = members.length > 0 ? { ...others, [address]: members } : others;
    if (Object.keys(marks).length > 0) this.ctx.storage.kv.put(MARKS_KEY, marks);
    else this.ctx.storage.kv.delete(MARKS_KEY);
  }
}

function isRoomTab(tab: Tab | ListTab): tab is Tab {
  return !("list" in tab);
}

/** The tab behind an open socket, or null once it is closing or the instance has cut it off. */
function tabOf(socket: WebSocket): Tab | ListTab | null {
  if (socket.readyState !== WebSocket.OPEN) return null;
  const tab = attachment(socket);
  return tab && !tab.cutOff ? tab : null;
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
