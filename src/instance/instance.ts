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
import type { BudgetLevel, ClientMessage, LiveShare, RoomView, UsageState } from "../shared/socket/index.ts";
import { checkRequest, requestNameOf, type Checked, type CheckedRequest, type RequestName } from "../shared/socket/requests.ts";
import { LIST_SOCKET_PATH, type ListedRoom, type ListState } from "../shared/socket/list.ts";
import { LOG_PATH } from "../shared/socket/log.ts";
import { routeOf } from "../shared/log.ts";
import { done, json, nothingHere, page, redirect } from "./answers.ts";
import { log } from "./log.ts";
import { mediaLayer } from "./media/index.ts";
import { applyMigrations, migrations, type Migration } from "./migrations.ts";
import { FORGET_DEVICE_COOKIE, People, type Forgotten, type Member, type Visitor } from "./people.ts";
import { Relay, RELAY_LIVES, type RelayLives } from "./relay.ts";
import { isSetupSecret, missingSecrets } from "./setup-secret.ts";
import { Shares, type Covered, type Ended } from "./shares.ts";
import { Signaling, tagsOf, type Cut, type Tab } from "./signaling.ts";
import { Usage } from "./usage.ts";

/** The name of the instance's one Durable Object. Every request reaches the same one. */
export const INSTANCE_NAME = "instance";

/** The owner page's sections, each at `/owner/<section>`. `/owner` itself opens the first. */
const OWNER_SECTIONS = ["people", "invites", "rooms", "usage"];

/** Where the instance keeps the level of the usage budget it last told the room of. */
const BUDGET_TOLD_KEY = "usage:told";

/** Why each refused answer was refused, for its line in the logs. The visitor never learns it. */
const refusals = new WeakMap<Response, string>();

/** The instance: one Durable Object holding all of its state (ADR 0002). */
export class Instance extends DurableObject<Env> {
  /** The migrations this code ships with. The test harness swaps them to start on an older schema. */
  static migrations: readonly Migration[] = migrations;
  /** A relay credential's life and when it is renewed. The test harness shortens them, as the owner may on a test deploy. */
  static relayLives: RelayLives = RELAY_LIVES;

