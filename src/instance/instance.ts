import { DurableObject } from "cloudflare:workers";
import type {
  CreateInviteAnswer,
  CreateRoomAnswer,
  DeviceInviteAnswer,
  GrantAnswer,
  InviteAnswer,
  InvitesAnswer,
  JoinAnswer,
  Me,
  MemberEntry,
  MeAnswer,
  OwnerRoomsAnswer,
  PeopleAnswer,
  RenameRoomAnswer,
  RoomAnswer,
  RoomsAnswer,
  RoomSummary,
  SetupAnswer,
  UsageAnswer,
} from "../shared/api.ts";
import { encodingPlan } from "../shared/encoding.ts";
import type { ClientMessage, LiveShare, RoomView } from "../shared/socket/index.ts";
import { isQualityChoice } from "../shared/socket/watching.ts";
import { LIST_SOCKET_PATH, type ListedRoom, type ListState } from "../shared/socket/list.ts";
import { done, json, nothingHere, page, redirect } from "./answers.ts";
import { mediaLayer } from "./media/index.ts";
import { applyMigrations, migrations, type Migration } from "./migrations.ts";
import { FORGET_DEVICE_COOKIE, People, type Member, type Visitor } from "./people.ts";
import { isSetupSecret, missingSecrets } from "./setup-secret.ts";
import { Shares, type Covered, type Ended } from "./shares.ts";
import { Signaling, type Cut, type Tab } from "./signaling.ts";
import { Usage } from "./usage.ts";

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
  private readonly usage: Usage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.people = new People(ctx.storage.sql);
    this.usage = new Usage(ctx.storage.sql);
    this.signaling = new Signaling(
      ctx,
      (address) => this.relist(address),
      () => this.schedule(),
      // A share's own mark: the tab sending it has fallen silent, or is heard again.
      (address, tab, silent, exceptTab) => {
        for (const share of this.shares.liveFrom(tab)) {
          const change = { type: silent ? ("reconnecting" as const) : ("reconnected" as const), share };
          this.signaling.toRoom(address, { type: "shares", change }, exceptTab);
        }
      },
    );
    this.shares = new Shares(
      ctx.storage.sql,
      ctx.storage.kv,
      mediaLayer(env),
      {
        unwatched: (tab, share) => this.signaling.toTab(tab, { type: "watching", change: { type: "unwatched", share } }),
      // Only the sharer learns who is watching.
        watchers: (address, share, members) =>
          this.signaling.toMemberIn(address, share.member, { type: "watching", change: { type: "watchers", share, members } }),
        // The usage count charges a watch at its share's maximum bitrate where no later total arrives.
        began: (watch, tab, maxBitrate) => this.usage.watching(watch, tab, maxBitrate),
        ended: (watch, tab) => this.usage.watchEnded(watch, this.signaling.holds(tab)),
        // A hand-over carried this tab's watching over to the new share: it answers the new pull.
        moved: (tab, share, { offer, video, audio, quality }) => {
          const change = { type: "moved" as const, share, offer, video, ...(audio === null ? {} : { audio }) };
          this.signaling.toTab(tab, { type: "media", change });
          if (quality !== null) this.signaling.toTab(tab, { type: "watching", change: { type: "quality", share, quality } });
        },
      },
      () => this.schedule(),
    );
    // Nothing reaches the instance until its storage is on this code's schema, and until
    // whoever a restart dropped is in their grace period.
    void ctx.blockConcurrencyWhile(async () => {
      applyMigrations(ctx.storage, Instance.migrations);
      try {
        this.restored();
      } catch (error) {
        // A failure here would leave the instance refusing every request. Better it
        // starts: the tabs simply come back as new ones. (An instance started on an older
        // schema than this code's, as the migration tests do, has no records to restore.)
        console.error("The instance could not restore the tabs a restart dropped", error);
      }
    });
  }

  /**
   * As the instance starts: the tabs a restart dropped become lost tabs, in their grace
   * period, so their shares and watching carry on while their browsers reconnect.
   */
  private restored() {
    // An instance that wakes from sleep still holds its sockets. One that holds none has
    // started afresh, after a restart or a long rest, and its records are swept.
    const woke = this.ctx.getWebSockets().length > 0;
    const recorded = this.shares.recordedTabs().flatMap((tab) => {
      const member = tab.member ?? this.people.deviceMember(tab.device)?.id;
      return member ? [{ ...tab, member }] : [];
    });
    const dropped = this.signaling.restore(recorded);
    if (!woke || dropped.length > 0) this.ctx.waitUntil(this.afterRestart());
  }

  /**
   * The sweep after a restart: every media connection on record is checked against the
   * media server, and anything the records do not account for is closed. Shares whose
   * tracks turn out to be gone end.
   */
  private async afterRestart() {
    const ended: Ended[] = await this.shares.sweep().catch(() => []);
    // A hand-over the restart cut short after its new share went live ends its old one.
    ended.push(...(await this.shares.finishHandOvers().catch(() => [])));
    this.sharesEnded(ended);
  }

  /**
   * Sets the instance's one alarm for the earliest moment anything waits for: a grace
   * period running out, a member falling silent, a failed close's next try, or the end
   * of a share whose media has faltered for 30 seconds.
   */
  private schedule() {
    const moments = [this.signaling.nextMoment(), this.shares.nextRetry(), this.shares.nextFaltered()].filter(
      (moment): moment is number => moment !== null,
    );
    if (moments.length > 0) void this.ctx.storage.setAlarm(Math.min(...moments));
    else void this.ctx.storage.deleteAlarm();
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
      return member.owner ? this.ownerAnswer(request, pathname, visitor) : refuse();
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
      return this.signaling.open(member.id, visitor.deviceId, room.address, (tab) => ({
        state: this.roomView(member, room, tab),
        media: { connected: this.shares.hasConnection(tab) },
      }));
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
    if (device && method === "DELETE") return (await this.forget(member, device[1]!, visitor)) ?? refuse();
    return refuse();
  }

  /**
   * Forgets `member`'s device `id`, asked by `visitor`: the member themselves or the
   * owner. Null, and nothing changed, when the member has no such device.
   */
  private async forget(member: Member, id: string, visitor: Visitor): Promise<Response | null> {
    // Storage first, so the forgotten browser is refused from this instant, then its tabs.
    // The answer does not wait for the media server.
    if (!this.people.forgetDevice(member, id)) return null;
    this.inBackground(this.cutOff({ device: id }, this.signaling.cutDevice(id), member));
    return id === visitor.deviceId ? withCookie(done(), FORGET_DEVICE_COOKIE) : done();
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

    if (message.type === "usage" && type === "received") {
      // Counted from whichever tab sends it: a report only ever adds to the count.
      const { bytes, relayed, final } = request as { bytes?: unknown; relayed?: unknown; final?: unknown };
      if (!isByteCount(bytes) || typeof relayed !== "boolean") return;
      this.usage.received(tab.id, bytes, relayed, final === true);
      return;
    }
    if (message.type === "media" && type === "answer") {
      const { answer } = request as { answer?: unknown };
      if (!isSdp(answer)) return;
      // An answer only completes the tab's own negotiation, so it needs no check. A failed
      // one leaves the pull with no media flowing; the watch stays, as on any media trouble.
      await this.shares.renegotiate(tab, answer);
      this.signaling.toTab(tab.id, { type: "media", change: { type: "answered" } });
      return;
    }
    if (message.type === "watching") {
      const share = asLiveShare((request as { share?: unknown }).share);
      if (!share) return;
      if (type === "watch") {
        const watched = allowed
          ? await this.shares.watch(tab, share, () => this.signaling.isOpen(tab.id))
          : { watching: false as const };
        if (watched === null) return;
        if (!watched.watching) {
          this.signaling.toTab(tab.id, { type: "media", change: { type: "pull-refused", share } });
          return;
        }
        this.signaling.toTab(tab.id, {
          type: "media",
          change: {
            type: "pulled",
            share,
            offer: watched.offer,
            video: watched.video,
            ...(watched.audio === null ? {} : { audio: watched.audio }),
          },
        });
        this.signaling.toTab(tab.id, { type: "watching", change: { type: "watched", share } });
      }
      // Stopping needs no check: it only ever takes something away.
      if (type === "unwatch") await this.shares.unwatch(tab, share);
      if (type === "quality") {
        const { quality } = request as { quality?: unknown };
        if (!isQualityChoice(quality)) return;
        // The tab hears the quality it now watches at: the one it chose, or the one it had.
        const now = allowed ? await this.shares.setQuality(tab, share, quality) : this.shares.quality(tab, share);
        if (now !== null) this.signaling.toTab(tab.id, { type: "watching", change: { type: "quality", share, quality: now } });
      }
      return;
    }
    // Media that falters needs no check: it can only end the tab's own shares.
    if (message.type === "media" && type === "faltering") {
      this.shares.faltering(tab.id);
      return;
    }
    if (message.type === "media" && type === "recovered") {
      this.shares.recovered(tab.id);
      return;
    }
    if (message.type === "media" && type === "connect") {
      if (!allowed) return;
      const iceServers = await this.shares.connect(tab);
      if (iceServers === "already") return;
      // The socket was lost while the connection was being made: the tab may ask again.
      if (iceServers && !this.signaling.isOpen(tab.id)) this.shares.unanswered(tab.id);
      this.signaling.toTab(
        tab.id,
        iceServers ? { type: "media", change: { type: "connected", iceServers } } : { type: "media", change: { type: "unavailable" } },
      );
      return;
    }
    if (message.type !== "shares") return;
    if (type === "start") {
      const { kind, offer, video, audio, browser, handOver } = request as {
        kind?: unknown;
        offer?: unknown;
        video?: unknown;
        audio?: unknown;
        browser?: unknown;
        handOver?: unknown;
      };
      if (kind !== "webcam" && kind !== "screen") return;
      // A screen share's audio is left out when the browser's picker gave no sound.
      const mids = !isMid(video) ? null : audio === undefined ? { video } : isMid(audio) ? { video, audio } : null;
      // A screen share goes out as its browser's family sends one; a webcam alike from every browser.
      const family = kind === "webcam" ? "chromium" : browser === "chromium" || browser === "firefox" ? browser : null;
      const started =
        allowed && isSdp(offer) && mids && family
          ? await this.shares.start(
              tab,
              tab.member,
              kind,
              offer,
              mids,
              encodingPlan(family, kind),
              () => this.signaling.isOpen(tab.id),
              { handOver: handOver === true },
            )
          : { live: false as const };
      if (!started.live) {
        this.signaling.toTab(tab.id, { type: "media", change: { type: "refused", kind } });
        return;
      }
      this.signaling.toTab(tab.id, { type: "media", change: { type: "published", kind, answer: started.answer } });
      this.shareChanged(tab.room, { type: "started", share: started.share });
      // A hand-over: the new share is live, so the old one ends and its viewers here move to this one.
      if (started.handOver) this.sharesEnded(await this.shares.handOver(started.id, (other) => this.signaling.isOpen(other)));
      return;
    }
    if (type === "stop") {
      const { kind } = request as { kind?: unknown };
      if (kind !== "webcam" && kind !== "screen") return;
      // Stopping needs no check: it only ever takes something away.
      const ended = await this.shares.stop(tab, kind);
      if (ended) this.sharesEnded([ended]);
    }
  }

  /**
   * Tells the rooms and the lists of rooms which shares ended. A share a hand-over
   * replaced is told to the tab that sent it as handed over; its room hears it ended only
   * when the new share is live in another room, since within one room it carries on
   * under the same name.
   */
  private sharesEnded(ended: readonly Ended[]) {
    for (const { room, share, tab, replacedIn } of ended) {
      if (replacedIn !== undefined) this.signaling.toTab(tab, { type: "media", change: { type: "handed-over", kind: share.kind } });
      if (replacedIn !== room) this.shareChanged(room, { type: "ended", share });
    }
  }

  /**
   * A tab left cleanly, or its grace period ran out. Its presence has already ended, so
   * nothing it asks is granted any more: whatever it was sending and watching is cut off.
   */
  private async left(tab: Tab) {
    await this.cutOff({ tab: tab.id });
  }

  /**
   * The cut-off: the one routine that ends what `covered` takes in, for every case (spec,
   * "Cut-off"; ADR 0003). The caller has done its first step, changing storage, so any
   * request from what is covered is refused from that instant; `cut` holds the tabs it
   * cut off. This force-closes the covered shares' tracks, then everyone else's pulls of
   * them, then the covered pulls; the room and the lists hear which shares ended; and
   * last, the cut-off tabs are told they are gone and closed. `subject` is the member
   * the owner hears about if a close is still failing after a minute: the one removed, or
   * whose device was forgotten.
   */
  private async cutOff(covered: Covered, cut?: Cut, subject?: Member) {
    try {
      const ended = await this.shares.cutOff(
        covered,
        cut?.tabs.map((tab) => tab.id),
        subject && { member: subject.id, name: subject.name, at: Date.now() },
      );
      this.sharesEnded(ended);
    } finally {
      // The tabs cut off report no more: what they watched since their last report is charged.
      if ("tab" in covered) this.usage.tabGone(covered.tab);
      for (const tab of cut?.tabs ?? []) this.usage.tabGone(tab.id);
      cut?.tell();
    }
  }

  /**
   * Lets `work` carry on after the answer has gone, as a cut-off's closes do once the
   * owner has their answer. A failure there is already kept as a record to try again.
   */
  private inBackground(work: Promise<void>) {
    this.ctx.waitUntil(work.catch(() => {}));
  }

  /** Tells the room and the lists of rooms that a share started or ended. */
  private shareChanged(address: string, change: { type: "started" | "ended"; share: LiveShare }) {
    this.signaling.toRoom(address, { type: "shares", change });
    this.relist(address);
  }

  /**
   * The alarm: grace periods running out, members falling silent, failed closes tried
   * again, and shares whose media has faltered for too long.
   */
  override async alarm() {
    for (const tab of this.signaling.alarm()) await this.left(tab);
    const ended = await this.shares.retry((tab) => this.signaling.holds(tab));
    const faltered = await this.shares.faltered();
    ended.push(...faltered.ended);
    this.sharesEnded(ended);
    for (const tab of faltered.dropped) this.signaling.toTab(tab, { type: "media", change: { type: "dropped" } });
    this.schedule();
  }

  /** The whole room as `member`'s tab sees it: what a tab gets on connecting. */
  private roomView(member: Member, room: RoomSummary, tab: string): RoomView {
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
      shares: { live: this.shares.live(room.address, this.signaling.silentTabs(room.address)) },
      // A new tab opens with nothing on its stage; one that reconnects in time finds its stage as it was.
      watching: {
        stage: this.shares.stage(tab),
        watchers: this.shares.watchers(room.address, member.id),
        qualities: this.shares.qualities(tab),
      },
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
  private async ownerAnswer(request: Request, pathname: string, visitor: Visitor): Promise<Response> {
    const owner = visitor.member;
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
    if (pathname === "/api/owner/usage") {
      return method === "GET" ? json(this.usage.answer() satisfies UsageAnswer) : refuse();
    }
    if (pathname === "/api/owner/usage/reset-day" && method === "PUT") {
      const body = await request.json<{ day?: unknown }>().catch(() => null);
      return body && this.usage.setResetDay(body.day) ? json(this.usage.answer() satisfies UsageAnswer) : refuse();
    }
    if (pathname === "/api/owner/people" || pathname.startsWith("/api/owner/people/")) {
      return this.peopleAnswer(request, pathname, visitor);
    }
    return refuse();
  }

  /** The owner page's People section: every member, and what the owner can do to each. */
  private async peopleAnswer(request: Request, pathname: string, visitor: Visitor): Promise<Response> {
    const { method } = request;
    const refuse = () => nothingHere(this.env.ASSETS, request);

    if (pathname === "/api/owner/people") {
      if (method !== "GET") return refuse();
      const entries = this.people.everyone().map((member) => this.memberEntry(member, visitor.deviceId));
      return json({
        rooms: this.people.allRooms(),
        people: entries,
        unconfirmed: this.shares.unconfirmed(),
      } satisfies PeopleAnswer);
    }
    const access = /^\/api\/owner\/people\/([^/]+)\/rooms\/([^/]+)$/.exec(pathname);
    if (access) {
      const member = this.people.member(access[1]!);
      const address = access[2]!;
      if (!member) return refuse();
      if (method === "PUT") {
        const granted = this.people.grant(member, address);
        if (granted === null) return refuse();
        if (granted) this.accessGranted(member, address);
        return json({ person: this.memberEntry(member, visitor.deviceId) } satisfies GrantAnswer);
      }
      if (method === "DELETE") {
        // Storage first: from this instant every request of theirs for the room is refused.
        const revoked = this.people.revoke(member, address);
        if (revoked === null) return refuse();
        if (revoked) this.accessRemoved(member, address);
        return json({ person: this.memberEntry(member, visitor.deviceId) } satisfies GrantAnswer);
      }
      return refuse();
    }
    const device = /^\/api\/owner\/people\/([^/]+)\/devices\/([^/]+)$/.exec(pathname);
    if (device && method === "DELETE") {
      const member = this.people.member(device[1]!);
      return (member && (await this.forget(member, device[2]!, visitor))) ?? refuse();
    }
    const letBackIn = /^\/api\/owner\/people\/([^/]+)\/invite$/.exec(pathname);
    if (letBackIn && method === "POST") {
      const member = this.people.member(letBackIn[1]!);
      const invite = member && this.people.createLetBackIn(member);
      return invite ? json({ invite } satisfies CreateInviteAnswer) : refuse();
    }
    const person = /^\/api\/owner\/people\/([^/]+)$/.exec(pathname);
    if (person && method === "DELETE") {
      const member = this.people.member(person[1]!);
      // Storage first: from this instant every device of theirs is a stranger.
      const rooms = member && this.people.remove(member);
      if (!member || !rooms) return refuse();
      const cut = this.signaling.cutMember(member.id);
      for (const address of rooms) {
        this.signaling.toRoom(address, { type: "people", change: { type: "removed", member: member.id } });
      }
      // The owner's page shows the removal as done at once; the closes carry on.
      this.inBackground(this.cutOff({ member: member.id }, cut, member));
      return done();
    }
    return refuse();
  }

  /**
   * `member` has just lost access to the room at `address`, in storage. Their tabs there
   * are cut off, on every device, and the room hears they left and no longer belong to
   * it. Then what they were sending and watching there is cut off, and last their tabs
   * there are told they are gone and closed. The owner's answer does not wait for that.
   */
  private accessRemoved(member: Member, address: string) {
    const cut = this.signaling.cutMember(member.id, address);
    this.signaling.toRoom(address, { type: "people", change: { type: "removed", member: member.id } });
    this.signaling.toMember(member.id, {
      type: "people",
      change: { type: "access", rooms: this.people.rooms(member).length },
    });
    this.signaling.toLists(new Set([member.id]), { type: "rooms", change: { type: "unlisted", address } });
    this.inBackground(this.cutOff({ member: member.id, room: address }, cut, member));
  }

  /** `member` has just been given access to the room at `address`: every tab that shows it hears so. */
  private accessGranted(member: Member, address: string) {
    this.signaling.toRoom(address, { type: "people", change: { type: "added", person: { id: member.id, name: member.name } } });
    this.signaling.toMember(member.id, {
      type: "people",
      change: { type: "access", rooms: this.people.rooms(member).length },
    });
    // Their own lists of rooms gain the line, as the others' change nothing.
    this.relist(address);
  }

  /** One member as the People section shows them to the owner on the device `asking`. */
  private memberEntry(member: Member, asking: string): MemberEntry {
    const rooms = this.people.rooms(member).map((room) => room.address);
    const devices = this.people.devices(member).map((device) => ({ ...device, current: device.id === asking }));
    return {
      id: member.id,
      name: member.name,
      owner: member.owner,
      rooms,
      present: rooms.filter((address) => this.signaling.present(address).has(member.id)),
      sharing: this.shares.sharedBy(member.id),
      devices,
      lastVisit: devices.length > 0 ? Math.max(...devices.map((device) => device.lastUsed)) : null,
      letBackIn: this.people.letBackIn(member),
    };
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
    // "Let back in" forgot the member's other devices: their tabs close as on forgetting one.
    for (const device of joined.forgotten) await this.cutOff({ device }, this.signaling.cutDevice(device), joined.member);
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

/** A running total of bytes as a tab reports it: a whole number, not negative, and within what a number holds exactly. */
function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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

/** A share as a tab names it, by its sharer's member id and its kind. */
function asLiveShare(value: unknown): LiveShare | null {
  if (typeof value !== "object" || value === null) return null;
  const { member, kind } = value as { member?: unknown; kind?: unknown };
  if (typeof member !== "string" || member.length === 0 || member.length > 64) return null;
  if (kind !== "webcam" && kind !== "screen") return null;
  return { member, kind };
}
