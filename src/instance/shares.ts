// Shares, the watching of them, and the media connections both go over: the instance's
// records of what it has asked of the media server, and the calls that keep the two in
// step (ADR 0003).
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

import type { IceServer } from "../shared/socket/media.ts";
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
  /** The watcher's tab, whose media connection the share is pulled to. */
  tab: string;
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

/** The tabs whose media connection was made after their socket was lost, so they never heard of it. */
const UNANSWERED_KEY = "shares:unanswered";

/** What a cut-off covers: the shares it ends and the watching it closes. */
export type Covered =
  /** A member's in the room at `room`, or everywhere without it. */
  | { member: string; room?: string }
  /** One device's. */
  | { device: string }
  /** One tab's. */
  | { tabId: string }
  /** Every watch, and no share: the usage budget stop. */
  | { everyWatch: true };

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
  /** The quality the watcher now watches at, when it is not the one they chose: the new share has one quality. */
  quality: QualityChoice | null;
}

/** A condition on the `share` and `watch` tables, which both name a member, device, room and tab. */
interface Where {
  where: string;
  bindings: SqlStorageValue[];
}

function whereCovered(covered: Covered): Where {
  if ("everyWatch" in covered) return { where: "1 = 1", bindings: [] };
  if ("tabId" in covered) return { where: "tab_id = ?", bindings: [covered.tabId] };
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
}