  private readonly people: People;
  private readonly signaling: Signaling;
  private readonly shares: Shares;
  private readonly usage: Usage;
  private readonly relay: Relay;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    log.knowSecrets(env);
    this.people = new People(ctx.storage.sql);
    this.usage = new Usage(ctx.storage.sql);
    const media = mediaLayer(env);
    // Made first, since the signaling may set the alarm as it starts; it reads the tabs only when asked.
    this.relay = new Relay(ctx.storage.kv, media, {
      connected: (tab) => this.shares.hasConnection(tab),
      reachable: (tab) => this.signaling.isOpen(tab),
    }, Instance.relayLives);
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
      media,
      {
        unwatched: (tab, share) => this.signaling.toTab(tab, { type: "watching", change: { type: "unwatched", share } }),
      // Only the sharer learns who is watching.
        watchers: (address, share, members) =>
          this.signaling.toMemberIn(address, share.member, { type: "watching", change: { type: "watchers", share, members } }),
        // The usage count charges a watch at its share's maximum bitrate where no later total arrives.
        began: (watch, tab, maxBitrate) => this.usage.watching(watch, tab, maxBitrate),
        ended: (watch, tab) => {
          this.usage.watchEnded(watch, this.signaling.holds(tab));
          this.checkBudget();
        },
        // A share no longer counts from the moment its end begins, so its room hears then, not once its close returns.
        ending: (ended) => this.sharesEnded(ended),
        // A hand-over carried this tab's watching over to the new share: it answers the new pull.
        moved: (tab, share, { offer, video, audio, quality }) => {
          const change = { type: "moved" as const, share, offer, video, ...withAudio(audio) };
          this.signaling.toTab(tab, { type: "media", change });
          if (quality !== null) this.signaling.toTab(tab, { type: "watching", change: { type: "quality", share, quality } });
        },
      },
      () => this.schedule(),
    );
    // Nothing reaches the instance until its storage is on this code's schema, and until
    // whoever a restart dropped is in their grace period.
    void ctx.blockConcurrencyWhile(async () => {
      const applied = applyMigrations(ctx.storage, Instance.migrations);
      log.info("instance.start", { build: __GRAEAE_BUILD__, migrations: applied });
      try {
        this.restored();
      } catch (error) {
        // A failure here would leave the instance refusing every request. Better it
        // starts: the tabs simply come back as new ones. (An instance started on an older
        // schema than this code's, as the migration tests do, has no records to restore.)
        log.error("error", error, { during: "restoring the tabs a restart dropped" });
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
    log.info("restart.restored", { woke, recorded: recorded.length, lost: dropped.map((tab) => tab.id) });
    if (!woke || dropped.length > 0) this.ctx.waitUntil(this.afterRestart());
    // A stop a restart broke off runs again; a month that reset while asleep is told.
    this.checkBudget();
  }

  /**
   * The sweep after a restart: every media connection on record is checked against the
   * media server, and anything the records do not account for is closed. Shares whose
   * tracks turn out to be gone end, and their rooms hear so as they do.
   */
  private async afterRestart() {
    const failed = (during: string) => (error: unknown) => {
      log.error("error", error, { during });
      return [];
    };
    const ended: Ended[] = await this.shares.sweep().catch(failed("the sweep after a restart"));
    // A hand-over the restart cut short after its new share went live ends its old one, and
    // a share whose end had begun is closed again.
    ended.push(...(await this.shares.finishEnds().catch(failed("finishing ends after a restart"))));
    log.info("restart.swept", { ended: ended.map(({ share }) => share) });
  }

  /**
   * Sets the instance's one alarm for the earliest moment anything waits for: a grace
   * period running out, a member falling silent, a failed close's next try, or the end
   * of a share whose media has faltered for 30 seconds, the month resetting while the
   * room has been warned about the usage budget, or a tab due a fresh relay credential.
   */
  private schedule() {
    const reset = this.told() === null ? null : this.usage.resetsAt();
    const moments = [
      this.signaling.nextMoment(),
      this.shares.nextRetry(),
      this.shares.nextFaltered(),
      reset,
      this.relay.next(),
    ].filter(
      (moment): moment is number => moment !== null,
    );
    const next = moments.length > 0 ? Math.min(...moments) : null;
    // Setting or deleting the alarm writes a row, of which the free plan allows 100,000 a day (ADR 0004).
    if (next === this.alarmAt) return;
    this.alarmAt = next;
    if (next !== null) void this.ctx.storage.setAlarm(next);
    else void this.ctx.storage.deleteAlarm();
  }

  /** What this instance last set the alarm for, null for none; undefined before it has, or once it has run. */
  private alarmAt: number | null | undefined;

  override async fetch(request: Request): Promise<Response> {
    const started = Date.now();
    const { method } = request;
    const { route, room, member: subject, device: subjectDevice } = routeOf(new URL(request.url).pathname);
    let visitor: Visitor | null = null;
    try {
      visitor = await this.people.recognise(request);
      // Every visit from a remembered device renews it, whatever the address.
      if (visitor) this.people.visited(visitor);
      const response = await this.answer(request, visitor);
      const refused = refusals.get(response);
      (refused ? log.warn : log.info)("http", {
        method,
        route,
        status: response.status,
        ms: Date.now() - started,
        ...(visitor ? { member: visitor.member.id, device: visitor.deviceId } : {}),
        ...(room ? { room } : {}),
        ...(subject ? { subject } : {}),
        ...(subjectDevice ? { subjectDevice } : {}),
        ...(refused ? { refused } : {}),
      });
      return visitor ? this.people.renewCookie(request, response) : response;
    } catch (error) {
      log.error("error", error, {
        during: "http",
        method,
        route,
        ms: Date.now() - started,
        ...(visitor ? { member: visitor.member.id, device: visitor.deviceId } : {}),
      });
      throw error;
    }
  }

  /** The one "nothing here" answer, with why it was given kept for the logs alone. */
  private async refuse(request: Request, why: string): Promise<Response> {
    const response = await nothingHere(this.env.ASSETS, request);
    refusals.set(response, why);
    return response;
  }

  /**
   * `POST /api/log` from a remembered device: a page with no socket sends its record of
   * what it did, written tagged as the device's. Answered with nothing.
   */
  private async postedLog(request: Request, visitor: Visitor): Promise<Response> {
    const text = await request.text().catch(() => null);
    let batch: unknown = null;
    try {
      batch = text === null ? null : JSON.parse(text);
    } catch {
      // Not JSON: refused below.
    }
    const written = log.tabBatch({ member: visitor.member.id, device: visitor.deviceId }, batch, text?.length);
    return written ? done() : this.refuse(request, "not a batch of events");
  }

  private async answer(request: Request, visitor: Visitor | null): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);
    const { method } = request;
    const refuse = (why: string) => this.refuse(request, why);

    if (method === "POST" && pathname === "/api/setup") return this.setup(request, visitor);

    // An invite is for a browser the instance may not know yet. Opening it, or merely
    // fetching its address as a link preview does, uses nothing up: only the press does.
    const invitePage = /^\/invite\/([^/]+)$/.exec(pathname);
    if (invitePage) {
      const pending = method === "GET" && this.people.openInvite(invitePage[1]!);
      return pending ? page(this.env.ASSETS, request) : refuse("no such invite");
    }
    const inviteData = /^\/api\/invites\/([^/]+)$/.exec(pathname);
    if (inviteData) {
      const code = inviteData[1]!;
      if (method === "POST") return this.join(request, visitor, code);
      const pending = method === "GET" && this.people.openInvite(code);
      return pending ? json({ name: pending.name } satisfies InviteAnswer) : refuse("no such invite");
    }

    if (!visitor) return refuse("not a remembered device");
    const { member } = visitor;
    if (pathname === LOG_PATH) return method === "POST" ? this.postedLog(request, visitor) : refuse("not a post");
    if (pathname === "/owner" || pathname.startsWith("/owner/") || pathname.startsWith("/api/owner/")) {
      return member.owner ? this.ownerAnswer(request, pathname, visitor) : refuse("not the owner");
    }
    if (pathname === "/api/me" || pathname.startsWith("/api/me/")) return this.youAnswer(request, pathname, visitor);
    if (method !== "GET") return refuse("not a get");
    if (pathname === "/you") return page(this.env.ASSETS, request);

    if (pathname === "/") {
      const rooms = this.people.rooms(member);
      return rooms.length === 1 ? redirect(roomPath(rooms[0]!.address)) : page(this.env.ASSETS, request);
    }
    const roomPage = /^\/r\/([^/]+)$/.exec(pathname);
    if (roomPage) {
      return this.people.room(member, roomPage[1]!) ? page(this.env.ASSETS, request) : refuse("no access to the room");
    }
    const me: Me = { name: member.name, owner: member.owner };
    if (pathname === "/api/rooms") {
      return json({ rooms: this.people.rooms(member), me } satisfies RoomsAnswer);
    }
    const roomData = /^\/api\/rooms\/([^/]+)$/.exec(pathname);
    if (roomData) {
      const room = this.people.room(member, roomData[1]!);
      return room ? json({ room, me } satisfies RoomAnswer) : refuse("no access to the room");
    }
    const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    if (pathname === LIST_SOCKET_PATH) {
      return upgrade ? this.signaling.openList(member.id, visitor.deviceId, this.list(member), member.name) : refuse("not a socket");
    }
    const socket = /^\/api\/socket\/([^/]+)$/.exec(pathname);
    if (socket) {
      const room = this.people.room(member, socket[1]!);
      if (!room || !upgrade) return refuse(room ? "not a socket" : "no access to the room");
      return this.signaling.open(
        member.id,
        visitor.deviceId,
        room.address,
        (tab) => ({
          state: this.roomView(member, room, tab),
          media: { connected: this.shares.hasConnection(tab), sending: this.shares.liveFrom(tab).map((share) => share.kind) },
        }),
        searchParams.get("tab") ?? undefined,
        member.name,
      );
    }
    return refuse("no such address");
  }

  /** The "You" page's data and actions, the same for every member and the owner. */
  private async youAnswer(request: Request, pathname: string, visitor: Visitor): Promise<Response> {
    const { method } = request;
    const { member } = visitor;
    const refuse = (why: string) => this.refuse(request, why);

    if (pathname === "/api/me" && method === "GET") {
      const devices = this.people.devices(member).map((device) => ({
        ...device,
        current: device.id === visitor.deviceId,
      }));
      return json({ name: member.name, owner: member.owner, devices, home: this.landing(member) } satisfies MeAnswer);
    }
    if (pathname === "/api/me/name" && method === "POST") {
      const body = await request.json<{ name?: unknown }>().catch(() => null);
      const renamed = body && this.people.rename(member, body.name);
      if (!renamed) return refuse("not a display name");
      log.info("member.renamed", { member: member.id, device: visitor.deviceId, name: renamed.name });
      this.signaling.toLists(new Set([renamed.id]), { type: "you", you: { name: renamed.name, owner: renamed.owner } });
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
      log.info("invite.made", { member: member.id, device: visitor.deviceId, kind: "device" });
      return json({ invite: this.people.createDeviceInvite(member) } satisfies DeviceInviteAnswer);
    }
    const device = /^\/api\/me\/devices\/([^/]+)$/.exec(pathname);
    if (device && method === "DELETE") return (await this.forget(member, device[1]!, visitor)) ?? refuse("no such device");
    return refuse("no such address");
  }

  /**
   * Forgets `member`'s device `id`, asked by `visitor`: the member themselves or the
   * owner. Null, and nothing changed, when the member has no such device.
   */
  private async forget(member: Member, id: string, visitor: Visitor): Promise<Response | null> {
    // Storage first, so the forgotten browser is refused from this instant, then its tabs.
    // The answer does not wait for the media server.
    if (!this.people.forgetDevice(member, id)) return null;
    this.devicesForgotten([{ device: id, member }]);
    return id === visitor.deviceId ? withCookie(done(), FORGET_DEVICE_COOKIE) : done();
  }

  /**
   * Devices just forgotten in storage: their tabs are cut off at once, and what they were
   * sending and watching through the cut-off routine, which the answer does not wait for.
   */
  private devicesForgotten(forgotten: readonly Forgotten[]) {
    for (const { device, member } of forgotten) log.info("device.forgotten", { device, member: member.id });
    const cuts = forgotten.map(({ device, member }) => ({ device, member, cut: this.signaling.cutDevice(device) }));
    for (const { device, member, cut } of cuts) this.inBackground(this.cutOff({ device }, cut, member));
  }

  override async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    try {
      const received = this.signaling.received(socket, data);
      if (received) await this.request(received.tab, received.message);
    } catch (error) {
      log.error("error", error, { during: "a socket message", ...tabFields(socket) });
      throw error;
    }
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string) {
    try {
      const tab = this.signaling.closed(socket, code, reason);
      if (tab) await this.left(tab);
    } catch (error) {
      log.error("error", error, { during: "a socket closing", ...tabFields(socket) });
      throw error;
    }
  }

  override async webSocketError(socket: WebSocket, error: unknown) {
    log.warn("ws.error", { ...tabFields(socket), error });
    try {
      const tab = this.signaling.closed(socket);
      if (tab) await this.left(tab);
    } catch (failure) {
      log.error("error", failure, { during: "a socket failing", ...tabFields(socket) });
      throw failure;
    }
  }

  /**
   * A request from a tab showing a room. The tab is present there, since its socket is
   * open on the room; its device and its access are checked again here, as they may
   * have gone since the socket opened. A request the instance does not understand, or
   * from a tab that fails a check, gets the refusal its area has, or nothing. One it does
   * not understand is written to the logs, since the tab may be waiting on it (ticket 56).
   */
  private async request(tab: Tab, message: ClientMessage) {
    const request = checkRequest(message);
    if (!request) {
      log.warn("request.not-understood", { ...tagsOf(tab), request: requestNameOf(message) });
      return;
    }
    const member = this.people.deviceMember(tab.device);
    const allowed = member !== null && member.id === tab.member && this.people.room(member, tab.room) !== null;
    const handle = this.handlers[request.name] as (tab: Tab, request: CheckedRequest, allowed: boolean) => Promise<void> | void;
    await handle(tab, request, allowed);
  }

  /**
   * What the instance does with each request a tab sends, once checked. `allowed` says
   * whether the tab's device and access still hold; a request that only ever takes
   * something away, or only completes the tab's own negotiation, needs no check.
   */
  private readonly handlers: {
    [Name in RequestName]: (tab: Tab, request: Checked<Name>, allowed: boolean) => Promise<void> | void;
  } = {
    "usage.received": (tab, { bytes, relayed }, allowed) => {
      // Checked like any request that adds something: here, to the count. A tab's `final`
      // total needs nothing of its own, since only a new or restarted media connection,
      // which the instance makes itself, counts from zero again.
      if (!allowed) return;
      this.usage.received(tab.id, bytes, relayed);
      this.checkBudget();
    },
    "media.answer": async (tab, { answer }) => {
      // An answer only completes the tab's own negotiation, so it needs no check. A failed
      // one leaves the pull with no media flowing; the watch stays, as on any media trouble.
      const answered = await this.shares.renegotiate(tab, answer);
      (answered ? log.info : log.warn)("media.answered", { ...tagsOf(tab), ok: answered });
      this.signaling.toTab(tab.id, { type: "media", change: { type: "answered" } });
    },
    // A restart needs no check: like an answer, it only renews the tab's own path to the media server.
    "media.restart": async (tab, { offer, mid }) => {
      const answer = await this.shares.restart(tab, offer, mid);
      (answer !== null ? log.info : log.warn)("media.restarted", { ...tagsOf(tab), ok: answer !== null, mid });
      if (answer !== null) this.usage.newTotal(tab.id);
      this.signaling.toTab(
        tab.id,
        answer === null ? { type: "media", change: { type: "restart-refused" } } : { type: "media", change: { type: "restarted", answer } },
      );
    },
    // Nor does a reconnect: it only ever takes away.
    "media.reconnect": (tab) => this.reconnectMedia(tab),
    // Media that falters needs no check: it can only end the tab's own shares.
    "media.faltering": (tab) => this.shares.faltering(tab.id),
    "media.recovered": (tab) => this.shares.recovered(tab.id),
    "media.connect": async (tab, _, allowed) => {
      if (!allowed) {
        log.warn("media.unavailable", { ...tagsOf(tab), why: "not allowed" });
        return;
      }
      const iceServers = await this.shares.connect(tab, () => this.relay.mint());
      if (iceServers === "already") {
        log.info("media.connected", { ...tagsOf(tab), already: true });
        return;
      }
      if (iceServers) {
        log.info("media.connected", tagsOf(tab));
        this.usage.newTotal(tab.id);
        this.relay.minted(tab.id);
        this.schedule();
      } else log.warn("media.unavailable", { ...tagsOf(tab), why: "the media server or the relay failed" });
      // The socket was lost while the connection was being made: the tab may ask again.
      if (iceServers && !this.signaling.isOpen(tab.id)) this.shares.unanswered(tab.id);
      this.signaling.toTab(
        tab.id,
        iceServers ? { type: "media", change: { type: "connected", iceServers } } : { type: "media", change: { type: "unavailable" } },
      );
    },
    "watching.watch": async (tab, { share }, allowed) => {
      // Refused while the usage budget is used up, including a pull that was under way when it ran out.
      const budgetAllows = () => this.usage.level() !== "used up";
      if (!allowed || !budgetAllows()) {
        log.warn("watch.refused", { ...tagsOf(tab), share, why: allowed ? "the usage budget is used up" : "not allowed" });
      }
      const watched =
        allowed && budgetAllows()
          ? await this.shares.watch(tab, share, () => this.signaling.isOpen(tab.id) && budgetAllows())
          : { watching: false as const };
      if (watched === null) return;
      if (!watched.watching) {
        this.signaling.toTab(tab.id, { type: "media", change: { type: "pull-refused", share } });
        this.letGoOfMedia(tab, "a watch did not go live");
        return;
      }
      this.signaling.toTab(tab.id, {
        type: "media",
        change: { type: "pulled", share, offer: watched.offer, video: watched.video, ...withAudio(watched.audio) },
      });
      this.signaling.toTab(tab.id, { type: "watching", change: { type: "watched", share } });
    },
    // Stopping needs no check: it only ever takes something away.
    "watching.unwatch": (tab, { share }) => this.shares.unwatch(tab, share),
    "watching.quality": async (tab, { share, quality }, allowed) => {
      // The tab hears the quality it now watches at: the one it chose, or the one it had.
      const now = allowed ? await this.shares.setQuality(tab, share, quality) : this.shares.quality(tab, share);
      log.info("quality.set", { ...tagsOf(tab), share, asked: quality, now, allowed });
      if (now !== null) this.signaling.toTab(tab.id, { type: "watching", change: { type: "quality", share, quality: now } });
    },
    "shares.start": async (tab, { kind, details }, allowed) => {
      // A screen share goes out as its browser's family sends one; a webcam alike from every browser.
      const family = kind === "webcam" ? "chromium" : (details?.browser ?? null);
      const started =
        allowed && details && family
          ? await this.shares.start(
              tab,
              tab.member,
              kind,
              details.offer,
              details.mids,
              encodingPlan(family, kind, { twoQualities: details.twoQualities }),
              () => this.signaling.isOpen(tab.id),
              { handOver: details.handOver },
            )
          : { live: false as const };
      if (!allowed || !details || !family) {
        log.warn("share.refused", { ...tagsOf(tab), kind, why: !allowed ? "not allowed" : !details ? "malformed" : "no browser family" });
      }
      if (!started.live) {
        this.signaling.toTab(tab.id, { type: "media", change: { type: "refused", kind } });
        this.letGoOfMedia(tab, "a share did not go live");
        return;
      }
      this.signaling.toTab(tab.id, { type: "media", change: { type: "published", kind, answer: started.answer } });
      this.shareChanged(tab.room, { type: "started", share: started.share });
      // A hand-over: the new share is live, so the old one ends and its watchers here move to this one,
      // unless the usage budget is used up: a move is a new watch, and is refused like one.
      if (started.handOver) {
        const movable = (other: string) => this.signaling.isOpen(other) && this.usage.level() !== "used up";
        this.sharesEnded(await this.shares.handOver(started.id, movable));
      }
    },
    // Stopping needs no check: it only ever takes something away.
    "shares.stop": (tab, { kind }) => this.shares.stop(tab, kind),
  };

  /**
   * A share or watch of `tab`'s did not go live, and the tab has heard it refused. A media
   * connection left carrying nothing is let go of, and the tab hears `dropped`, so its
   * next share or watch makes a new one: the media server soon drops a connection no
   * browser ever joined, and refuses every offer into it after.
   */
  private letGoOfMedia(tab: Tab, why: string) {
    if (!this.shares.letGo(tab.id)) return;
    log.info("media.dropped", { ...tagsOf(tab), why });
    this.signaling.toTab(tab.id, { type: "media", change: { type: "dropped" } });
  }

  /**
   * Tells the rooms and the lists of rooms which shares ended: as each one's end begins,
   * or, for a hand-over, once the old share's close has returned. A share a hand-over
   * replaced is told to the tab that sent it as handed over; its room hears it ended only
   * when the new share is live in another room, since within one room it carries on
   * under the same name.
   */
  private sharesEnded(ended: readonly Ended[]) {
    for (const { room, share, tabId, replacedIn } of ended) {
      if (replacedIn !== undefined) this.signaling.toTab(tabId, { type: "media", change: { type: "handed-over", kind: share.kind } });
      if (replacedIn !== room) this.shareChanged(room, { type: "ended", share });
    }
  }

  /**
   * A tab left cleanly, or its grace period ran out. Its presence has already ended, so
   * nothing it asks is granted any more: whatever it was sending and watching is cut off.
   */
  private async left(tab: Tab) {
    await this.cutOff({ tabId: tab.id });
  }

  /**
   * The ordinary reconnect path for a tab still present, after its media connection's
   * restart failed: everything its media connection carries is cut off and the connection
   * let go of, then the tab hears `dropped` and makes a new one. Unlike a leave, the tab
   * still reports what it receives, so its usage is left to its own totals.
   */
  private async reconnectMedia(tab: Tab) {
    log.info("media.reconnect", tagsOf(tab));
    try {
      await this.shares.cutOff({ tabId: tab.id });
    } finally {
      this.checkBudget();
      // A close that failed keeps the connection on record, and is tried again. Until the
      // tab leaves, its next `connect` then gets no answer, as for any tab that has one.
      log.info("media.dropped", { ...tagsOf(tab), why: "asked" });
      this.signaling.toTab(tab.id, { type: "media", change: { type: "dropped" } });
    }
  }

  /**
   * The cut-off: the one routine that ends what `covered` takes in, for every case (spec,
   * "Cut-off"; ADR 0003). The caller has done its first step, changing storage, so any
   * request from what is covered is refused from that instant; `cut` holds the tabs it
   * cut off. The room and the lists hear which shares ended as their closes begin. This
   * force-closes the covered shares' tracks, then everyone else's pulls of them, then the
   * covered pulls; and last, the cut-off tabs are told they are gone and closed. `subject`
   * is the member the owner hears about if a close is still failing after a minute: the
   * one removed, or whose device was forgotten.
   */
  private async cutOff(covered: Covered, cut?: Cut, subject?: Member) {
    log.info("cutoff.start", { covered, tabs: cut?.tabs.map((tab) => tab.id) ?? [], ...(subject ? { subject: subject.id } : {}) });
    try {
      const ended = await this.shares.cutOff(
        covered,
        cut?.tabs.map((tab) => tab.id),
        subject && { member: subject.id, name: subject.name, at: Date.now() },
      );
      log.info("cutoff.done", { covered, ended: ended.map(({ share }) => share) });
    } finally {
      // The tabs cut off report no more: what they watched since their last report is charged.
      if ("tabId" in covered) this.usage.tabGone(covered.tabId);
      for (const tab of cut?.tabs ?? []) this.usage.tabGone(tab.id);
      this.checkBudget();
      cut?.tell();
    }
  }

  /** The usage budget stop under way, if any. */
  private stopping: Promise<void> | null = null;

  /**
   * Holds the month's usage against the usage budget, after anything that may have
   * changed either. When the month reaches the budget, every watch stops through the
   * cut-off routine (storage needs no change: from that instant every watch is refused,
   * as `level` says) and the room is told only once the closes have returned. Otherwise,
   * each tab whose member's warning changed is told the new one.
   */
  private checkBudget() {
    if (this.stopping) return;
    const level = this.usage.level();
    const told = this.told();
    if (level === told) return;
    if (level === "used up") {
      log.warn("budget.stop", { budget: this.usage.budget() });
      this.stopping = this.cutOff({ everyWatch: true }).finally(() => {
        log.info("budget.stopped", { level: this.usage.level() });
        this.stopping = null;
        this.tellBudget(this.usage.level() === "used up" ? "used up" : told);
        // The budget may have changed while the closes were under way.
        this.checkBudget();
      });
      this.inBackground(this.stopping);
      return;
    }
    this.tellBudget(level);
  }

  /** Tells each open room tab whose member's warning differs from what they were told before. */
  private tellBudget(level: BudgetLevel | null) {
    const told = this.told();
    if (level === told) return;
    log.info("budget.told", { level, before: told });
    if (level === null) this.ctx.storage.kv.delete(BUDGET_TOLD_KEY);
    else this.ctx.storage.kv.put(BUDGET_TOLD_KEY, level);
    const owners = new Map<string, boolean>();
    this.signaling.toEveryRoomTab((id) => {
      if (!owners.has(id)) owners.set(id, this.people.member(id)?.owner ?? false);
      const owner = owners.get(id)!;
      const now = budgetFor(level, owner);
      return now === budgetFor(told, owner) ? null : { type: "usage", change: { type: "budget", budget: now } };
    });
    this.schedule();
  }

  /** The level of the usage budget the room was last told of. */
  private told(): BudgetLevel | null {
    return this.ctx.storage.kv.get<BudgetLevel>(BUDGET_TOLD_KEY) ?? null;
  }

  /**
   * Lets `work` carry on after the answer has gone, as a cut-off's closes do once the
   * owner has their answer. A failure there is already kept as a record to try again.
   */
  private inBackground(work: Promise<void>) {
    this.ctx.waitUntil(work.catch((error: unknown) => log.error("error", error, { during: "work after the answer" })));
  }

  /** Tells the room and the lists of rooms that a share started or ended. */
  private shareChanged(address: string, change: { type: "started" | "ended"; share: LiveShare }) {
    this.signaling.toRoom(address, { type: "shares", change });
    this.relist(address);
  }

  /**
   * The alarm: grace periods running out, members falling silent, failed closes tried
   * again, shares whose media has faltered for too long, and fresh relay credentials.
   */
  override async alarm() {
    // The alarm that runs is spent, so the next is set whatever its time.
    this.alarmAt = undefined;
    try {
      await this.alarmed();
    } catch (error) {
      log.error("error", error, { during: "the alarm" });
      throw error;
    }
  }

  private async alarmed() {
    for (const tab of this.signaling.alarm()) await this.left(tab);
    await this.shares.retry((tab) => this.signaling.holds(tab));
    for (const tab of await this.shares.faltered()) {
      log.info("media.dropped", { tab, why: "faltered" });
      this.signaling.toTab(tab, { type: "media", change: { type: "dropped" } });
    }
    await this.relay.renew((tab, iceServers) =>
      this.signaling.toTab(tab, { type: "media", change: { type: "renewed", iceServers } }),
    );
    // The month may have reset.
    this.checkBudget();
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
      usage: usageFor(this.usage.level(), member.owner),
    };
  }

  /** The whole list of rooms as `member` sees it: what the list gets on connecting. */
  private list(member: Member): ListState {
    return {
      you: { name: member.name, owner: member.owner },
      rooms: this.people.rooms(member).map((room) => this.listed(room)),
    };
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
    const refuse = (why: string) => this.refuse(request, why);

    const section = /^\/owner(?:\/([^/]+))?$/.exec(pathname);
    if (section) {
      const known = section[1] === undefined || OWNER_SECTIONS.includes(section[1]);
      return method === "GET" && known ? page(this.env.ASSETS, request) : refuse(known ? "not a get" : "no such section");
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
        if (invite) log.info("invite.made", { member: owner.id, device: visitor.deviceId, kind: "member", rooms: invite.rooms.map((room) => room.address) });
        return invite ? json({ invite } satisfies CreateInviteAnswer) : refuse("not an invite");
      }
      return refuse("not a get or a post");
    }
    if (pathname === "/api/owner/rooms") {
      if (method === "GET") return json({ rooms: this.people.allRooms() } satisfies OwnerRoomsAnswer);
      if (method !== "POST") return refuse("not a get or a post");
      const body = await request.json<{ name?: unknown }>().catch(() => null);
      const room = body && this.people.newRoom(body.name);
      if (!room) return refuse("not a room name");
      log.info("room.made", { member: owner.id, room: room.address, name: room.name });
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
      if (!room) return refuse("no such room, or not a room name");
      log.info("room.renamed", { member: owner.id, room: room.address, name: room.name });
      this.signaling.toRoom(room.address, { type: "room", change: { type: "renamed", name: room.name } });
      this.relist(room.address);
      return json({ room } satisfies RenameRoomAnswer);
    }
    const invite = /^\/api\/owner\/invites\/([^/]+)$/.exec(pathname);
    if (invite && method === "DELETE") {
      const cancelled = this.people.cancelInvite(invite[1]!);
      if (cancelled) log.info("invite.cancelled", { member: owner.id });
      return cancelled ? done() : refuse("no such invite");
    }
    if (pathname === "/api/owner/usage") {
      return method === "GET" ? json(this.usage.answer() satisfies UsageAnswer) : refuse("not a get");
    }
    // A new reset day or budget may move the month past a warning, or back below one. Raising
    // the budget allows watching at once; setting it below what is used stops it at once.
    if (pathname === "/api/owner/usage/reset-day" && method === "PUT") {
      const body = await request.json<{ day?: unknown }>().catch(() => null);
      if (!body || !this.usage.setResetDay(body.day)) return refuse("not a reset day");
      log.info("usage.reset-day", { member: owner.id, day: body.day });
      this.checkBudget();
      return json(this.usage.answer() satisfies UsageAnswer);
    }
    if (pathname === "/api/owner/usage/budget" && method === "PUT") {
      const body = await request.json<{ gigabytes?: unknown }>().catch(() => null);
      if (!body || !this.usage.setBudget(body.gigabytes)) return refuse("not a budget");
      log.info("usage.budget", { member: owner.id, gigabytes: body.gigabytes });
      this.checkBudget();
      return json(this.usage.answer() satisfies UsageAnswer);
    }
    if (pathname === "/api/owner/people" || pathname.startsWith("/api/owner/people/")) {
      return this.peopleAnswer(request, pathname, visitor);
    }
    return refuse("no such address");
  }

  /** The owner page's People section: every member, and what the owner can do to each. */
  private async peopleAnswer(request: Request, pathname: string, visitor: Visitor): Promise<Response> {
    const { method } = request;
    const refuse = (why: string) => this.refuse(request, why);
    const owner = visitor.member.id;

    if (pathname === "/api/owner/people") {
      if (method !== "GET") return refuse("not a get");
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
      if (!member) return refuse("no such member");
      if (method === "PUT") {
        const granted = this.people.grant(member, address);
        if (granted === null) return refuse("no such room");
        if (granted) log.info("access.granted", { member: owner, subject: member.id, room: address });
        if (granted) this.accessGranted(member, address);
        return json({ person: this.memberEntry(member, visitor.deviceId) } satisfies GrantAnswer);
      }
      if (method === "DELETE") {
        // Storage first: from this instant every request of theirs for the room is refused.
        const revoked = this.people.revoke(member, address);
        if (revoked === null) return refuse("no such room");
        if (revoked) log.info("access.revoked", { member: owner, subject: member.id, room: address });
        if (revoked) this.accessRemoved(member, address);
        return json({ person: this.memberEntry(member, visitor.deviceId) } satisfies GrantAnswer);
      }
      return refuse("not a put or a delete");
    }
    const device = /^\/api\/owner\/people\/([^/]+)\/devices\/([^/]+)$/.exec(pathname);
    if (device && method === "DELETE") {
      const member = this.people.member(device[1]!);
      return (member && (await this.forget(member, device[2]!, visitor))) ?? refuse("no such device");
    }
    const letBackIn = /^\/api\/owner\/people\/([^/]+)\/invite$/.exec(pathname);
    if (letBackIn && method === "POST") {
      const member = this.people.member(letBackIn[1]!);
      const invite = member && this.people.createLetBackIn(member);
      if (invite) log.info("invite.made", { member: owner, subject: member.id, kind: "let back in" });
      return invite ? json({ invite } satisfies CreateInviteAnswer) : refuse("no such member, or the owner");
    }
    const person = /^\/api\/owner\/people\/([^/]+)$/.exec(pathname);
    if (person && method === "DELETE") {
      const member = this.people.member(person[1]!);
      // Storage first: from this instant every device of theirs is a stranger.
      const rooms = member && this.people.remove(member);
      if (!member || !rooms) return refuse("no such member, or the owner");
      log.info("member.removed", { member: owner, subject: member.id, rooms });
      const cut = this.signaling.cutMember(member.id);
      for (const address of rooms) {
        this.signaling.toRoom(address, { type: "people", change: { type: "removed", member: member.id } });
      }
      // The owner's page shows the removal as done at once; the closes carry on.
      this.inBackground(this.cutOff({ member: member.id }, cut, member));
      return done();
    }
    return refuse("no such address");
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
    if (!(await isSetupSecret(this.env, body?.secret))) return this.refuse(request, "not the setup secret");

    // Every other device of the owner's is forgotten, and the browser's own old one.
    const { owner, cookie, forgotten } = await this.people.becomeOwner(request, visitor);
    log.info("owner.setup", { member: owner.id, forgotten: forgotten.length, missing: missingSecrets(this.env) });
    this.devicesForgotten(forgotten);
    return withCookie(
      json({ to: this.landing(owner), missing: missingSecrets(this.env) } satisfies SetupAnswer),
      cookie,
    );
  }

  /** `POST /api/invites/<code>`: the press of the invite page's one button. */
  private async join(request: Request, visitor: Visitor | null, code: string): Promise<Response> {
    const joined = await this.people.join(request, visitor, code);
    if (!joined) return this.refuse(request, "no such invite");
    log.info("invite.used", { member: joined.member.id, name: joined.member.name, forgotten: joined.forgotten.length });
    // "Let back in" forgot the member's other devices, and a remembered browser its old one,
    // whoever's it was: their tabs close as on forgetting one.
    this.devicesForgotten(joined.forgotten);
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

/** The ids a line about the tab behind `socket` is tagged with, whatever state it is in. */
function tabFields(socket: WebSocket): Record<string, unknown> {
  try {
    const tab = socket.deserializeAttachment() as { id?: string; member?: string; device?: string; room?: string } | null;
    return tab ? { member: tab.member, device: tab.device, tab: tab.id, room: tab.room } : {};
  } catch {
    return {};
  }
}

function withCookie(response: Response, cookie: string): Response {
  response.headers.append("Set-Cookie", cookie);
  return response;
}

function roomPath(address: string): string {
  return `/r/${address}`;
}

/** A pull's screen audio transceiver, as a message carries it: left out when the share has none. */
function withAudio(audio: string | null): { audio?: string } {
  return audio === null ? {} : { audio };
}

/**
 * The level of the usage budget as a member is told it: the owner from 80%, everyone
 * else from 95%. Null below their warning.
 */
function budgetFor(level: BudgetLevel | null, owner: boolean): BudgetLevel | null {
  return level === "80%" && !owner ? null : level;
}

/** The usage area of the room as `owner` or a member sees it at `level`. */
function usageFor(level: BudgetLevel | null, owner: boolean): UsageState {
  const budget = budgetFor(level, owner);
  return budget === null ? {} : { budget };
}
