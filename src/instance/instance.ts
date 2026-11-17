import { DurableObject } from "cloudflare:workers";
import type {
  CreateInviteAnswer,
  CreateRoomAnswer,
  InviteAnswer,
  InvitesAnswer,
  JoinAnswer,
  Me,
  MeAnswer,
  RoomAnswer,
  RoomsAnswer,
  RoomSummary,
  SetupAnswer,
} from "../shared/api.ts";
import type { RoomView } from "../shared/socket/index.ts";
import { done, json, nothingHere, page, redirect } from "./answers.ts";
import { applyMigrations, migrations, type Migration } from "./migrations.ts";
import { People, type Member, type Visitor } from "./people.ts";
import { isSetupSecret, missingSecrets } from "./setup-secret.ts";
import { Signaling } from "./signaling.ts";

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.people = new People(ctx.storage.sql);
    this.signaling = new Signaling(ctx);
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
      const pending = method === "GET" && this.people.pendingInvite(invitePage[1]!);
      return pending ? page(this.env.ASSETS, request) : refuse();
    }
    const inviteData = /^\/api\/invites\/([^/]+)$/.exec(pathname);
    if (inviteData) {
      const code = inviteData[1]!;
      if (method === "POST") return this.join(request, visitor, code);
      const pending = method === "GET" && this.people.pendingInvite(code);
      return pending ? json({ name: pending.name } satisfies InviteAnswer) : refuse();
    }

    if (!visitor) return refuse();
    const { member } = visitor;
    if (pathname === "/owner" || pathname.startsWith("/owner/") || pathname.startsWith("/api/owner/")) {
      return member.owner ? this.ownerAnswer(request, pathname) : refuse();
    }
    if (method !== "GET") return refuse();

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
    const socket = /^\/api\/socket\/([^/]+)$/.exec(pathname);
    if (socket) {
      const room = this.people.room(member, socket[1]!);
      const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
      if (!room || !upgrade) return refuse();
      return this.signaling.open(member.id, visitor.deviceId, room.address, () => this.roomView(member, room));
    }
    if (pathname === "/api/me") {
      const devices = this.people.devices(member).map((device) => ({
        ...device,
        current: device.id === visitor.deviceId,
      }));
      return json({ ...me, devices } satisfies MeAnswer);
    }
    return refuse();
  }

  override webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    this.signaling.received(socket, data);
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string) {
    this.signaling.closed(socket, code, reason);
  }

  override webSocketError(socket: WebSocket) {
    this.signaling.closed(socket);
  }

  /** The whole room as `member`'s tab sees it: what a tab gets on connecting. */
  private roomView(member: Member, room: RoomSummary): RoomView {
    return {
      room,
      people: {
        you: { id: member.id, owner: member.owner },
        members: this.people.membersOf(room.address).map(({ id, name }) => ({ id, name })),
      },
      presence: { present: [...this.signaling.present(room.address)] },
      shares: {},
      usage: {},
    };
  }

  /** The owner page and the owner's actions. Only the owner's devices get this far. */
  private async ownerAnswer(request: Request, pathname: string): Promise<Response> {
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
    if (pathname === "/api/owner/rooms" && method === "POST") {
      const body = await request.json<{ name?: unknown }>().catch(() => null);
      const room = body && this.people.newRoom(body.name);
      return room ? json({ room } satisfies CreateRoomAnswer) : refuse();
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

function withCookie(response: Response, cookie: string): Response {
  response.headers.append("Set-Cookie", cookie);
  return response;
}

function roomPath(address: string): string {
  return `/r/${address}`;
}
