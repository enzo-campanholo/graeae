import { DurableObject } from "cloudflare:workers";
import type {
  CreateInviteAnswer,
  CreateRoomAnswer,
  DeviceInviteAnswer,
  InviteAnswer,
  InvitesAnswer,
  JoinAnswer,
  Me,
  MeAnswer,
  OwnerRoomsAnswer,
  RenameRoomAnswer,
  RoomAnswer,
  RoomsAnswer,
  RoomSummary,
  SetupAnswer,
} from "../shared/api.ts";
import type { ClientMessage, LiveShare, RoomView } from "../shared/socket/index.ts";
import { LIST_SOCKET_PATH, type ListedRoom, type ListState } from "../shared/socket/list.ts";
import { done, json, nothingHere, page, redirect } from "./answers.ts";
import { mediaLayer } from "./media/index.ts";
import { applyMigrations, migrations, type Migration } from "./migrations.ts";
import { FORGET_DEVICE_COOKIE, People, type Member, type Visitor } from "./people.ts";
import { isSetupSecret, missingSecrets } from "./setup-secret.ts";
import { Shares } from "./shares.ts";
import { Signaling, type Tab } from "./signaling.ts";

/** The name of the instance's one Durable Object. Every request reaches the same one. */
export const INSTANCE_NAME = "instance";

/** The owner page's sections, each at `/owner/<section>`. `/owner` itself opens the first. */
const OWNER_SECTIONS = ["people", "invites", "rooms", "usage"];

/** The instance: one Durable Object holding all of its state (ADR 0002). */
export class Instance extends DurableObject<Env> {
  /** The migrations this code ships with. The test harness swaps them to start on an older schema. */
  static migrations: readonly Migration[] = migrations;

