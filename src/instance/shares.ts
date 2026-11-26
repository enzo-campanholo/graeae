// Shares, the watching of them, and the media connections both go over: the instance's
// records of what it has asked of the media server, and the calls that keep the two in
// step (ADR 0003).
//
// A tab has up to two media connections, one for each purpose (ADR 0005): a share goes
// out on its sharer's sending connection, and a watch is pulled from there to the
// watcher's receiving connection. Each record names the connection it is on. A receiving
// connection is never restarted: it is replaced (`replace`), with a new connection the
// tab's watches are pulled onto one by one (`replaceNext`), and the old one's pulls are
// closed once they all are. A tab with no receiving connection on record has nothing to
// replace, which asks the media server nothing. A replacement that ends carrying nothing
// is let go of by the instance (`letGo`), since no browser joins a receiving connection
// until something is pulled there (`docs/media-server.md`). How far a replacement has got
// is read from the records alone, so it outlasts an eviction between two steps: a watch
// pulled onto the replacement and waiting for it to be done is one whose pull has returned
// and that is not yet watching (`carried`). A share handed over meanwhile pulls nothing of
// its own: its watch goes on the stage with no pull, and the replacement pulls it as one
// of its steps (`move`). A watch whose share is being closed, by a hand-over or an end, is
// left to that close: the replacement passes it over, and is not done until every
// hand-over of a share on the tab's stage is, so a watch the hand-over moves is one more
// step, and one it closes leaves nothing behind. A pull the replacement made of it
// meanwhile is still the tab's step, since the media server pulls nothing more onto that
// connection until its offer is answered, and is closed once it is. Until the tab leaves or asks again, every replacement ends `replaced`, `dropped` or
// `unavailable`: the tab is never left waiting for its next step.
//
// Outside a replacement, a pull can return with an offer that never reaches the tab: its
// share ended, or the tab's socket closed, while the media server made it, or the
// instance stopped then. Its pull is closed, but the media server takes no other pull into
// that session until the browser answers the offer (`docs/media-server.md`). So the tab's
// receiving connection is blocked (`block`), in storage, so the block outlasts a restart.
// Its watches play on untouched; the tab's next watch pulls nothing into it and is
// refused as blocked, which has the tab replace it and ask again (`watch`). One that
// carries nothing is let go of instead, as any connection a watch leaves empty. A
// replacement of a blocked connection, for whatever reason, clears the block.
//
// Every call follows one order. The record is written first, with every track name
// picked here, then the media layer is called. A close is always a forced close, and a
// record is dropped only once its close has returned. So a call that fails, or a crash in
// the middle of one, leaves a record with nothing behind it, never a track with no record.
//
// The checks on who may ask (a remembered device, access, presence) are the instance's;
// this module holds the records and the rules about shares and watching themselves.
//
// Every end goes through one routine, the cut-off's (`cutOff`): a member's removal, a
// forgotten device, a grace period running out, a clean leave and an ordinary stop alike.
// It force-closes the covered shares' own tracks, then every other pull of those shares,
// then the covered pulls. The instance changes storage before it, so nothing new can be
// asked of what it covers, and tells the cut-off tabs after it.
//
// A failed forced close keeps its record and is tried again on a backoff (1 s, 2 s, 4 s,
// up to 30 s between tries), until it succeeds or a sweep shows the track gone. The tries
// to come are kept in storage (`retries.ts`), so they outlast a restart, and the
// instance's alarm wakes it for each. The faltering tabs (`faltering.ts`) and the
// hand-overs under way (`hand-overs.ts`) are kept beside them.
//
// The sweep asks the media server which tracks a media connection really has, closes
// any its records do not account for, and drops any record whose track is gone. It runs
// at each cut-off, over the connections the cut-off touched, and after a restart, over
// every connection on record. There is no timed sweep.

import type { IceServer, MediaPurpose } from "../shared/socket/media.ts";
import type { EncodingPlan } from "../shared/encoding.ts";
import type { ListedShare, LiveShare, ShareKind } from "../shared/socket/shares.ts";
import { sameShare, type ChosenQuality, type QualityChoice } from "../shared/socket/watching.ts";
import { Falterings } from "./faltering.ts";
import { HandOvers } from "./hand-overs.ts";
import { log } from "./log.ts";
import type { MediaLayer, Pulled, Track } from "./media/index.ts";
import { Retries, type Subject } from "./retries.ts";
import { tagsOf, type Tab } from "./signaling.ts";

/** A share as the instance recorded it. */
interface ShareRecord {
  id: string;
  member: string;
  room: string;
  tab: string;
  /** The sending connection it goes out on. */
  connection: string;
  kind: ShareKind;
  video: Track;
  /** A screen share's screen audio; null for a webcam share, or a screen share that is video only. */
  audio: Track | null;
  /** Whether the media server registered it, so the room was told it is live. */
  live: boolean;
  /** How many qualities it goes out at: 2 for a watcher to choose between, or 1. */
  qualities: 1 | 2;
  /** The most one watcher can receive of it, in bits per second: the usage count's figure for a gap. */
  maxBitrate: number;
  /** The id of the share of the member's this one was started to replace, by a hand-over; null for none. */
  replaces: string | null;
  /** Whether its end has begun: the room has heard it ended, and it no longer counts, though its close has not returned. */
  ending: boolean;
}

/** A track pulled for a watch: the share's track name, on the mid the media server gave it, null until then. */
interface PulledTrack {
  name: string;
  mid: string | null;
}

/** A watch as the instance recorded it. */
interface WatchRecord {
  id: string;
  /** The watcher's tab. */
  tab: string;
  /** The receiving connection of the watcher's tab the share is pulled to. */
  connection: string;
  /** The watcher, and the device the tab is on. */
  member: string;
  device: string;
  room: string;
  /** The share's id, and the share as the room knows it. */
  shareId: string;
  share: LiveShare;
  /** The pulled video track. */
  video: PulledTrack;
  /** The pulled screen audio, when the share has any. */
  audio: PulledTrack | null;
  /** Whether the pull returned and the share went on the watcher's stage. */
  watching: boolean;
  /** Whether the share's end has begun, so it has left the watcher's stage, though the pull's close has not returned. */
  left: boolean;
  /** The quality the watcher chose; always "auto" for a share with one quality. */
  quality: QualityChoice;
}

/** The media connections, by id, made after their tab's socket was lost, so the tab never heard of them. */
const UNANSWERED_KEY = "shares:unanswered";

/** The receiving connections, by id, left with an offer nobody will answer (`block`). */
const BLOCKED_KEY = "shares:blocked";

/** What a cut-off covers: the shares it ends and the watching it closes. */
export type Covered =
  /** A member's in the room at `room`, or everywhere without it. */
  | { member: string; room?: string }
  /** One device's. */
  | { device: string }
  /** One tab's. */
  | { tabId: string }
  /** One tab's shares, and its sending connection: the tab is reconnecting it. */
  | { sendingFrom: string }
  /** Every watch, and no share: the usage budget stop. */
  | { everyWatch: true };

/** A media connection as the instance recorded it. */
interface ConnectionRow extends Record<string, SqlStorageValue> {
  id: string;
  tab_id: string;
  purpose: MediaPurpose;
  role: "current" | "replacement" | "replaced";
  media_id: string | null;
}

/** A share a cut-off ended, and the room it was live in. */
export interface Ended {
  room: string;
  share: LiveShare;
  /** The tab that sent it. */
  tabId: string;
  /**
   * Set when a hand-over replaced it with a share that is live: the room that one is live
   * in. Within one room the share carries on under the same name, so the room is not told
   * it ended; the tab that sent it is told it was handed over.
   */
  replacedIn?: string;
}

/** What a watch that a hand-over moves is moved to: the new pull, for the watcher's tab. */
export interface Moved {
  offer: string;
  video: string;
  audio: string | null;
}

/** A condition on the `share` and `watch` tables, which both name a member, device, room and tab. */
interface Where {
  where: string;
  bindings: SqlStorageValue[];
}

function whereCovered(covered: Covered): Where {
  if ("everyWatch" in covered) return { where: "1 = 1", bindings: [] };
  if ("tabId" in covered) return { where: "tab_id = ?", bindings: [covered.tabId] };
  if ("sendingFrom" in covered) {
    // A watch is never on a sending connection, so this takes in shares alone.
    return {
      where: "connection_id IN (SELECT id FROM media_connection WHERE tab_id = ? AND purpose = 'sending')",
      bindings: [covered.sendingFrom],
    };
  }
  if ("device" in covered) return { where: "device_id = ?", bindings: [covered.device] };
  if (covered.room === undefined) return { where: "member_id = ?", bindings: [covered.member] };
  return { where: "member_id = ? AND room_address = ?", bindings: [covered.member, covered.room] };
}

/** What the instance hears of watching as it changes, to tell the tabs concerned. */
export interface WatchingListener {
  /** The tab `tabId` no longer watches `share`: its pull is closed. */
  unwatched(tabId: string, share: LiveShare): void;
  /** The members watching `share`, live in the room `room`, are now `members`. */
  watchers(room: string, share: LiveShare, members: string[]): void;
  /** The watch `watch` put a share sent at up to `maxBitrate` bits per second on the tab `tabId`'s stage. */
  began(watch: string, tabId: string, maxBitrate: number): void;
  /** The watch `watch` of the tab `tabId`, which was on its stage, is recorded as ended. */
  ended(watch: string, tabId: string): void;
  /**
   * The end of each of `shares` has begun: from this instant it no longer counts, and its
   * room and the lists of rooms hear it ended. Each share is told once, whatever its close
   * then takes.
   */
  ending(shares: readonly Ended[]): void;
  /** A hand-over moved the tab `tabId`'s watch of `share` to the new share, pulled as `moved` says. */
  moved(tabId: string, share: LiveShare, moved: Moved): void;
  /** A hand-over left the tab `tabId` watching `share` at `quality`, not the one it chose: the new share has one quality. */
  requalified(tabId: string, share: LiveShare, quality: QualityChoice): void;
  /** The tab `tabId`'s receiving connection was let go of, carrying nothing, for `why`: the tab hears `dropped`. */
  dropped(tabId: string, why: string): void;
}

