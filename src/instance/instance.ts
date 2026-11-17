import { DurableObject } from "cloudflare:workers";
import type { Me, MeAnswer, RoomAnswer, RoomsAnswer, SetupAnswer } from "../shared/api.ts";
import { json, nothingHere, page, redirect } from "./answers.ts";
import { applyMigrations, migrations, type Migration } from "./migrations.ts";
import { People, type Visitor } from "./people.ts";
import { isSetupSecret, missingSecrets } from "./setup-secret.ts";

/** The name of the instance's one Durable Object. Every request reaches the same one. */
export const INSTANCE_NAME = "instance";

/** The instance: one Durable Object holding all of its state (ADR 0002). */
export class Instance extends DurableObject<Env> {
  /** The migrations this code ships with. The test harness swaps them to start on an older schema. */
  static migrations: readonly Migration[] = migrations;

  private readonly people: People;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.people = new People(ctx.storage.sql);
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
    const refuse = () => nothingHere(this.env.ASSETS, request);

    if (request.method === "POST" && pathname === "/api/setup") return this.setup(request, visitor);
    if (request.method !== "GET" || !visitor) return refuse();
    const { member } = visitor;

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
    if (pathname === "/api/me") {
      const devices = this.people.devices(member).map((device) => ({
        ...device,
        current: device.id === visitor.deviceId,
      }));
      return json({ ...me, devices } satisfies MeAnswer);
    }
    return refuse();
  }

  /** `POST /api/setup` with `{ secret }`: the setup page sends the secret here itself. */
  private async setup(request: Request, visitor: Visitor | null): Promise<Response> {
    const body = await request.json<{ secret?: unknown }>().catch(() => null);
    if (!(await isSetupSecret(this.env, body?.secret))) return nothingHere(this.env.ASSETS, request);

    const { owner, cookie } = await this.people.becomeOwner(request, visitor);
    const rooms = this.people.rooms(owner);
    const response = json({
      to: rooms.length === 1 ? roomPath(rooms[0]!.address) : "/",
      missing: missingSecrets(this.env),
    } satisfies SetupAnswer);
    response.headers.append("Set-Cookie", cookie);
    return response;
  }
}

function roomPath(address: string): string {
  return `/r/${address}`;
}