  private readonly people: People;
  private readonly signaling: Signaling;
  private readonly shares: Shares;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.people = new People(ctx.storage.sql);
    this.signaling = new Signaling(ctx, (address) => this.relist(address));
    this.shares = new Shares(ctx.storage.sql, mediaLayer(env));
    // Nothing reaches the instance until its storage is on this code's schema.
    void ctx.blockConcurrencyWhile(async () => applyMigrations(ctx.storage, Instance.migrations));
  }

  override async fetch(request: Request): Promise<Response> {
    const visitor = await this.people.recognise(request);
    // Every visit from a remembered device renews it, whatever the address.
    if (visitor) this.people.visited(visitor);
    const response = await this.answer(request, visitor);
    return visitor ? this.people.renewCookie(request, response) : response;
  }

  private async answer(request: Request, visitor: Visitor | null): Promise<Response> {
    const { pathname } = new URL(request.url);
    const { method } = request;
    const refuse = () => nothingHere(this.env.ASSETS, request);

    if (method === "POST" && pathname === "/api/setup") return this.setup(request, visitor);

    // An invite is for a browser the instance may not know yet. Opening it, or merely
    // fetching its address as a link preview does, uses nothing up: only the press does.
    const invitePage = /^\/invite\/([^/]+)$/.exec(pathname);
    if (invitePage) {
      const pending = method === "GET" && this.people.openInvite(invitePage[1]!);
      return pending ? page(this.env.ASSETS, request) : refuse();
    }
    const inviteData = /^\/api\/invites\/([^/]+)$/.exec(pathname);
    if (inviteData) {
      const code = inviteData[1]!;
      if (method === "POST") return this.join(request, visitor, code);
      const pending = method === "GET" && this.people.openInvite(code);
      return pending ? json({ name: pending.name } satisfies InviteAnswer) : refuse();
    }

    if (!visitor) return refuse();
    const { member } = visitor;
    if (pathname === "/owner" || pathname.startsWith("/owner/") || pathname.startsWith("/api/owner/")) {
      return member.owner ? this.ownerAnswer(request, pathname, member) : refuse();
    }
    if (pathname === "/api/me" || pathname.startsWith("/api/me/")) return this.youAnswer(request, pathname, visitor);
    if (method !== "GET") return refuse();
    if (pathname === "/you") return page(this.env.ASSETS, request);

    if (pathname === "/") {
      const rooms = this.people.rooms(member);
      return rooms.length === 1 ? redirect(roomPath(rooms[0]!.address)) : page(this.env.ASSETS, request);
    }
    const roomPage = /^\/r\/([^/]+)$/.exec(pathname);
    if (roomPage) {
      return this.people.room(member, roomPage[1]!) ? page(this.env.ASSETS, request) : refuse();
    }
    const me: Me = { name: member.name, owner: member.owner };
    if (pathname === "/api/rooms") {
      return json({ rooms: this.people.rooms(member), me } satisfies RoomsAnswer);
    }
    const roomData = /^\/api\/rooms\/([^/]+)$/.exec(pathname);
    if (roomData) {
      const room = this.people.room(member, roomData[1]!);
      return room ? json({ room, me } satisfies RoomAnswer) : refuse();
    }
    const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    if (pathname === LIST_SOCKET_PATH) {
      return upgrade ? this.signaling.openList(member.id, visitor.deviceId, this.list(member)) : refuse();
    }
    const socket = /^\/api\/socket\/([^/]+)$/.exec(pathname);
    if (socket) {
      const room = this.people.room(member, socket[1]!);
      if (!room || !upgrade) return refuse();
      return this.signaling.open(member.id, visitor.deviceId, room.address, () => this.roomView(member, room));
    }
    return refuse();
  }

  /** The "You" page's data and actions, the same for every member and the owner. */
  private async youAnswer(request: Request, pathname: string, visitor: Visitor): Promise<Response> {
    const { method } = request;
    const { member } = visitor;
    const refuse = () => nothingHere(this.env.ASSETS, request);

    if (pathname === "/api/me" && method === "GET") {
      const devices = this.people.devices(member).map((device) => ({
        ...device,
        current: device.id === visitor.deviceId,
      }));
      return json({ name: member.name, owner: member.owner, devices } satisfies MeAnswer);
    }
    if (pathname === "/api/me/name" && method === "POST") {
      const body = await request.json<{ name?: unknown }>().catch(() => null);
      const renamed = body && this.people.rename(member, body.name);
      if (!renamed) return refuse();
      for (const room of this.people.rooms(renamed)) {
        this.signaling.toRoom(room.address, {
          type: "people",
          change: { type: "renamed", member: renamed.id, name: renamed.name },
        });
        // The lists of rooms name the members present, so a line changes only where they are.
        if (this.signaling.present(room.address).has(renamed.id)) this.relist(room.address);
      }
      return json({ name: renamed.name, owner: renamed.owner } satisfies Me);
    }
    if (pathname === "/api/me/devices" && method === "POST") {
      return json({ invite: this.people.createDeviceInvite(member) } satisfies DeviceInviteAnswer);
    }
    const device = /^\/api\/me\/devices\/([^/]+)$/.exec(pathname);
    if (device && method === "DELETE") {
      const id = device[1]!;
      // Storage first, so the forgotten browser is refused from this instant, then its tabs.
      if (!this.people.forgetDevice(member, id)) return refuse();
      // Its tabs are gone, so whatever they were sending ends as on a clean leave.
      for (const tab of this.signaling.closeDevice(id)) await this.left(tab);
      return id === visitor.deviceId ? withCookie(done(), FORGET_DEVICE_COOKIE) : done();
    }
    return refuse();
  }

  override async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    const received = this.signaling.received(socket, data);
    if (received) await this.request(received.tab, received.message);
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const tab = this.signaling.closed(socket, code, reason);
    if (tab) await this.left(tab);
  }

  override async webSocketError(socket: WebSocket) {
    const tab = this.signaling.closed(socket);
    if (tab) await this.left(tab);
  }

  /**
   * A request from a tab showing a room. The tab is present there, since its socket is
   * open on the room; its device and its access are checked again here, as they may
   * have gone since the socket opened. A request the instance does not understand, or
   * from a tab that fails a check, gets the refusal its area has, or nothing.
   */
  private async request(tab: Tab, message: ClientMessage) {
    const request: unknown = (message as { request?: unknown }).request;
    if (typeof request !== "object" || request === null) return;
    const { type } = request as { type?: unknown };
    const member = this.people.deviceMember(tab.device);
    const allowed = member !== null && member.id === tab.member && this.people.room(member, tab.room) !== null;

    if (message.type === "media" && type === "connect") {
      if (!allowed) return;
      const iceServers = await this.shares.connect(tab);
      if (iceServers === "already") return;
      this.signaling.toTab(
        tab.id,
        iceServers ? { type: "media", change: { type: "connected", iceServers } } : { type: "media", change: { type: "unavailable" } },
      );
      return;
    }
    if (message.type !== "shares") return;
    if (type === "start") {
      const { kind, offer, video } = request as { kind?: unknown; offer?: unknown; video?: unknown };
      if (kind !== "webcam") return;
      const started =
        allowed && isSdp(offer) && isMid(video)
          ? await this.shares.startWebcam(tab, tab.member, offer, video, () => this.signaling.isOpen(tab.id))
          : { live: false as const };
      if (!started.live) {
        this.signaling.toTab(tab.id, { type: "media", change: { type: "refused", kind } });
        return;
      }
      this.signaling.toTab(tab.id, { type: "media", change: { type: "published", kind, answer: started.answer } });
      this.shareChanged(tab.room, { type: "started", share: started.share });
      return;
    }
    if (type === "stop") {
      const { kind } = request as { kind?: unknown };
      if (kind !== "webcam" && kind !== "screen") return;
      // Stopping needs no check: it only ever takes something away.
      const ended = await this.shares.stop(tab, kind);
      if (ended) this.shareChanged(tab.room, { type: "ended", share: ended });
    }
  }

  /** A tab left cleanly, or its grace period ran out: whatever it was sending ends with it. */
  private async left(tab: Tab) {
    for (const share of await this.shares.left(tab)) this.shareChanged(tab.room, { type: "ended", share });
  }

  /** Tells the room and the lists of rooms that a share started or ended. */
  private shareChanged(address: string, change: { type: "started" | "ended"; share: LiveShare }) {
    this.signaling.toRoom(address, { type: "shares", change });
    this.relist(address);
  }

  /** The grace periods' moments are the only thing the alarm wakes the instance for yet. */
  override async alarm() {
    for (const tab of this.signaling.alarm()) await this.left(tab);
  }

  /** The whole room as `member`'s tab sees it: what a tab gets on connecting. */
  private roomView(member: Member, room: RoomSummary): RoomView {
    return {
      room,
      people: {
        you: { id: member.id, owner: member.owner, rooms: this.people.rooms(member).length },
        members: this.people.membersOf(room.address).map(({ id, name }) => ({ id, name })),
      },
      presence: {
        present: [...this.signaling.present(room.address)],
        reconnecting: this.signaling.reconnecting(room.address),
      },
      shares: { live: this.shares.live(room.address) },
      usage: {},
    };
  }

  /** The whole list of rooms as `member` sees it: what the list gets on connecting. */
  private list(member: Member): ListState {
    return { you: { owner: member.owner }, rooms: this.people.rooms(member).map((room) => this.listed(room)) };
  }

  /** A room's line in the list of rooms. It reads the same to every member with access. */
  private listed(room: RoomSummary): ListedRoom {
    const present = this.signaling.present(room.address);
    const names = this.people
      .membersOf(room.address)
      .filter((person) => present.has(person.id))
      .map((person) => person.name)
      .toSorted((a, b) => a.localeCompare(b));
    return { ...room, present: names, live: this.shares.live(room.address).length };
  }

  /**
   * Tells the lists of rooms of every member with access to the room at `address` how
   * its line reads now. Called whenever the line changes: a rename, presence, a new room,
   * or a present member's new display name.
   */
  private relist(address: string) {
    const room = this.people.allRooms().find((candidate) => candidate.address === address);
    if (!room) return;
    const members = new Set(this.people.membersOf(address).map((person) => person.id));
    this.signaling.toLists(members, { type: "rooms", change: { type: "listed", room: this.listed(room) } });
  }

  /** The owner page and the owner's actions. Only the owner's devices get this far. */
  private async ownerAnswer(request: Request, pathname: string, owner: Member): Promise<Response> {
    const { method } = request;
    const refuse = () => nothingHere(this.env.ASSETS, request);

    const section = /^\/owner(?:\/([^/]+))?$/.exec(pathname);
    if (section) {
      const known = section[1] === undefined || OWNER_SECTIONS.includes(section[1]);
      return method === "GET" && known ? page(this.env.ASSETS, request) : refuse();
    }
    if (pathname === "/api/owner/invites") {
      if (method === "GET") {
        return json({
          rooms: this.people.allRooms(),
          invites: this.people.pendingInvites(),
        } satisfies InvitesAnswer);
      }
      if (method === "POST") {
        const body = await request.json<{ name?: unknown; rooms?: unknown }>().catch(() => null);
        const invite = body && this.people.createInvite(body.name, body.rooms);
        return invite ? json({ invite } satisfies CreateInviteAnswer) : refuse();
      }
      return refuse();
    }
    if (pathname === "/api/owner/rooms") {
      if (method === "GET") return json({ rooms: this.people.allRooms() } satisfies OwnerRoomsAnswer);
      if (method !== "POST") return refuse();
      const body = await request.json<{ name?: unknown }>().catch(() => null);
      const room = body && this.people.newRoom(body.name);
      if (!room) return refuse();
      // The owner has every room by rule, so only the owner gained access.
      this.signaling.toMember(owner.id, {
        type: "people",
        change: { type: "access", rooms: this.people.rooms(owner).length },
      });
      this.relist(room.address);
      return json({ room } satisfies CreateRoomAnswer);
    }
    const ownerRoom = /^\/api\/owner\/rooms\/([^/]+)$/.exec(pathname);
    if (ownerRoom && method === "PATCH") {
      const body = await request.json<{ name?: unknown }>().catch(() => null);
      const room = body && this.people.renameRoom(ownerRoom[1]!, body.name);
      if (!room) return refuse();
      this.signaling.toRoom(room.address, { type: "room", change: { type: "renamed", name: room.name } });
      this.relist(room.address);
      return json({ room } satisfies RenameRoomAnswer);
    }
    const invite = /^\/api\/owner\/invites\/([^/]+)$/.exec(pathname);
    if (invite && method === "DELETE") {
      return this.people.cancelInvite(invite[1]!) ? done() : refuse();
    }
    return refuse();
  }

  /** `POST /api/setup` with `{ secret }`: the setup page sends the secret here itself. */
  private async setup(request: Request, visitor: Visitor | null): Promise<Response> {
    const body = await request.json<{ secret?: unknown }>().catch(() => null);
    if (!(await isSetupSecret(this.env, body?.secret))) return nothingHere(this.env.ASSETS, request);

    const { owner, cookie } = await this.people.becomeOwner(request, visitor);
    return withCookie(
      json({ to: this.landing(owner), missing: missingSecrets(this.env) } satisfies SetupAnswer),
      cookie,
    );
  }

  /** `POST /api/invites/<code>`: the press of the invite page's one button. */
  private async join(request: Request, visitor: Visitor | null, code: string): Promise<Response> {
    const joined = await this.people.join(request, visitor, code);
    if (!joined) return nothingHere(this.env.ASSETS, request);
    const { id, name } = joined.member;
    for (const room of this.people.rooms(joined.member)) {
      this.signaling.toRoom(room.address, { type: "people", change: { type: "added", person: { id, name } } });
    }
    return withCookie(json({ to: this.landing(joined.member) } satisfies JoinAnswer), joined.cookie);
  }

  /** Where a member goes on arriving: into their room when they have one, otherwise the root address. */
  private landing(member: Member): string {
    const rooms = this.people.rooms(member);
    return rooms.length === 1 ? roomPath(rooms[0]!.address) : "/";
  }
}

/** The longest SDP offer the instance passes on. A real one is a few kilobytes. */
const SDP_MAX = 64 * 1024;

function isSdp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= SDP_MAX;
}

/** A transceiver's mid: a short token the browser picks. */
function isMid(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,32}$/.test(value);
}

function withCookie(response: Response, cookie: string): Response {
  response.headers.append("Set-Cookie", cookie);
  return response;
}

function roomPath(address: string): string {
  return `/r/${address}`;
}