/** What became of a request to watch a share. */
export type Watched =
  /** It is on the tab's stage: `offer`, `video` and `audio` go to the watcher's tab. */
  | { watching: true; offer: string; video: string; audio: string | null }
  /**
   * It was refused, or the media server failed it. `blocked`: the tab's receiving
   * connection is blocked (`block`), so nothing was pulled into it; the tab replaces it,
   * or makes a new one once it is let go of, and asks again.
   */
  | { watching: false; blocked?: true };

/** What became of a request to start a share. */
export type Started =
  /**
   * It is live: `answer` goes to the sharer's tab. `id` is its record's; `handOver` says
   * it replaces another share of the member's, which `handOver` (the method) then ends.
   */
  | { live: true; share: ListedShare; answer: string; id: string; handOver: boolean }
  /** It was refused, or the media server failed it. */
  | { live: false };

interface WatchRow extends Record<string, SqlStorageValue> {
  id: string;
  watching_at: number | null;
  left_at: number | null;
  tab_id: string;
  connection_id: string;
  member_id: string;
  device_id: string;
  room_address: string;
  share_id: string;
  sharer_id: string;
  kind: string;
  video_track: string;
  video_mid: string | null;
  audio_track: string | null;
  audio_mid: string | null;
  quality: string;
}

interface ShareRow extends Record<string, SqlStorageValue> {
  id: string;
  member_id: string;
  room_address: string;
  tab_id: string;
  connection_id: string;
  kind: string;
  video_track: string;
  video_mid: string;
  audio_track: string | null;
  audio_mid: string | null;
  live_at: number | null;
  qualities: number;
  max_bitrate: number;
  ending_at: number | null;
}

export class Shares {
  /** Shares whose forced close is under way, so a second stop does not close them again. */
  private readonly closingShares = new Set<string>();
  /** Watches whose forced close is under way, likewise. */
  private readonly closingWatches = new Set<string>();
  /**
   * The hand-overs under way, by the id of the share each replaces: from the close of its
   * tracks until each of its watchers is moved or closed. `tabs` are those that watched
   * that share as it began, and `over` settles when it is over.
   */
  private readonly handingOver = new Map<string, { tabs: ReadonlySet<string>; over: Promise<unknown> }>();
  /**
   * Records whose first call to the media server (connect, publish, pull) is under way in
   * this run of the instance, by record id. A sweep leaves them alone. After a restart
   * there are none: whatever was under way never returns.
   */
  private readonly inFlight = new Set<string>();
  private readonly retries: Retries;
  private readonly falterings: Falterings;
  private readonly handOvers: HandOvers;

  /**
   * `schedule` is called whenever the next try of a failed close (`nextRetry`) may have
   * changed, so the instance can set its alarm.
   */
  constructor(
    private readonly sql: SqlStorage,
    private readonly kv: SyncKvStorage,
    private readonly media: MediaLayer,
    private readonly listener: WatchingListener,
    private readonly schedule: () => void = () => {},
  ) {
    this.retries = new Retries(kv, () => this.schedule());
    this.falterings = new Falterings(kv, () => this.schedule());
    this.handOvers = new HandOvers(sql, kv);
  }

  /**
   * The live shares in the room at `address`, oldest first. Those sent from one of
   * `silentTabs` are marked "reconnecting".
   */
  live(address: string, silentTabs: readonly string[] = []): ListedShare[] {
    return this.current(`WHERE room_address = ? AND live_at IS NOT NULL ORDER BY live_at, rowid`, address).map(
      (share) => (silentTabs.includes(share.tab) ? { ...toListedShare(share), reconnecting: true } : toListedShare(share)),
    );
  }

  /** The live shares the tab `tabId` sends. */
  liveFrom(tabId: string): LiveShare[] {
    return this.current(`WHERE tab_id = ? AND live_at IS NOT NULL ORDER BY live_at, rowid`, tabId).map(toLiveShare);
  }

  /** Every live share of `member`, wherever it is live, oldest first. */
  sharedBy(member: string): { room: string; kind: ShareKind }[] {
    return this.current(`WHERE member_id = ? AND live_at IS NOT NULL ORDER BY live_at, rowid`, member).map(
      (share) => ({ room: share.room, kind: share.kind }),
    );
  }

  /** The shares the tab `tabId` watches, in the order it began watching them. */
  stage(tabId: string): LiveShare[] {
    return this.watches("WHERE tab_id = ? AND watching_at IS NOT NULL AND left_at IS NULL ORDER BY watching_at, rowid", tabId).map(
      (watch) => watch.share,
    );
  }

  /** The shares on the tab `tabId`'s stage it watches at a quality other than "Auto", in the order it began watching them. */
  qualities(tabId: string): ChosenQuality[] {
    return this.watches(
      "WHERE tab_id = ? AND watching_at IS NOT NULL AND left_at IS NULL AND quality != 'auto' ORDER BY watching_at, rowid",
      tabId,
    ).map((watch) => ({ share: watch.share, quality: watch.quality as ChosenQuality["quality"] }));
  }

  /** Who watches each of `member`'s live shares in the room at `address`. A share nobody watches is left out. */
  watchers(address: string, member: string): { share: LiveShare; members: string[] }[] {
    return this.records(
      "WHERE room_address = ? AND member_id = ? AND live_at IS NOT NULL AND ending_at IS NULL ORDER BY live_at, rowid",
      address,
      member,
    )
      .map((share) => ({ share: toLiveShare(share), members: this.watcherIds(share.id, share.member) }))
      .filter((entry) => entry.members.length > 0);
  }

  /**
   * Every tab with a media connection on record, with the member its shares or watching
   * name: null for a connection that carries neither.
   */
  recordedTabs(): { id: string; device: string; room: string; member: string | null }[] {
    return this.sql
      .exec<{ tab_id: string; device_id: string; room_address: string; member_id: string | null }>(
        `SELECT tab_id, MIN(device_id) AS device_id, MIN(room_address) AS room_address,
           COALESCE((SELECT member_id FROM share WHERE share.tab_id = media_connection.tab_id LIMIT 1),
                    (SELECT member_id FROM watch WHERE watch.tab_id = media_connection.tab_id LIMIT 1)) AS member_id
         FROM media_connection GROUP BY tab_id`,
      )
      .toArray()
      .map((row) => ({ id: row.tab_id, device: row.device_id, room: row.room_address, member: row.member_id }));
  }

  /** The media connections the tab `tabId` has on record, made or being made: sending first. */
  connections(tabId: string): MediaPurpose[] {
    return (["sending", "receiving"] as const).filter((purpose) => this.connectionOf(tabId, purpose) !== undefined);
  }

  /** Whether the tab `tabId` has its `purpose` connection on record, made or being made. */
  hasConnection(tabId: string, purpose: MediaPurpose): boolean {
    return this.connectionOf(tabId, purpose) !== undefined;
  }

  /**
   * The answer that handed `tabId` its `purpose` connection never reached it: its socket
   * was lost on the way. When it asks again, it gets a new connection (`connect`).
   */
  unanswered(tabId: string, purpose: MediaPurpose) {
    const id = this.connectionOf(tabId, purpose)?.id;
    const ids = this.kv.get<string[]>(UNANSWERED_KEY) ?? [];
    if (id !== undefined && !ids.includes(id)) this.kv.put(UNANSWERED_KEY, [...ids, id]);
  }

  /**
   * Makes `tab`'s `purpose` connection and, at the same time, has `mint` mint the relay
   * credential for it. A tab that never heard the answer that handed it that connection
   * (`unanswered`) gets a new one in its place, if the old one carries nothing yet: a
   * connection with no tracks needs no close. "already" when the tab is making one or has
   * one; null when the media server or the relay fails.
   */
  async connect(tab: Tab, purpose: MediaPurpose, mint: () => Promise<IceServer[]>): Promise<IceServer[] | "already" | null> {
    const existing = this.connectionOf(tab.id, purpose);
    if (existing) {
      const unanswered = this.kv.get<string[]>(UNANSWERED_KEY) ?? [];
      if (this.inFlight.has(existing.id) || !unanswered.includes(existing.id)) return "already";
      if (!this.forgetIfEmpty(existing.id)) return "already";
    }
    const made = await this.makeConnection(tab, purpose, "current", mint);
    return made === "stale" ? "already" : made && made.iceServers;
  }

  /**
   * Writes a connection for `tab`'s `purpose` in `role`, then makes it on the media server
   * while `mint` mints its relay credential. Its id and credential; null when the media
   * server or the relay failed, and "stale" when its record was let go of meanwhile (a
   * replacement replaced in its turn).
   */
  private async makeConnection(
    tab: Tab,
    purpose: MediaPurpose,
    role: ConnectionRow["role"],
    mint: () => Promise<IceServer[]>,
  ): Promise<{ id: string; iceServers: IceServer[] } | "stale" | null> {
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO media_connection (id, tab_id, purpose, role, device_id, room_address, media_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      id,
      tab.id,
      purpose,
      role,
      tab.device,
      tab.room,
      Date.now(),
    );
    this.inFlight.add(id);
    // Both at once, so the tab's first share or watch waits on one call to the media
    // server, not two. A credential minted for a connection that then fails goes unused
    // until it expires.
    const minted = mint();
    minted.catch(() => undefined);
    try {
      const mediaId = await this.media.connect();
      // A media connection with no tracks carries nothing, so one let go of needs no close.
      if (this.sql.exec("UPDATE media_connection SET media_id = ? WHERE id = ?", mediaId, id).rowsWritten === 0) return "stale";
      return { id, iceServers: await minted };
    } catch {
      this.sql.exec("DELETE FROM media_connection WHERE id = ?", id);
      return null;
    } finally {
      this.inFlight.delete(id);
    }
  }