/** What became of a request to watch a share. */
export type Watched =
  /** It is on the tab's stage: `offer`, `video` and `audio` go to the watcher's tab. */
  | { watching: true; offer: string; video: string; audio: string | null }
  /** It was refused, or the media server failed it. */
  | { watching: false };

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
   * Records whose first call to the media server (connect, publish, pull) is under way in
   * this run of the instance, by tab id for a connection and record id otherwise. A sweep
   * leaves them alone. After a restart there are none: whatever was under way never returns.
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
        `SELECT tab_id, device_id, room_address,
           COALESCE((SELECT member_id FROM share WHERE share.tab_id = media_connection.tab_id LIMIT 1),
                    (SELECT member_id FROM watch WHERE watch.tab_id = media_connection.tab_id LIMIT 1)) AS member_id
         FROM media_connection`,
      )
      .toArray()
      .map((row) => ({ id: row.tab_id, device: row.device_id, room: row.room_address, member: row.member_id }));
  }

  /** Whether the tab `tabId` has a media connection on record, made or being made. */
  hasConnection(tabId: string): boolean {
    return this.connectionRow(tabId) !== undefined;
  }

  /**
   * The answer that handed `tabId` its media connection never reached it: its socket was
   * lost on the way. When it asks again, it gets a new connection (`connect`).
   */
  unanswered(tabId: string) {
    const tabs = this.kv.get<string[]>(UNANSWERED_KEY) ?? [];
    if (!tabs.includes(tabId)) this.kv.put(UNANSWERED_KEY, [...tabs, tabId]);
  }

  /**
   * Makes `tab`'s one media connection and, at the same time, has `mint` mint the relay
   * credential for it. A tab that never heard the answer that handed it its connection
   * (`unanswered`) gets a new one in its place, if the old one carries nothing yet: a
   * connection with no tracks needs no close. "already" when the tab is making one or has
   * one; null when the media server or the relay fails.
   */
  async connect(tab: Tab, mint: () => Promise<IceServer[]>): Promise<IceServer[] | "already" | null> {
    if (this.connectionRow(tab.id)) {
      const unanswered = this.kv.get<string[]>(UNANSWERED_KEY) ?? [];
      if (this.inFlight.has(tab.id) || !unanswered.includes(tab.id)) return "already";
      this.forgetConnectionIfEmpty(tab.id);
      if (this.connectionRow(tab.id)) return "already";
    }
    this.sql.exec(
      "INSERT INTO media_connection (tab_id, device_id, room_address, media_id, created_at) VALUES (?, ?, ?, NULL, ?)",
      tab.id,
      tab.device,
      tab.room,
      Date.now(),
    );
    this.inFlight.add(tab.id);
    // Both at once, so the tab's first share or watch waits on one call to the media
    // server, not two. A credential minted for a connection that then fails goes unused
    // until it expires.
    const minted = mint();
    minted.catch(() => undefined);
    try {
      const mediaId = await this.media.connect();
      this.sql.exec("UPDATE media_connection SET media_id = ? WHERE tab_id = ?", mediaId, tab.id);
      return await minted;
    } catch {
      // A media connection with no tracks carries nothing, so it needs no close.
      this.sql.exec("DELETE FROM media_connection WHERE tab_id = ?", tab.id);
      return null;
    } finally {
      this.inFlight.delete(tab.id);
    }
  }

  /**
   * Starts a share of `kind` by `member` from `tab`, which the browser's `offer` sends:
   * its video on the transceiver `mids.video` and, for a screen share with screen audio,
   * its audio on `mids.audio`. The two are one unit: recorded, published and closed
   * together. Refused unless the tab's media connection is made and the member has no
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
    const mediaId = this.connectionRow(tab.id)?.media_id;
    if (typeof mediaId !== "string") return refused("no media connection");
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
      `INSERT INTO share (id, member_id, device_id, room_address, tab_id, kind, video_track, video_mid, audio_track, audio_mid,
         qualities, max_bitrate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      share.id,
      member,
      tab.device,
      tab.room,
      tab.id,
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
        this.forgetConnectionIfEmpty(tab.id);
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
   * Watches `share` from `tab`, pulling its tracks to the tab's media connection. Refused
   * unless the tab's media connection is made, the share is live in the tab's room and not
   * ending, and the tab is not the one sending it. Null when the tab already watches it,
   * or is starting to. `stillOpen` says whether the tab is still there once the media
   * server has answered.
   */
  async watch(tab: Tab, share: LiveShare, stillOpen: () => boolean): Promise<Watched | null> {
    const refused = (why: string): Watched => {
      log.warn("watch.refused", { ...tagsOf(tab), share, why });
      return { watching: false };
    };
    const watcherMediaId = this.connectionRow(tab.id)?.media_id;
    if (typeof watcherMediaId !== "string") return refused("no media connection");
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
    const sharerMediaId = this.connectionRow(watched.tab)?.media_id;
    if (typeof sharerMediaId !== "string") return refused("the sharer has no media connection");
    if (this.watches("WHERE tab_id = ? AND share_id = ?", tab.id, watched.id).length > 0) return null;

    const record = newWatch({ tab: tab.id, member: tab.member, device: tab.device, room: tab.room }, watched, "auto");
    this.inFlight.add(record.id);
    try {
      const pulled = await this.pull(record, watcherMediaId, sharerMediaId, watched);
      if (!pulled) return refused("the media server failed");

      if (!stillOpen() || this.gone(watched)) {
        // The tab left, or the share ended, while the media server was answering, and
        // neither could close a pull that had no mid yet.
        await this.closeWatch(record);
        this.forgetConnectionIfEmpty(tab.id);
        return refused(stillOpen() ? "the share ended meanwhile" : "the tab left meanwhile, or the budget ran out");
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

  /** Whether `share` is being ended, or has ended: it gains no watcher, even if its own close then fails. */
  private gone(share: ShareRecord): boolean {
    return this.closingShares.has(share.id) || !this.records("WHERE id = ? AND ending_at IS NULL", share.id)[0];
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
    this.sql.exec(
      `INSERT INTO watch (id, tab_id, member_id, device_id, room_address, share_id, sharer_id, kind, video_track, audio_track,
         quality, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      record.tab,
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
    );
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
    if (!from || from.ending || this.closingShares.has(from.id)) return [];

    this.closingShares.add(from.id);
    let closed: boolean;
    try {
      closed = await this.closeTracks(from);
    } finally {
      this.closingShares.delete(from.id);
    }
    if (!closed) return [];

    const sameRoom = from.room === to.room;
    const pulls = this.watches("WHERE share_id = ? AND watching_at IS NOT NULL", from.id);
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
   * `to` that replaced it: its old pull is closed, then the new share is pulled to the same
   * tab, at the quality the watcher chose if `to` has two. The watcher's stage keeps the
   * share, and the tab hears `moved`. If the old pull's close fails, the watcher stays on
   * the old share until a try succeeds, and is not moved. If the new pull fails, or the tab
   * leaves or the new share ends meanwhile, the share leaves the stage.
   */
  private async move(watch: WatchRecord, to: ShareRecord, connected: (tabId: string) => boolean) {
    if (!(await this.closeWatch(watch, { moving: true }))) return;
    const record = newWatch(watch, to, to.qualities === 2 ? watch.quality : "auto");
    const watcherMediaId = this.connectionRow(watch.tab)?.media_id;
    const sharerMediaId = this.connectionRow(to.tab)?.media_id;
    if (typeof watcherMediaId !== "string" || typeof sharerMediaId !== "string") {
      this.listener.unwatched(watch.tab, watch.share);
      return;
    }
    this.inFlight.add(record.id);
    try {
      const pulled = await this.pull(record, watcherMediaId, sharerMediaId, to);
      if (!pulled) {
        this.listener.unwatched(watch.tab, watch.share);
        return;
      }
      if (!connected(watch.tab) || this.gone(to)) {
        await this.closeWatch(record);
        this.forgetConnectionIfEmpty(watch.tab);
        this.listener.unwatched(watch.tab, watch.share);
        return;
      }
      this.sql.exec("UPDATE watch SET watching_at = ? WHERE id = ?", Date.now(), record.id);
      this.listener.began(record.id, watch.tab, to.maxBitrate);
      log.info("handover.moved", { tab: watch.tab, member: watch.member, watch: record.id, share: to.id, from: watch.id });
      this.listener.moved(watch.tab, record.share, {
        offer: pulled.offer,
        video: record.video.mid!,
        audio: record.audio?.mid ?? null,
        quality: record.quality === watch.quality ? null : record.quality,
      });
    } finally {
      this.inFlight.delete(record.id);
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
    const watcherMediaId = this.connectionRow(tab.id)?.media_id;
    const sharerMediaId = this.connectionRow(watched.tab)?.media_id;
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

  /** Hands the media server `tab`'s answer to the offer of its last pull. False if that failed. */
  async renegotiate(tab: Tab, answer: string): Promise<boolean> {
    const mediaId = this.connectionRow(tab.id)?.media_id;
    if (typeof mediaId !== "string") return false;
    try {
      await this.media.renegotiate(mediaId, answer);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Hands the media server `tab`'s offer restarting its media connection's ICE, and
   * returns the media server's answer. Null when the tab has no media connection, or the
   * media server failed it. Every share and watch on the connection stays as it is.
   */
  async restart(tab: Tab, offer: string, mid: string): Promise<string | null> {
    const mediaId = this.connectionRow(tab.id)?.media_id;
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
    // The usage budget stop ends no share, and its watchers' tabs carry on with their media
    // connections, ready to watch again once the budget allows it.
    const stop = "everyWatch" in covered;
    const shares = stop ? [] : this.records(`WHERE ${where.where} AND live_at IS NOT NULL`, ...where.bindings);
    const touched = new Set([
      ...tabIds,
      ...("tabId" in covered ? [covered.tabId] : []),
      ...shares.map((share) => share.tab),
      ...this.watches(`WHERE ${where.where}`, ...where.bindings).map((watch) => watch.tab),
    ]);
    const ended = await this.end(shares, where, subject);
    ended.push(...(await this.sweep([...touched])));
    if (!stop) for (const tab of touched) this.forgetConnectionIfEmpty(tab);
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
      for (const watch of this.watches(`WHERE (${covered.where}) AND watching_at IS NOT NULL`, ...covered.bindings)) {
        await this.closeWatch(watch, { subject });
      }
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
    const mediaId = this.connectionRow(share.tab)?.media_id;
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
    const mediaId = this.connectionRow(watch.tab)?.media_id;
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
    const drop = () => this.sql.exec("DELETE FROM watch WHERE id = ?", watch.id);
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
  async sweep(tabIds?: readonly string[]): Promise<Ended[]> {
    const rows = this.sql
      .exec<{ tab_id: string; media_id: string | null }>("SELECT tab_id, media_id FROM media_connection")
      .toArray()
      .filter((row) => tabIds === undefined || tabIds.includes(row.tab_id));
    const ended: Ended[] = [];
    for (const row of rows) {
      if (typeof row.media_id === "string") ended.push(...(await this.sweepConnection(row.tab_id, row.media_id)));
      else if (!this.inFlight.has(row.tab_id)) this.forgetConnectionIfEmpty(row.tab_id);
    }
    return ended;
  }

  private async sweepConnection(tabId: string, mediaId: string): Promise<Ended[]> {
    // What the records held before the question: a record made while it was being
    // answered cannot be judged by the answer.
    const before = new Set([
      ...this.records("WHERE tab_id = ?", tabId).map((share) => share.id),
      ...this.watches("WHERE tab_id = ?", tabId).map((watch) => watch.id),
    ]);
    let open: Track[];
    try {
      open = await this.media.tracks(mediaId);
    } catch {
      log.warn("sweep.skipped", { tab: tabId, connection: mediaId });
      return [];
    }
    const busy = (id: string) => this.inFlight.has(id) || this.closingShares.has(id) || this.closingWatches.has(id);
    const shares = this.records("WHERE tab_id = ?", tabId);
    const watches = this.watches("WHERE tab_id = ?", tabId);
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
    const touched = new Set<string>();
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
        touched.add(share.tab);
        if (share.live) await this.end([share], null, due.subject);
        else await this.closeTracks(share, { subject: due.subject });
        continue;
      }
      const watch = this.watches("WHERE id = ?", due.id)[0];
      if (!watch) {
        this.retries.confirmed(due.id);
        continue;
      }
      touched.add(watch.tab);
      await this.closeWatch(watch, { subject: due.subject });
    }
    for (const tab of touched) if (!present(tab)) this.forgetConnectionIfEmpty(tab);
  }

  /** When the next failed close is due to be tried again, or null when none is. */
  nextRetry(): number | null {
    return this.retries.next();
  }

  /**
   * The tab `tabId` says its media connection falters while its socket is fine. The shares
   * it sends stay live for 30 seconds from the first time it says so, while the browser
   * tries to recover, and end then (`faltered`) unless it recovers first.
   */
  faltering(tabId: string) {
    this.falterings.falters(tabId);
  }

  /** The tab `tabId`'s media connection has recovered, or the tab is gone: its shares no longer wait to end. */
  recovered(tabId: string) {
    this.falterings.recovered(tabId);
  }

  /**
   * Ends the shares of every tab whose media connection has faltered for 30 seconds, by
   * the same forced close as an ordinary stop. What the tab watches is left as it is. A
   * connection left carrying nothing is forgotten, since it failed: the tab makes a new
   * one the next time it shares or watches. Returns the tabs whose connection was
   * forgotten.
   */
  async faltered(): Promise<string[]> {
    const dropped: string[] = [];
    for (const tab of this.falterings.takeDue()) {
      log.warn("falter.due", { tab });
      await this.end(this.records("WHERE tab_id = ? AND live_at IS NOT NULL", tab), null);
      if (this.forgetConnectionIfEmpty(tab)) dropped.push(tab);
    }
    return dropped;
  }

  /** When the shares of a tab whose media connection falters are next due to end, or null when none are. */
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
   * A start or watch of `tabId`'s did not go live: its media connection is forgotten if it
   * now carries no share or watch and is not being made. A connection that never carried
   * anything never gets a browser on it, and the media server drops it within seconds, so
   * the tab makes a new one on its next try. It is forgotten at once, so no start or watch
   * goes into it meanwhile; then any track the media server made on it although it
   * reported the call failed is force-closed, as the sweep at a cut-off would. True when
   * it was forgotten.
   */
  letGo(tabId: string): boolean {
    const mediaId = this.connectionRow(tabId)?.media_id;
    if (this.inFlight.has(tabId) || !this.forgetConnectionIfEmpty(tabId)) return false;
    if (typeof mediaId === "string") void this.closeLeftOver(tabId, mediaId);
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

  /** Forgets `tabId`'s media connection if it carries no share or watch. True when it was forgotten. */
  private forgetConnectionIfEmpty(tabId: string): boolean {
    const forgotten =
      this.sql.exec(
        `DELETE FROM media_connection WHERE tab_id = ?
         AND NOT EXISTS (SELECT 1 FROM share WHERE tab_id = ?)
         AND NOT EXISTS (SELECT 1 FROM watch WHERE tab_id = ?)`,
        tabId,
        tabId,
        tabId,
      ).rowsWritten > 0;
    const unanswered = this.kv.get<string[]>(UNANSWERED_KEY) ?? [];
    if (forgotten && unanswered.includes(tabId)) {
      const left = unanswered.filter((tab) => tab !== tabId);
      if (left.length > 0) this.kv.put(UNANSWERED_KEY, left);
      else this.kv.delete(UNANSWERED_KEY);
    }
    return forgotten;
  }

  private connectionRow(tabId: string) {
    return this.sql
      .exec<{ media_id: string | null }>("SELECT media_id FROM media_connection WHERE tab_id = ?", tabId)
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
        `SELECT id, member_id, room_address, tab_id, kind, video_track, video_mid, audio_track, audio_mid, live_at,
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
        `SELECT id, tab_id, member_id, device_id, room_address, share_id, sharer_id, kind, video_track, video_mid, audio_track,
           audio_mid,
           watching_at, left_at, quality
         FROM watch ${where}`,
        ...bindings,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        tab: row.tab_id,
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

/** A new watch of the share `watched` by the watcher's tab `watcher.tab`, at `quality`, before anything is pulled. */
function newWatch(
  watcher: Pick<WatchRecord, "tab" | "member" | "device" | "room">,
  watched: ShareRecord,
  quality: QualityChoice,
): WatchRecord {
  return {
    id: crypto.randomUUID(),
    tab: watcher.tab,
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