  /**
   * Starts replacing `tab`'s receiving connection: a new connection is made beside it,
   * with a relay credential `mint` mints, and the tab's watches are then pulled onto it one
   * by one (`replaceNext`). A replacement already under way for the tab is let go of, and
   * whatever was pulled onto it closed: the tab has let go of that connection to ask again.
   * Its id and credential; null when the media server or the relay failed; "nothing to
   * replace" when the tab has no receiving connection on record, which asks the media
   * server nothing; "stale" when another replacement took its place meanwhile.
   */
  async replace(
    tab: Tab,
    mint: () => Promise<IceServer[]>,
  ): Promise<{ id: string; iceServers: IceServer[] } | "stale" | "nothing to replace" | null> {
    const current = this.connectionOf(tab.id, "receiving");
    if (!current) return "nothing to replace";
    await this.abandonReplacement(tab.id);
    // Told apart from the replacement of a connection that failed or is on the relay.
    log.info("media.replacing", { ...tagsOf(tab), ...(this.isBlocked(current.id) ? { blocked: true } : {}) });
    const made = await this.makeConnection(tab, "receiving", "replacement", mint);
    if (made && made !== "stale" && this.connectionById(made.id)?.role !== "replacement") {
      this.forgetIfEmpty(made.id);
      return "stale";
    }
    if (made === null) {
      // The tab keeps its old connection, and no replacement will pull what a hand-over
      // put on its stage for the one let go of: those shares leave the stage.
      const current = this.connectionOf(tab.id, "receiving");
      const unpulled = current ? this.watches("WHERE connection_id = ?", current.id).filter(isUnpulled) : [];
      for (const watch of unpulled) await this.closeWatch(watch);
    }
    return made;
  }

  /** Lets go of `tabId`'s replacement receiving connection, if it has one, closing what was pulled onto it. */
  private async abandonReplacement(tabId: string) {
    const replacement = this.replacementOf(tabId);
    if (!replacement) return;
    log.warn("media.replacement-abandoned", { tab: tabId, connection: replacement.id });
    const watches = this.watches("WHERE connection_id = ?", replacement.id);
    // Off the record first, so nothing more goes onto it while its pulls close.
    this.sql.exec("UPDATE media_connection SET role = 'replaced' WHERE id = ?", replacement.id);
    for (const watch of watches) await this.closeWatch(watch);
    this.forgetIfEmpty(replacement.id);
  }

  /**
   * The next step of replacing `tab`'s receiving connection with `replacementId`: pulls the
   * next share on the tab's stage that is not on the replacement yet, from its sharer's
   * sending connection, and returns the pull for the tab, which answers it before the next
   * step. A share that cannot be pulled again leaves the stage, and the step goes on to the
   * next. Once every share on the stage is on the replacement, the replacement is done: it
   * becomes the tab's receiving connection, each pull on it goes on the stage in place of
   * the old one's, and the old connection's pulls are closed, which tells nobody; "done".
   *
   * A watch whose share is ending, or is being closed by a hand-over, is passed over: it
   * is not the replacement's to carry, nor to take off the stage, since the share's end
   * does that and tells the tab, and the hand-over moves it to the new share once the old
   * one is closed. So is one whose pull onto the replacement the media server failed as
   * that close went on, and the step goes on to the next. The replacement is not done
   * while a hand-over of a share on the tab's stage is under way: it waits for it, then
   * looks again, so the moved watch is pulled as one more step and a closed one is gone. One whose pull returned as that close went on is returned all the same:
   * the media server pulls nothing more onto the replacement until the tab answers its
   * offer, closing the pull or not (`docs/media-server.md`). The next step, which the
   * tab's answer begins, closes it first. The replacement is kept all the while.
   *
   * "stale" only when the tab left, or asked for another replacement in this one's place,
   * which is then the one it waits for: a tab never waits for a replacement that ends
   * "stale". `stillOpen` says whether the tab is still there once the media server has
   * answered.
   */
  async replaceNext(
    tab: Tab,
    replacementId: string,
    stillOpen: () => boolean,
  ): Promise<{ share: LiveShare; offer: string; video: string; audio: string | null } | "done" | "stale"> {
    const passedOver = new Set<string>();
    for (;;) {
      const replacement = this.replacementOf(tab.id);
      if (replacement?.id !== replacementId || typeof replacement.media_id !== "string") return "stale";
      if (!stillOpen()) {
        // The tab's socket closed while the media server was making it: the tab left, or
        // is in its grace period and asks again on its next socket. Its leaving could not
        // forget a connection still being made. With nothing on it, it needs no close.
        this.forgetIfEmpty(replacementId);
        return "stale";
      }
      // The tab has answered the last step: a pull of a share that went meanwhile is closed now.
      for (const watch of this.watches("WHERE connection_id = ? AND watching_at IS NULL", replacementId)) {
        if (this.carried(watch) && this.gone(watch.shareId)) await this.closeWatch(watch);
      }
      const current = this.connectionOf(tab.id, "receiving");
      const carried = new Set(this.watches("WHERE connection_id = ?", replacementId).map((watch) => watch.shareId));
      const next = current
        ? this.watches(
            "WHERE connection_id = ? AND watching_at IS NOT NULL AND left_at IS NULL ORDER BY watching_at, rowid",
            current.id,
          ).find((watch) => !carried.has(watch.shareId) && !this.closingWatches.has(watch.id) && !passedOver.has(watch.id))
        : undefined;
      if (!next) {
        const handOvers = [...this.handingOver.values()].filter(({ tabs }) => tabs.has(tab.id)).map(({ over }) => over);
        if (handOvers.length > 0) {
          await Promise.all(handOvers);
          // What was passed over is moved or closed now, or kept if the hand-over's close failed.
          passedOver.clear();
          continue;
        }
        await this.finishReplacement(tab, replacementId);
        return "done";
      }

      const watched = this.records("WHERE id = ? AND live_at IS NOT NULL AND ending_at IS NULL", next.shareId)[0];
      if (!watched || this.gone(watched.id)) {
        passedOver.add(next.id);
        continue;
      }
      const sharerMediaId = this.connectionById(watched.connection)?.media_id;
      if (typeof sharerMediaId !== "string") {
        this.leave(next);
        continue;
      }
      const record = newWatch({ ...next, connection: replacementId }, watched, next.quality);
      this.inFlight.add(record.id);
      let pulled: Pulled | null;
      try {
        pulled = await this.pull(record, replacement.media_id, sharerMediaId, watched);
      } finally {
        this.inFlight.delete(record.id);
      }
      if (!pulled) {
        log.warn("watch.refused", { ...tagsOf(tab), share: next.share, why: "the media server failed the pull again" });
        if (this.gone(watched.id)) passedOver.add(next.id);
        else this.leave(next);
        continue;
      }
      if (!stillOpen() || this.replacementOf(tab.id)?.id !== replacementId) {
        await this.closeWatch(record);
        if (!stillOpen()) this.forgetIfEmpty(replacementId);
        return "stale";
      }
      // A share that went while its pull was made is still the tab's step: the media server
      // takes no other pull on the replacement until the tab answers this one's offer, and
      // closing the pull does not change that. Its pull is closed once the tab has answered,
      // as the next step begins; the hand-over or the end took the share off this pull.
      const wentMeanwhile = this.gone(watched.id);
      if (wentMeanwhile) passedOver.add(next.id);
      log.info("watch.pulled-again", {
        ...tagsOf(tab),
        share: next.share,
        watch: record.id,
        from: next.id,
        tracks: pulledTracksOf(record),
        ...(wentMeanwhile ? { shareGone: true } : {}),
      });
      return { share: record.share, offer: pulled.offer, video: record.video.mid!, audio: record.audio?.mid ?? null };
    }
  }

  /**
   * `watch` could not be carried onto a replacement: its share leaves the stage, the tab and
   * the sharer told, and its pull is closed in turn, which tells nobody again.
   */
  private leave(watch: WatchRecord) {
    this.changeWatchers(watch, () => this.sql.exec("UPDATE watch SET left_at = ? WHERE id = ?", Date.now(), watch.id));
    this.listener.unwatched(watch.tab, watch.share);
  }

  /** The end of a replacement: see `replaceNext`. */
  private async finishReplacement(tab: Tab, replacementId: string) {
    const old = this.connectionOf(tab.id, "receiving");
    const stage = old
      ? this.watches("WHERE connection_id = ? AND watching_at IS NOT NULL AND left_at IS NULL", old.id)
      : [];
    const carried = this.watches("WHERE connection_id = ? AND watching_at IS NULL", replacementId).filter((watch) =>
      this.carried(watch),
    );
    const stray: WatchRecord[] = [];
    const now = Date.now();
    // In one go, so the stage never shows a share twice, or loses one in between.
    for (const watch of carried) {
      const before = stage.find((other) => other.shareId === watch.shareId);
      // A pull of a share that went, whose close failed: not for the stage.
      if (!before || this.gone(watch.shareId)) {
        stray.push(watch);
        continue;
      }
      const watchingAt = this.sql.exec<{ watching_at: number }>("SELECT watching_at FROM watch WHERE id = ?", before.id).one().watching_at;
      this.sql.exec("UPDATE watch SET watching_at = ? WHERE id = ?", watchingAt, watch.id);
      this.sql.exec("UPDATE watch SET left_at = ? WHERE id = ?", now, before.id);
      const share = this.records("WHERE id = ?", watch.shareId)[0];
      this.listener.began(watch.id, tab.id, share?.maxBitrate ?? 0);
    }
    if (old) {
      this.sql.exec("UPDATE media_connection SET role = 'replaced' WHERE id = ?", old.id);
      // Nothing is pulled into it again.
      this.unblock(old.id);
    }
    this.sql.exec("UPDATE media_connection SET role = 'current' WHERE id = ?", replacementId);
    log.info("media.replaced", { ...tagsOf(tab), connection: replacementId, watches: carried.length - stray.length });

    for (const watch of stray) await this.closeWatch(watch);
    if (old) {
      // A watch still being pulled there finds its connection replaced when the pull
      // returns, and closes itself. One of a share being closed is left to that close: a
      // hand-over begun as this one ended then moves it onto the replacement, and an end
      // closes it.
      const leftToClose = (watch: WatchRecord) => this.closingShares.has(watch.shareId) || this.handingOver.has(watch.shareId);
      for (const watch of this.watches("WHERE connection_id = ?", old.id)) {
        if (!this.inFlight.has(watch.id) && !leftToClose(watch)) await this.closeWatch(watch);
      }
      this.forgetIfEmpty(old.id);
    }
  }

  /**
   * Starts a share of `kind` by `member` from `tab`, which the browser's `offer` sends:
   * its video on the transceiver `mids.video` and, for a screen share with screen audio,
   * its audio on `mids.audio`. The two are one unit: recorded, published and closed
   * together. Refused unless the tab's sending connection is made and the member has no
   * other share of that kind anywhere in the instance, live or starting. A webcam share
   * is video only. `plan` is how the browser sends it, which says how many qualities a
   * watcher can choose between and its maximum bitrate for the usage count. `stillOpen`
   * says whether the tab is still there once the media server has answered.
   *
   * With `handOver`, a member whose share of that kind is live from another tab may start
   * one here all the same: the new share is recorded as replacing the old one, and
   * registered first. The old one carries on untouched until the new one is live, and
   * for good if it fails; `handOver` (the method) then ends it. Refused while the old
   * one is starting or ending, or another hand-over of it is under way.
   */
  async start(
    tab: Tab,
    member: string,
    kind: ShareKind,
    offer: string,
    mids: { video: string; audio?: string },
    plan: EncodingPlan,
    stillOpen: () => boolean,
    { handOver = false } = {},
  ): Promise<Started> {
    const refused = (why: string): Started => {
      log.warn("share.refused", { ...tagsOf(tab), kind, why });
      return { live: false };
    };
    const connection = this.connectionOf(tab.id, "sending");
    const mediaId = connection?.media_id;
    if (!connection || typeof mediaId !== "string") return refused("no sending connection");
    if (mids.audio !== undefined && (kind === "webcam" || mids.audio === mids.video)) return refused("audio on a webcam, or on the video's mid");
    // A share whose end has begun, or a replaced one, no longer counts, though its close is still under way or tried again.
    const existing = this.current("WHERE member_id = ? AND kind = ?", member, kind);
    const replaced = existing[0];
    if (replaced) {
      const replaceable = handOver && existing.length === 1 && replaced.live && replaced.tab !== tab.id;
      if (!replaceable || this.closingShares.has(replaced.id)) return refused(handOver ? "not replaceable now" : "already sharing one");
    }

    const share: ShareRecord = {
      id: crypto.randomUUID(),
      member,
      room: tab.room,
      tab: tab.id,
      connection: connection.id,
      kind,
      video: { name: `${kind}-${crypto.randomUUID()}`, mid: mids.video },
      audio: mids.audio === undefined ? null : { name: `${kind}-audio-${crypto.randomUUID()}`, mid: mids.audio },
      live: false,
      qualities: plan.qualities.length > 1 ? 2 : 1,
      maxBitrate: plan.maxBitrate,
      replaces: replaced?.id ?? null,
      ending: false,
    };
    this.sql.exec(
      `INSERT INTO share (id, member_id, device_id, room_address, tab_id, connection_id, kind, video_track, video_mid, audio_track,
         audio_mid, qualities, max_bitrate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      share.id,
      member,
      tab.device,
      tab.room,
      tab.id,
      connection.id,
      share.kind,
      share.video.name,
      share.video.mid,
      share.audio?.name ?? null,
      share.audio?.mid ?? null,
      share.qualities,
      share.maxBitrate,
      Date.now(),
    );
    // Marked as replacing the old one before the media server is called.
    if (share.replaces) {
      log.info("handover.started", { ...tagsOf(tab), kind, share: share.id, replaces: share.replaces });
      this.handOvers.mark(share.id, share.replaces);
    }

    this.inFlight.add(share.id);
    try {
      let answer: string;
      try {
        answer = await this.media.publish(mediaId, offer, tracksOf(share));
      } catch {
        // The track may exist even so: close it before forgetting it.
        await this.closeTracks(share);
        return refused("the media server failed");
      }
      if (!stillOpen()) {
        // The tab left while the media server was answering, and its leaving could not
        // close a track that did not exist yet.
        await this.closeTracks(share);
        this.forgetIfEmpty(connection.id);
        return refused("the tab left meanwhile");
      }
      this.sql.exec("UPDATE share SET live_at = ? WHERE id = ?", Date.now(), share.id);
      log.info("share.live", { ...tagsOf(tab), kind, share: share.id, tracks: tracksOf(share), qualities: share.qualities });
      return { live: true, share: toListedShare(share), answer, id: share.id, handOver: share.replaces !== null };
    } finally {
      this.inFlight.delete(share.id);
    }
  }

  /**
   * Watches `share` from `tab`, pulling its tracks to the tab's receiving connection. Refused
   * unless the tab's receiving connection is made, the share is live in the tab's room and not
   * ending, and the tab is not the one sending it. Null when the tab already watches it,
   * or is starting to. `stillOpen` says whether the tab is still there once the media
   * server has answered.
   *
   * Refused as `blocked`, asking the media server nothing, while the tab's receiving
   * connection is blocked (`block`). A pull that returns once its share has ended, its tab
   * has gone, or its connection has been replaced, is closed with its offer never sent,
   * which blocks the connection if it is still the tab's.
   */
  async watch(tab: Tab, share: LiveShare, stillOpen: () => boolean): Promise<Watched | null> {
    const refused = (why: string): Watched => {
      log.warn("watch.refused", { ...tagsOf(tab), share, why });
      return { watching: false };
    };
    const connection = this.receivingTarget(tab.id);
    const watcherMediaId = connection?.media_id;
    if (!connection || typeof watcherMediaId !== "string") return refused("no receiving connection");
    // During a hand-over within the room, the share by this name is the new one.
    const watched = this.current(
      "WHERE member_id = ? AND kind = ? AND room_address = ? AND live_at IS NOT NULL",
      share.member,
      share.kind,
      tab.room,
    )[0];
    if (!watched) return refused("no such share live in the room");
    if (this.closingShares.has(watched.id)) return refused("the share is ending");
    if (watched.tab === tab.id) return refused("the tab sends it");
    const sharerMediaId = this.connectionById(watched.connection)?.media_id;
    if (typeof sharerMediaId !== "string") return refused("the sharer has no sending connection");
    if (this.watches("WHERE tab_id = ? AND share_id = ? AND left_at IS NULL", tab.id, watched.id).length > 0) return null;
    if (connection.role === "current" && this.isBlocked(connection.id)) {
      log.warn("watch.refused", { ...tagsOf(tab), share, why: "the receiving connection is blocked", blocked: true });
      return { watching: false, blocked: true };
    }

    const record = newWatch(
      { tab: tab.id, connection: connection.id, member: tab.member, device: tab.device, room: tab.room },
      watched,
      "auto",
    );
    this.inFlight.add(record.id);
    try {
      const pulled = await this.pull(record, watcherMediaId, sharerMediaId, watched);
      if (!pulled) return refused("the media server failed");

      if (!stillOpen() || this.gone(watched.id) || this.receivingTarget(tab.id)?.id !== connection.id) {
        // The tab left, the share ended, or the connection was replaced, while the media
        // server was answering, and none of them could close a pull that had no mid yet.
        // The instance then lets go of the connection if it carries nothing.
        const why = stillOpen() ? "the share ended or the connection was replaced meanwhile" : "the tab left meanwhile, or the budget ran out";
        this.block(record, why);
        await this.closeWatch(record);
        return refused(why);
      }
      this.changeWatchers(record, () =>
        this.sql.exec("UPDATE watch SET watching_at = ? WHERE id = ?", Date.now(), record.id),
      );
      this.listener.began(record.id, tab.id, watched.maxBitrate);
      log.info("watch.started", { ...tagsOf(tab), share, watch: record.id, of: watched.id, tracks: pulledTracksOf(record) });
      return { watching: true, offer: pulled.offer, video: record.video.mid!, audio: record.audio?.mid ?? null };
    } finally {
      this.inFlight.delete(record.id);
    }
  }

  /**
   * Whether the share `id` is being ended, or has ended, or is no longer on record: it
   * gains no watcher, even if its own close then fails.
   */
  private gone(id: string): boolean {
    return this.closingShares.has(id) || !this.records("WHERE id = ? AND ending_at IS NULL", id)[0];
  }

  /**
   * Writes the watch `record` of `watched`, then pulls its tracks from the sharer's media
   * connection to the watcher's, and records the mids the media server gave them. A
   * screen share's video and audio are pulled together, as one unit, and a picture sent
   * at two qualities at the quality the record holds. Null when the media server failed:
   * it gave no mid to close by, so the record goes, and a pulled track it made all the
   * same is for the sweep, which closes what no record names.
   */
  private async pull(record: WatchRecord, watcherMediaId: string, sharerMediaId: string, watched: ShareRecord) {
    this.insertWatch(record, watched, null);
    let pulled: Pulled;
    try {
      pulled = await this.media.pull(
        watcherMediaId,
        sharerMediaId,
        pulledTracksOf(record).map((track) => track.name),
        ...(watched.qualities === 2 ? [{ name: record.video.name, quality: record.quality }] : []),
      );
    } catch {
      this.sql.exec("DELETE FROM watch WHERE id = ?", record.id);
      return null;
    }
    const midOf = (name: string) => pulled.tracks.find((track) => track.name === name)?.mid ?? null;
    record.video.mid = midOf(record.video.name) ?? pulled.tracks[0]?.mid ?? "";
    if (record.audio) record.audio.mid = midOf(record.audio.name);
    this.sql.exec("UPDATE watch SET video_mid = ?, audio_mid = ? WHERE id = ?", record.video.mid, record.audio?.mid ?? null, record.id);
    return pulled;
  }

  /** Writes the watch `record` of `watched`, with nothing pulled for it yet, on the watcher's stage from `watchingAt` or not yet. */
  private insertWatch(record: WatchRecord, watched: ShareRecord, watchingAt: number | null) {
    this.sql.exec(
      `INSERT INTO watch (id, tab_id, connection_id, member_id, device_id, room_address, share_id, sharer_id, kind, video_track,
         audio_track, quality, created_at, watching_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      record.tab,
      record.connection,
      record.member,
      record.device,
      record.room,
      watched.id,
      watched.member,
      watched.kind,
      record.video.name,
      record.audio?.name ?? null,
      record.quality,
      Date.now(),
      watchingAt,
    );
  }

  /**
   * The rest of a hand-over, once the share `id` that replaces another is live: the old
   * share's tracks are force-closed, and each of its watchers in the same room is moved to
   * the new share (the old pull closed, the new one made). A watcher whose tab is not
   * connected now, or is the one sending the new share, is not moved: its pull is closed.
   * A hand-over into another room carries nobody: every pull of the old share is closed.
   * Returns the old share once it has ended. If its close fails it is no longer listed,
   * since the new one is, and it is tried again as any failed close is: the first try
   * begins its end, which takes it off its watchers' stages rather than moving them.
   * `connected` says whether a tab's signaling connection is open.
   */
  async handOver(id: string, connected: (tabId: string) => boolean): Promise<Ended[]> {
    const to = this.records("WHERE id = ? AND live_at IS NOT NULL", id)[0];
    if (!to?.replaces) return [];
    const from = this.records("WHERE id = ? AND live_at IS NOT NULL", to.replaces)[0];
    if (!from || from.ending || this.closingShares.has(from.id) || this.handingOver.has(from.id)) return [];

    // Under way until each watcher is moved or closed: a replacement of a watcher's receiving connection waits for it.
    const tabs = new Set(this.watches("WHERE share_id = ? AND left_at IS NULL", from.id).map((watch) => watch.tab));
    const over = this.carryOver(from, to, connected);
    this.handingOver.set(from.id, { tabs, over: over.catch(() => undefined) });
    try {
      return await over;
    } finally {
      this.handingOver.delete(from.id);
    }
  }

  /** `handOver`'s close of the old share and moves of its watchers. */
  private async carryOver(from: ShareRecord, to: ShareRecord, connected: (tabId: string) => boolean): Promise<Ended[]> {
    this.closingShares.add(from.id);
    let closed: boolean;
    try {
      closed = await this.closeTracks(from);
    } finally {
      this.closingShares.delete(from.id);
    }
    if (!closed) return [];

    const sameRoom = from.room === to.room;
    // Not a pull left behind on a replaced connection: its share is on the stage by the replacement's.
    const pulls = this.watches("WHERE share_id = ? AND watching_at IS NOT NULL AND left_at IS NULL", from.id);
    for (const watch of pulls) {
      if (sameRoom && watch.tab !== to.tab && connected(watch.tab)) await this.move(watch, to, connected);
      else await this.closeWatch(watch);
    }
    log.info("handover.done", { share: to.id, replaced: from.id, room: to.room, from: from.room, watchers: pulls.length });
    // The sharer's tabs on the room hear who watches the share under its one name, once.
    if (sameRoom && pulls.length > 0) this.listener.watchers(to.room, toLiveShare(to), this.watcherIds(to.id, to.member));
    return [{ room: from.room, share: toLiveShare(from), tabId: from.tab, replacedIn: to.room }];
  }

  /**
   * Moves `watch`, of a share a hand-over within its room has just closed, to the share
   * `to` that replaced it: its old pull is closed, then the new share is pulled to the
   * tab's receiving connection, at the quality the watcher chose if `to` has two. The
   * watcher's stage keeps the share, and the tab hears `moved`. If the old pull's close
   * fails, the watcher stays on the old share until a try succeeds, and is not moved. If
   * the new pull fails, or the tab leaves or the new share ends meanwhile, the share
   * leaves the stage. A new pull closed that way never reached the tab, so it blocks the
   * connection (`block`), and a connection then left carrying nothing is let go of.
   *
   * While the tab replaces its receiving connection, every offer it gets is one of the
   * replacement's steps (`replaceNext`), so the move pulls nothing: the new share goes on
   * the stage of the connection being replaced with nothing pulled for it yet, and the
   * replacement pulls it as one of its steps, since it waits for the hand-over to be done.
   * One that was done just as the hand-over began left the watch on the connection it
   * replaced, and the move pulls the new share onto the new one. A pull that returns to
   * find the tab's receiving connection replaced, or being replaced, is for a session the
   * tab is letting go of: it is closed, and the move done again.
   */
  private async move(watch: WatchRecord, to: ShareRecord, connected: (tabId: string) => boolean) {
    if (!(await this.closeWatch(watch, { moving: true }))) return;
    const quality = to.qualities === 2 ? watch.quality : "auto";
    const requalified = () => {
      if (quality !== watch.quality) this.listener.requalified(watch.tab, watch.share, quality);
    };
    for (;;) {
      const current = this.connectionOf(watch.tab, "receiving");
      const watcherMediaId = current?.media_id;
      const sharerMediaId = this.connectionById(to.connection)?.media_id;
      if (!current || typeof watcherMediaId !== "string" || typeof sharerMediaId !== "string") {
        this.listener.unwatched(watch.tab, watch.share);
        return;
      }
      const record = newWatch({ ...watch, connection: current.id }, to, quality);
      if (this.replacementUnderWay(watch.tab)) {
        // The new share may have ended, or the watcher left, while the old pull closed.
        if (!connected(watch.tab) || this.gone(to.id)) {
          this.listener.unwatched(watch.tab, watch.share);
          return;
        }
        this.insertWatch(record, to, Date.now());
        log.info("handover.moved", { tab: watch.tab, member: watch.member, watch: record.id, share: to.id, from: watch.id, step: true });
        requalified();
        return;
      }
      this.inFlight.add(record.id);
      try {
        const pulled = await this.pull(record, watcherMediaId, sharerMediaId, to);
        if (!pulled) {
          this.listener.unwatched(watch.tab, watch.share);
          return;
        }
        if (!connected(watch.tab) || this.gone(to.id)) {
          this.block(record, connected(watch.tab) ? "the new share ended while the watch was moved to it" : "the tab left while its watch was moved");
          await this.closeWatch(record);
          this.listener.unwatched(watch.tab, watch.share);
          if (this.letGo(watch.tab, "receiving")) this.listener.dropped(watch.tab, "a moved watch did not go live");
          return;
        }
        if (this.receivingTarget(watch.tab)?.id !== current.id) {
          log.info("handover.pulled-again", { tab: watch.tab, member: watch.member, watch: record.id, share: to.id, why: "the connection was replaced meanwhile" });
          // The replacement clears the block, unless the tab lets go of the replacement.
          this.block(record, "the connection was replaced meanwhile");
          await this.closeWatch(record);
          continue;
        }
        this.sql.exec("UPDATE watch SET watching_at = ? WHERE id = ?", Date.now(), record.id);
        this.listener.began(record.id, watch.tab, to.maxBitrate);
        log.info("handover.moved", { tab: watch.tab, member: watch.member, watch: record.id, share: to.id, from: watch.id });
        this.listener.moved(watch.tab, record.share, { offer: pulled.offer, video: record.video.mid!, audio: record.audio?.mid ?? null });
        requalified();
        return;
      } finally {
        this.inFlight.delete(record.id);
      }
    }
  }

  /**
   * After a restart: a hand-over whose new share went live before the restart, but whose
   * old share was not closed, is finished by ending the old share. Its watchers are not
   * carried over: their tabs, like everyone's, were cut off by the restart. A share whose
   * end had begun is closed again, and nobody hears of it again.
   */
  async finishEnds(): Promise<Ended[]> {
    const replaced = this.handOvers.replaced();
    const stuck = this.records("WHERE live_at IS NOT NULL").filter(
      (share) => (replaced.has(share.id) || share.ending) && !this.closingShares.has(share.id) && !this.inFlight.has(share.id),
    );
    return this.end(stuck, null);
  }

  /**
   * The quality `tab` watches `share` at, or null when it does not watch it (or is still
   * starting to).
   */
  quality(tab: Tab, share: LiveShare): QualityChoice | null {
    return this.watching(tab, share)?.quality ?? null;
  }

  /**
   * Has `tab` watch `share`, which it watches, at `quality`: the media server is told
   * mid-watch, and the choice is recorded once it has returned. Returns the quality the
   * tab now watches at: `quality`, or the one it had when the media server failed or the
   * share has one quality. Null when the tab does not watch the share, or stopped while
   * the media server was answering.
   */
  async setQuality(tab: Tab, share: LiveShare, quality: QualityChoice): Promise<QualityChoice | null> {
    const watch = this.watching(tab, share);
    if (!watch?.video.mid || this.closingWatches.has(watch.id)) return watch?.quality ?? null;
    const watched = this.records("WHERE id = ?", watch.shareId)[0];
    if (!watched || watched.qualities !== 2 || this.closingShares.has(watched.id) || quality === watch.quality) return watch.quality;
    // A replacement pulls the share again at the quality it had: a choice made meanwhile is
    // refused, and the tab hears the quality it has, from which it can choose again.
    if (this.replacementOf(tab.id)) return watch.quality;
    const watcherMediaId = this.connectionById(watch.connection)?.media_id;
    const sharerMediaId = this.connectionById(watched.connection)?.media_id;
    if (typeof watcherMediaId !== "string" || typeof sharerMediaId !== "string") return watch.quality;
    try {
      await this.media.setQuality(watcherMediaId, sharerMediaId, { name: watch.video.name, mid: watch.video.mid }, quality);
    } catch {
      log.warn("quality.failed", { ...tagsOf(tab), share, watch: watch.id, quality });
      return watch.quality;
    }
    // The pull may have been closed while the media server was answering.
    if (this.watches("WHERE id = ?", watch.id).length === 0) return null;
    this.sql.exec("UPDATE watch SET quality = ? WHERE id = ?", quality, watch.id);
    return quality;
  }

  /** `tab`'s watch of `share`, once it is on the tab's stage, and while it stays there. */
  private watching(tab: Tab, share: LiveShare): WatchRecord | undefined {
    return this.watches("WHERE tab_id = ? AND watching_at IS NOT NULL AND left_at IS NULL", tab.id).find((watch) =>
      sameShare(watch.share, share),
    );
  }

  /**
   * Stops `tab` watching `share` by a forced close of its pull. The tab and the sharer
   * hear of it through the listener once the close has returned. Nothing happens when the
   * tab does not watch it, is still starting to, or is already stopping.
   */
  async unwatch(tab: Tab, share: LiveShare): Promise<void> {
    const record = this.watching(tab, share);
    if (record) await this.closeWatch(record);
  }

  /**
   * Hands the media server `tab`'s answer to the offer of its last pull, on its receiving
   * connection, or on the replacement while one is under way. False if that failed.
   */
  async renegotiate(tab: Tab, answer: string): Promise<boolean> {
    const mediaId = this.receivingTarget(tab.id)?.media_id;
    if (typeof mediaId !== "string") return false;
    try {
      await this.media.renegotiate(mediaId, answer);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Hands the media server `tab`'s offer restarting its sending connection's ICE, and
   * returns the media server's answer. Null when the tab has no sending connection, or the
   * media server failed it. Every share on the connection stays as it is.
   */
  async restart(tab: Tab, offer: string, mid: string): Promise<string | null> {
    const mediaId = this.connectionOf(tab.id, "sending")?.media_id;
    if (typeof mediaId !== "string") return null;
    try {
      return await this.media.restart(mediaId, offer, mid);
    } catch {
      return null;
    }
  }

  /**
   * Ends `tab`'s live share of `kind` through the cut-off's own forced close. Nothing
   * happens when the tab has no such share, or it is already ending. A close that fails
   * keeps its record, and is tried again.
   */
  async stop(tab: Tab, kind: ShareKind): Promise<void> {
    // Not one whose end has begun: the tab may have started the kind again since.
    const share = this.current("WHERE tab_id = ? AND kind = ? AND live_at IS NOT NULL", tab.id, kind)[0];
    if (share) await this.end([share], null);
  }

  /**
   * The cut-off, which every clean leave goes through too: ends the live shares `covered`
   * takes in and closes the watching it takes in. In order, it force-closes the shares'
   * own tracks, then every other pull of those shares, then the covered pulls. Then it
   * sweeps the media connections of the covered tabs and of `tabIds`, and forgets each once
   * nothing is left on it: an empty connection a cut-off browser keeps open carries
   * nothing and cannot gain a track, so it is left alone. The usage budget stop forgets
   * none: its watchers stay, and may watch again. The room hears of each share as its
   * end begins (`ending`); the shares whose close returned are returned, for the logs.
   * A share whose close failed keeps its record, and so does every pull of it but the
   * covered ones, until a try succeeds; `subject` is who the owner hears about if none
   * has after a minute.
   *
   * The caller has already changed storage, so no request of the covered tabs is granted
   * any more, and the covered tabs are no longer open: a share or pull of theirs still
   * waiting for the media server closes itself when it returns.
   */
  async cutOff(covered: Covered, tabIds: readonly string[] = [], subject?: Subject): Promise<Ended[]> {
    const where = whereCovered(covered);
    if ("tabId" in covered) this.recovered(covered.tabId);
    if ("sendingFrom" in covered) this.recovered(covered.sendingFrom);
    // The usage budget stop ends no share, and its watchers' tabs carry on with their media
    // connections, ready to watch again once the budget allows it.
    const stop = "everyWatch" in covered;
    const shares = stop ? [] : this.records(`WHERE ${where.where} AND live_at IS NOT NULL`, ...where.bindings);
    const ofTabs = (tabs: readonly string[]) => tabs.flatMap((tab) => this.connectionsOf(tab).map((row) => row.id));
    const touched = new Set([
      ...ofTabs(tabIds),
      ...ofTabs("tabId" in covered ? [covered.tabId] : []),
      ...("sendingFrom" in covered ? [this.connectionOf(covered.sendingFrom, "sending")?.id ?? ""] : []),
      ...shares.map((share) => share.connection),
      ...this.watches(`WHERE ${where.where}`, ...where.bindings).map((watch) => watch.connection),
    ]);
    touched.delete("");
    const ended = await this.end(shares, where, subject);
    ended.push(...(await this.sweep([...touched])));
    if (!stop) for (const connection of touched) this.forgetIfEmpty(connection);
    return ended;
  }

  /** The cut-off's closes, in order, for `shares` and the pulls `covered` takes in. See `cutOff`. */
  private async end(
    shares: readonly ShareRecord[],
    covered: Where | null,
    subject?: Subject,
    { gone = false } = {},
  ): Promise<Ended[]> {
    const ours = shares.filter((share) => !this.closingShares.has(share.id));
    // From this instant none of them can gain a watcher, though their closes come one by one.
    for (const share of ours) this.closingShares.add(share.id);
    // A share a hand-over replaced, whose close comes late: the replacement says where it went.
    const endedOf = (share: ShareRecord): Ended => {
      const replacedIn = this.replacementRoom(share.id);
      return { room: share.room, share: toLiveShare(share), tabId: share.tab, ...(replacedIn ? { replacedIn } : {}) };
    };
    // Nor do they count any more: the rooms hear they ended, and their watchers that they
    // left the stage, before the first close. Once each: a close tried again tells nobody.
    const begun = ours.filter((share) => share.live && !share.ending).map((share) => ({ share, ended: endedOf(share) }));
    for (const { share } of begun) {
      this.sql.exec("UPDATE share SET ending_at = ? WHERE id = ?", Date.now(), share.id);
      log.info("share.ending", shareFields(share));
    }
    if (begun.length > 0) this.listener.ending(begun.map(({ ended }) => ended));
    for (const { share, ended } of begun) this.leaveStages(share, ended.replacedIn);

    const closed: ShareRecord[] = [];
    const ended: Ended[] = [];
    for (const share of ours) {
      try {
        if (await this.closeTracks(share, { subject, gone })) {
          closed.push(share);
          ended.push(endedOf(share));
        }
      } finally {
        this.closingShares.delete(share.id);
      }
    }

    const others = covered ? `AND NOT (${covered.where})` : "";
    for (const share of closed) {
      // A pull still waiting for the media server closes itself once it sees the share is gone.
      const pulls = this.watches(
        `WHERE share_id = ? AND watching_at IS NOT NULL ${others}`,
        share.id,
        ...(covered?.bindings ?? []),
      );
      for (const watch of pulls) await this.closeWatch(watch, { subject });
    }

    if (covered) {
      // With what a replacement under way has pulled again, which is not on the stage yet.
      const pulls = this.watches(`WHERE ${covered.where}`, ...covered.bindings).filter(
        (watch) => watch.watching || this.carried(watch),
      );
      for (const watch of pulls) await this.closeWatch(watch, { subject });
    }
    return ended;
  }

  /**
   * `share`'s end has begun: it leaves the stage of every tab watching it, each tab told
   * so, and its sharer hears nobody watches it, unless a hand-over replaced it in the same
   * room (`replacedIn`), where the new share has its name. The pulls stay until the
   * cut-off closes them, which tells nobody again.
   */
  private leaveStages(share: ShareRecord, replacedIn: string | undefined) {
    const pulls = this.watches("WHERE share_id = ? AND watching_at IS NOT NULL AND left_at IS NULL", share.id);
    if (pulls.length === 0) return;
    const watched = this.watcherIds(share.id, share.member).length > 0;
    this.sql.exec("UPDATE watch SET left_at = ? WHERE share_id = ? AND watching_at IS NOT NULL", Date.now(), share.id);
    for (const watch of pulls) this.listener.unwatched(watch.tab, watch.share);
    if (watched && replacedIn !== share.room) this.listener.watchers(share.room, toLiveShare(share), []);
  }

  /** The room of the live share that replaced the share `id` by a hand-over, or null when none did. */
  private replacementRoom(id: string): string | null {
    const by = this.handOvers.replacing(id);
    return by === undefined ? null : (this.records("WHERE id = ? AND live_at IS NOT NULL", by)[0]?.room ?? null);
  }

  /**
   * Force-closes a share's own tracks and drops its record once the close returns, or at
   * once when a sweep has shown them `gone`. False if the close failed, in which case the
   * record stays, so nothing is lost track of, and the close is tried again later.
   */
  private async closeTracks(share: ShareRecord, { subject, gone = false }: { subject?: Subject; gone?: boolean } = {}) {
    const mediaId = this.connectionById(share.connection)?.media_id;
    try {
      // A screen share's video and audio close together, in one call.
      if (typeof mediaId === "string" && !gone) await this.media.close(mediaId, tracksOf(share));
    } catch {
      log.warn("share.close-failed", { ...shareFields(share), ...(subject ? { subject: subject.member } : {}) });
      this.retries.failed({ kind: "share", id: share.id }, subject);
      return false;
    }
    log.info("share.ended", { ...shareFields(share), wasLive: share.live, gone });
    this.sql.exec("DELETE FROM share WHERE id = ?", share.id);
    // A hand-over it was part of is over: done when it is the old share, failed when it is the new.
    this.handOvers.forget(share.id);
    this.retries.confirmed(share.id);
    return true;
  }

  /**
   * Force-closes a watch's pull and drops its record once the close returns, or at once
   * when a sweep has shown it `gone`. If the share was on the watcher's stage, tells the
   * watcher's tab, and the sharer if who watches has changed; except while a hand-over is
   * `moving` the watch to the new share, which tells them itself, or once the share has
   * left the stage as its end began, when they were told already. A failed close keeps
   * the record, the share stays on the watcher's stage unless it has left it, and the
   * close is tried again later. True once the pull is closed by this call.
   */
  private async closeWatch(
    watch: WatchRecord,
    { subject, gone = false, moving = false }: { subject?: Subject; gone?: boolean; moving?: boolean } = {},
  ): Promise<boolean> {
    // Already closed by another way out while this one waited its turn.
    if (this.closingWatches.has(watch.id) || this.watches("WHERE id = ?", watch.id).length === 0) return false;
    const mediaId = this.connectionById(watch.connection)?.media_id;
    this.closingWatches.add(watch.id);
    try {
      const pulled = pulledTracksOf(watch).flatMap((track) => (track.mid === null ? [] : [{ name: track.name, mid: track.mid }]));
      if (typeof mediaId === "string" && pulled.length > 0 && !gone) await this.media.close(mediaId, pulled);
    } catch {
      log.warn("watch.close-failed", { ...watchFields(watch), ...(subject ? { subject: subject.member } : {}) });
      this.retries.failed({ kind: "watch", id: watch.id }, subject);
      return false;
    } finally {
      this.closingWatches.delete(watch.id);
    }
    log.info("watch.ended", { ...watchFields(watch), wasWatching: watch.watching, gone, moving });
    this.retries.confirmed(watch.id);
    const drop = () => {
      this.sql.exec("DELETE FROM watch WHERE id = ?", watch.id);
      // A replaced connection goes once its last pull is closed.
      if (this.connectionById(watch.connection)?.role === "replaced") this.forgetIfEmpty(watch.connection);
    };
    if (!watch.watching) {
      drop();
      return true;
    }
    const told = moving || watch.left;
    if (told) drop();
    else this.changeWatchers(watch, drop);
    this.listener.ended(watch.id, watch.tab);
    if (!told) this.listener.unwatched(watch.tab, watch.share);
    return true;
  }

  /**
   * The sweep: asks the media server which tracks each media connection of `tabIds` really
   * has, or of every tab without it, as after a restart. A track no record accounts for is
   * force-closed. A record whose track is gone is dropped, and what it was ends as if
   * closed: a live share ends for its watchers too. A record left half-made by a call that
   * never returned (a restart in the middle of it) is dropped, its track closed if the
   * media server made one. Records whose call is still under way are left alone. A
   * connection the media server cannot be asked about now is left as it is. Returns the
   * shares that ended.
   */
  async sweep(connectionIds?: readonly string[]): Promise<Ended[]> {
    const rows = this.sql
      .exec<ConnectionRow>("SELECT id, tab_id, purpose, role, media_id FROM media_connection")
      .toArray()
      .filter((row) => connectionIds === undefined || connectionIds.includes(row.id));
    const ended: Ended[] = [];
    for (const row of rows) {
      if (typeof row.media_id === "string") ended.push(...(await this.sweepConnection(row.tab_id, row.id, row.media_id)));
      else this.forgetIfEmpty(row.id);
    }
    return ended;
  }

  private async sweepConnection(tabId: string, connectionId: string, mediaId: string): Promise<Ended[]> {
    // What the records held before the question: a record made while it was being
    // answered cannot be judged by the answer.
    const before = new Set([
      ...this.records("WHERE connection_id = ?", connectionId).map((share) => share.id),
      ...this.watches("WHERE connection_id = ?", connectionId).map((watch) => watch.id),
    ]);
    let open: Track[];
    try {
      open = await this.media.tracks(mediaId);
    } catch {
      log.warn("sweep.skipped", { tab: tabId, connection: mediaId });
      return [];
    }
    const shares = this.records("WHERE connection_id = ?", connectionId);
    const watches = this.watches("WHERE connection_id = ?", connectionId);
    // A watch carried onto a replacement, or on the stage for a replacement under way to pull, is under way too.
    const replacing = new Set(
      watches
        .filter((watch) => this.carried(watch) || (isUnpulled(watch) && this.replacementUnderWay(watch.tab) !== undefined))
        .map((watch) => watch.id),
    );
    const busy = (id: string) =>
      this.inFlight.has(id) || replacing.has(id) || this.closingShares.has(id) || this.closingWatches.has(id);
    const openTrack = (name: string) => open.find((track) => track.name === name);

    // Every track a record whose call is done, or still under way, accounts for.
    const accounted = new Set<string>();
    const account = (tracks: { name: string }[]) => tracks.forEach((track) => accounted.add(track.name));
    for (const share of shares) if (share.live || busy(share.id) || !before.has(share.id)) account(tracksOf(share));
    for (const watch of watches) if (watch.watching || busy(watch.id) || !before.has(watch.id)) account(pulledTracksOf(watch));

    const ended: Ended[] = [];
    for (const share of shares) {
      if (!before.has(share.id) || busy(share.id)) continue;
      const track = openTrack(share.video.name);
      const audio = share.audio && openTrack(share.audio.name);
      if (share.live) {
        if (!track) log.warn("sweep.gone", { ...shareFields(share), connection: mediaId });
        // Its picture is gone: the share has ended, and its watchers' pulls carry nothing.
        if (!track) ended.push(...(await this.end([share], null, undefined, { gone: true })));
      } else {
        const found = { ...share, video: track ?? share.video, audio: audio ?? share.audio };
        await this.closeTracks(found, { gone: !track && !audio });
      }
    }
    for (const watch of watches) {
      if (!before.has(watch.id) || busy(watch.id)) continue;
      const track = openTrack(watch.video.name);
      const audio = watch.audio && openTrack(watch.audio.name);
      if (watch.watching) {
        if (!track) log.warn("sweep.gone", { ...watchFields(watch), connection: mediaId });
        if (!track) await this.closeWatch(watch, { gone: true });
      } else {
        const found = { ...watch, video: track ?? watch.video, audio: audio ?? watch.audio };
        // The media server made the pull, and its offer never reached the tab.
        if (track || audio) this.block(watch, "the instance stopped while the media server made the pull");
        await this.closeWatch(found, { gone: !track && !audio });
      }
    }
    for (const track of open) if (!accounted.has(track.name)) await this.closeStray(tabId, mediaId, track);
    return ended;
  }

  /** Force-closes `track` on `tabId`'s connection `mediaId`, which no record accounts for; tried again if the close fails. */
  private async closeStray(tabId: string, mediaId: string, track: Track) {
    log.warn("sweep.closed", { tab: tabId, connection: mediaId, track });
    try {
      await this.media.close(mediaId, [track]);
    } catch {
      this.retries.failed({ kind: "track", id: `${mediaId} ${track.mid}`, connection: mediaId, track });
    }
  }

  /**
   * Tries again every failed close whose time has come. The room heard of a share as its
   * end began, so a try that ends one tells it nothing. `present` says whether a tab is still open or in its grace period: the media
   * connection of one that is not is forgotten once nothing is left on it.
   */
  async retry(present: (tabId: string) => boolean): Promise<void> {
    // The connections, and their tabs, a try closed something on.
    const touched = new Map<string, string>();
    for (const due of this.retries.due()) {
      if (due.kind === "track") {
        try {
          await this.media.close(due.connection!, [due.track!]);
          this.retries.confirmed(due.id);
        } catch {
          this.retries.failed(due);
        }
        continue;
      }
      if (due.kind === "share") {
        const share = this.records("WHERE id = ?", due.id)[0];
        if (!share) {
          this.retries.confirmed(due.id);
          continue;
        }
        touched.set(share.connection, share.tab);
        if (share.live) await this.end([share], null, due.subject);
        else await this.closeTracks(share, { subject: due.subject });
        continue;
      }
      const watch = this.watches("WHERE id = ?", due.id)[0];
      if (!watch) {
        this.retries.confirmed(due.id);
        continue;
      }
      touched.set(watch.connection, watch.tab);
      await this.closeWatch(watch, { subject: due.subject });
    }
    for (const [connection, tab] of touched) if (!present(tab)) this.forgetIfEmpty(connection);
  }

  /** When the next failed close is due to be tried again, or null when none is. */
  nextRetry(): number | null {
    return this.retries.next();
  }

  /**
   * The tab `tabId` says its sending connection falters while its socket is fine. The
   * shares it sends stay live for 30 seconds from the first time it says so, while the
   * browser tries to recover, and end then (`faltered`) unless it recovers first.
   */
  faltering(tabId: string) {
    this.falterings.falters(tabId);
  }

  /** The tab `tabId`'s sending connection has recovered, or the tab is gone: its shares no longer wait to end. */
  recovered(tabId: string) {
    this.falterings.recovered(tabId);
  }

  /**
   * Ends the shares of every tab whose sending connection has faltered for 30 seconds, by
   * the same forced close as an ordinary stop. What the tab watches is left as it is, on
   * its own connection. A sending connection left carrying nothing is forgotten, since it
   * failed: the tab makes a new one the next time it shares. Returns the tabs whose sending
   * connection was forgotten.
   */
  async faltered(): Promise<string[]> {
    const dropped: string[] = [];
    for (const tab of this.falterings.takeDue()) {
      log.warn("falter.due", { tab });
      await this.end(this.records("WHERE tab_id = ? AND live_at IS NOT NULL", tab), null);
      const sending = this.connectionOf(tab, "sending");
      if (sending && this.forgetIfEmpty(sending.id)) dropped.push(tab);
    }
    return dropped;
  }

  /** When the shares of a tab whose sending connection falters are next due to end, or null when none are. */
  nextFaltered(): number | null {
    return this.falterings.next();
  }

  /**
   * The members whose cut-off has had a close failing for a minute or more, each once:
   * the owner hears that it could not be confirmed.
   */
  unconfirmed(): { member: string; name: string }[] {
    return this.retries.unconfirmed();
  }

  /** Makes `change` to a watch of `watch`'s share, and tells the sharer if who watches it changed. */
  private changeWatchers(watch: WatchRecord, change: () => void) {
    const before = this.watcherIds(watch.shareId, watch.share.member);
    change();
    const after = this.watcherIds(watch.shareId, watch.share.member);
    if (before.join() !== after.join()) this.listener.watchers(watch.room, watch.share, after);
  }

  /** The members watching the share `shareId`, each once, in the order they began. Never its sharer. */
  private watcherIds(shareId: string, sharer: string): string[] {
    return this.sql
      .exec<{ member_id: string }>(
        `SELECT member_id FROM watch WHERE share_id = ? AND watching_at IS NOT NULL AND left_at IS NULL AND member_id != ?
         GROUP BY member_id ORDER BY MIN(watching_at), MIN(rowid)`,
        shareId,
        sharer,
      )
      .toArray()
      .map((row) => row.member_id);
  }

  /**
   * A start (on the `sending` connection) or watch (on the `receiving` one) of `tabId`'s
   * did not go live, or a replacement of its receiving connection carried nothing: that
   * connection is forgotten if it now carries nothing and is not being made. A connection
   * that never carried anything never gets a browser on it, and the media server drops it
   * within seconds, so the tab makes a new one on its next try.
   * It is forgotten at once, so nothing goes into it meanwhile; then any track the media
   * server made on it although it reported the call failed is force-closed, as the sweep at
   * a cut-off would. A receiving connection being replaced is kept: the replacement
   * carries its watches over, and so is one a watch of the tab's is still on its way to:
   * a hand-over's pull under way from a connection since replaced, which goes to this one
   * when it returns. True when it was forgotten.
   */
  letGo(tabId: string, purpose: MediaPurpose): boolean {
    const connection = this.connectionOf(tabId, purpose);
    if (!connection) return false;
    if (purpose === "receiving" && (this.replacementOf(tabId) || this.watches("WHERE tab_id = ? AND left_at IS NULL", tabId).length > 0)) {
      return false;
    }
    if (!this.forgetIfEmpty(connection.id)) return false;
    if (typeof connection.media_id === "string") void this.closeLeftOver(tabId, connection.media_id);
    return true;
  }

  /** Force-closes every track on `mediaId`, `tabId`'s connection just let go of as carrying nothing. */
  private async closeLeftOver(tabId: string, mediaId: string) {
    let open: Track[];
    try {
      open = await this.media.tracks(mediaId);
    } catch {
      log.warn("sweep.skipped", { tab: tabId, connection: mediaId });
      return;
    }
    for (const track of open) await this.closeStray(tabId, mediaId, track);
  }

  /**
   * Forgets the connection `id` if it carries no share or watch and is not being made.
   * True when it was forgotten.
   */
  private forgetIfEmpty(id: string): boolean {
    if (this.inFlight.has(id)) return false;
    const forgotten =
      this.sql.exec(
        `DELETE FROM media_connection WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM share WHERE connection_id = ?)
         AND NOT EXISTS (SELECT 1 FROM watch WHERE connection_id = ?)`,
        id,
        id,
        id,
      ).rowsWritten > 0;
    if (forgotten) {
      this.dropId(UNANSWERED_KEY, id);
      this.unblock(id);
    }
    return forgotten;
  }

  /** Takes `id` off the list of connection ids kept at `key`. */
  private dropId(key: string, id: string) {
    const ids = this.kv.get<string[]>(key) ?? [];
    if (!ids.includes(id)) return;
    const left = ids.filter((other) => other !== id);
    if (left.length > 0) this.kv.put(key, left);
    else this.kv.delete(key);
  }

  /**
   * A pull onto `watch`'s connection returned with an offer the tab will never get, and is
   * about to be closed. The media server takes no other pull into that connection until
   * the browser answers the offer, and closing the pull does not change that
   * (`docs/media-server.md`). If it is the tab's current receiving connection, it is
   * blocked, for `why`, until it is replaced or forgotten: the tab's next watch has it
   * replaced first (`watch`). A replacement, or a replaced connection, takes no pull
   * again, so it is never blocked. Written before the close, as every record is.
   */
  private block(watch: WatchRecord, why: string) {
    const connection = this.connectionById(watch.connection);
    if (connection?.role !== "current" || connection.purpose !== "receiving") return;
    const blocked = this.kv.get<string[]>(BLOCKED_KEY) ?? [];
    if (!blocked.includes(connection.id)) this.kv.put(BLOCKED_KEY, [...blocked, connection.id]);
    log.warn("media.blocked", { ...watchFields(watch), connection: connection.media_id, why });
  }

  /** The connection `id` is blocked no more: replaced, or forgotten. */
  private unblock(id: string) {
    this.dropId(BLOCKED_KEY, id);
  }

  /** Whether the connection `id` is blocked (`block`). */
  private isBlocked(id: string): boolean {
    return (this.kv.get<string[]>(BLOCKED_KEY) ?? []).includes(id);
  }

  /** `tabId`'s current connection for `purpose`. */
  private connectionOf(tabId: string, purpose: MediaPurpose): ConnectionRow | undefined {
    return this.connectionsOf(tabId).find((row) => row.purpose === purpose && row.role === "current");
  }

  /** `tabId`'s replacement receiving connection, while one is being made or carried over to. */
  private replacementOf(tabId: string): ConnectionRow | undefined {
    return this.connectionsOf(tabId).find((row) => row.role === "replacement");
  }

  /** The receiving connection a new pull of `tabId`'s goes to: the replacement while one is under way. */
  private receivingTarget(tabId: string): ConnectionRow | undefined {
    return this.replacementUnderWay(tabId) ?? this.connectionOf(tabId, "receiving");
  }

  /**
   * `tabId`'s replacement receiving connection once the media server has made it: from
   * then until it is done, every offer the tab gets is one of its steps.
   */
  private replacementUnderWay(tabId: string): ConnectionRow | undefined {
    const replacement = this.replacementOf(tabId);
    return replacement && typeof replacement.media_id === "string" ? replacement : undefined;
  }

  /**
   * Whether `watch` is pulled onto a replacement receiving connection, its pull returned,
   * and waits for the replacement to be done to go on the stage in place of the old
   * connection's. Read from its records, so it outlasts an eviction between two steps.
   */
  private carried(watch: WatchRecord): boolean {
    return (
      !watch.watching &&
      watch.video.mid !== null &&
      !this.inFlight.has(watch.id) &&
      !this.closingWatches.has(watch.id) &&
      this.connectionById(watch.connection)?.role === "replacement"
    );
  }

  /** The replacement receiving connection of `tabId`'s whose steps are under way, by id, or null when there is none. */
  replacing(tabId: string): string | null {
    return this.replacementUnderWay(tabId)?.id ?? null;
  }

  /** Every connection `tabId` has on record, in any role. */
  private connectionsOf(tabId: string): ConnectionRow[] {
    return this.sql
      .exec<ConnectionRow>("SELECT id, tab_id, purpose, role, media_id FROM media_connection WHERE tab_id = ?", tabId)
      .toArray();
  }

  private connectionById(id: string): ConnectionRow | undefined {
    return this.sql
      .exec<ConnectionRow>("SELECT id, tab_id, purpose, role, media_id FROM media_connection WHERE id = ?", id)
      .toArray()[0];
  }

  /**
   * The share records `where` picks, leaving out any share whose end has begun, and any a
   * hand-over has replaced with a live share: the member's current shares. Either may
   * still have a record while its close is under way or tried again, but it is no longer
   * listed, watched, or counted against the member's one share of its kind.
   */
  private current(where: string, ...bindings: SqlStorageValue[]): ShareRecord[] {
    const replaced = this.handOvers.replaced();
    return this.records(where, ...bindings).filter((share) => !share.ending && !replaced.has(share.id));
  }

  private records(where: string, ...bindings: SqlStorageValue[]): ShareRecord[] {
    const handOvers = this.handOvers.all();
    return this.sql
      .exec<ShareRow>(
        `SELECT id, member_id, room_address, tab_id, connection_id, kind, video_track, video_mid, audio_track, audio_mid, live_at,
           qualities, max_bitrate, ending_at
         FROM share ${where}`,
        ...bindings,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        member: row.member_id,
        room: row.room_address,
        tab: row.tab_id,
        connection: row.connection_id,
        kind: row.kind as ShareKind,
        video: { name: row.video_track, mid: row.video_mid },
        audio: row.audio_track !== null && row.audio_mid !== null ? { name: row.audio_track, mid: row.audio_mid } : null,
        live: row.live_at !== null,
        qualities: row.qualities === 2 ? 2 : 1,
        maxBitrate: row.max_bitrate,
        replaces: handOvers[row.id] ?? null,
        ending: row.ending_at !== null,
      }));
  }

  private watches(where: string, ...bindings: SqlStorageValue[]): WatchRecord[] {
    return this.sql
      .exec<WatchRow>(
        `SELECT id, tab_id, connection_id, member_id, device_id, room_address, share_id, sharer_id, kind, video_track, video_mid, audio_track,
           audio_mid,
           watching_at, left_at, quality
         FROM watch ${where}`,
        ...bindings,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        tab: row.tab_id,
        connection: row.connection_id,
        member: row.member_id,
        device: row.device_id,
        room: row.room_address,
        shareId: row.share_id,
        share: { member: row.sharer_id, kind: row.kind as ShareKind },
        video: { name: row.video_track, mid: row.video_mid },
        audio: row.audio_track !== null ? { name: row.audio_track, mid: row.audio_mid } : null,
        watching: row.watching_at !== null,
        left: row.left_at !== null,
        quality: row.quality as QualityChoice,
      }));
  }
}

function toLiveShare(share: ShareRecord): LiveShare {
  return { member: share.member, kind: share.kind };
}

/**
 * A share as the room lists it: a screen share says whether it carries screen audio, and
 * a share at two qualities says so.
 */
function toListedShare(share: ShareRecord): ListedShare {
  return {
    ...toLiveShare(share),
    ...(share.kind === "screen" ? { audio: share.audio !== null } : {}),
    ...(share.qualities === 2 ? { twoQualities: true as const } : {}),
  };
}

/** A share's own tracks, which are recorded, published and closed together. */
function tracksOf(share: ShareRecord): Track[] {
  return share.audio ? [share.video, share.audio] : [share.video];
}

/** A watch's pulled tracks: the share's video and, when it has any, its screen audio. */
function pulledTracksOf(watch: WatchRecord): PulledTrack[] {
  return watch.audio ? [watch.video, watch.audio] : [watch.video];
}

/** Whether `watch` is on the stage with nothing pulled: a hand-over's, during a replacement, for the replacement to pull (see `move`). */
function isUnpulled(watch: WatchRecord): boolean {
  return watch.watching && watch.video.mid === null;
}

/** A new watch of the share `watched` by the watcher's tab `watcher.tab`, at `quality`, before anything is pulled. */
function newWatch(
  watcher: Pick<WatchRecord, "tab" | "connection" | "member" | "device" | "room">,
  watched: ShareRecord,
  quality: QualityChoice,
): WatchRecord {
  return {
    id: crypto.randomUUID(),
    tab: watcher.tab,
    connection: watcher.connection,
    member: watcher.member,
    device: watcher.device,
    room: watcher.room,
    shareId: watched.id,
    share: toLiveShare(watched),
    video: { name: watched.video.name, mid: null },
    audio: watched.audio ? { name: watched.audio.name, mid: null } : null,
    watching: false,
    left: false,
    quality,
  };
}

/** What a line about a share says of it. */
function shareFields(share: ShareRecord) {
  return { member: share.member, tab: share.tab, room: share.room, kind: share.kind, share: share.id, tracks: tracksOf(share) };
}

/** What a line about a watch says of it. */
function watchFields(watch: WatchRecord) {
  return {
    member: watch.member,
    device: watch.device,
    tab: watch.tab,
    room: watch.room,
    share: watch.share,
    of: watch.shareId,
    watch: watch.id,
    tracks: pulledTracksOf(watch),
  };
}
