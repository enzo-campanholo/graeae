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
// to come are kept in storage, so they outlast a restart, and the instance's alarm wakes
// it for each.
//
// The sweep asks the media server which tracks a media connection really has, closes
// any its records do not account for, and drops any record whose track is gone. It runs
// at each cut-off, over the connections the cut-off touched, and after a restart, over
// every connection on record. There is no timed sweep.

import type { IceServer } from "../shared/socket/media.ts";
import type { EncodingPlan } from "../shared/encoding.ts";
import type { ListedShare, LiveShare, ShareKind } from "../shared/socket/shares.ts";
import { sameShare, type ChosenQuality, type QualityChoice } from "../shared/socket/watching.ts";
import type { MediaLayer, Pulled, Track } from "./media/index.ts";
import type { Tab } from "./signaling.ts";

/** A relay credential lasts 12 hours. */
export const RELAY_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

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
  /** How many qualities it goes out at: 2 for a viewer to choose between, or 1. */
  qualities: 1 | 2;
  /** The most one viewer can receive of it, in bits per second: the usage count's figure for a gap. */
  maxBitrate: number;
}

/** A track pulled for a watch: the share's track name, on the mid the media server gave it, null until then. */
interface PulledTrack {
  name: string;
  mid: string | null;
}

/** A watch as the instance recorded it. */
interface WatchRecord {
  id: string;
  /** The viewer's tab, whose media connection the share is pulled to. */
  tab: string;
  /** The viewer. */
  member: string;
  room: string;
  /** The share's id, and the share as the room knows it. */
  shareId: string;
  share: LiveShare;
  /** The pulled video track. */
  video: PulledTrack;
  /** The pulled screen audio, when the share has any. */
  audio: PulledTrack | null;
  /** Whether the pull returned and the share went on the viewer's stage. */
  watching: boolean;
  /** The quality the viewer chose; always "auto" for a share with one quality. */
  quality: QualityChoice;
}

/**
 * The member a cut-off was for, when the owner should hear that it could not be
 * confirmed: a removal, or a forgotten device. `at` is when it began.
 */
export interface Subject {
  member: string;
  name: string;
  at: number;
}

/** A forced close that failed, and when it is tried next. */
interface Retry {
  /** The share or watch record whose close failed, or a track no record names. */
  kind: "share" | "watch" | "track";
  /** The record's id; for a track, its media connection and mid. */
  id: string;
  /** For a track: where it is and what it is. */
  connection?: string;
  track?: Track;
  /** How many tries have failed so far. */
  tries: number;
  next: number;
  subject?: Subject;
}

/** Retries are kept in the instance's key-value storage, all under one key: there are few, and briefly. */
const RETRIES_KEY = "shares:retries";

/** The wait before the next try once `tries` tries have failed: 1 s, then doubling, at most 30 s. */
export function retryDelay(tries: number): number {
  return Math.min(1000 * 2 ** (tries - 1), 30_000);
}

/** How long closes may go on failing before the owner hears a cut-off could not be confirmed. */
export const UNCONFIRMED_AFTER_MS = 60_000;

/** What a cut-off covers: the shares it ends and the watching it closes. */
export type Covered =
  /** A member's in the room at `room`, or everywhere without it. */
  | { member: string; room?: string }
  /** One device's. */
  | { device: string }
  /** One tab's. */
  | { tab: string };

/** A share a cut-off ended, and the room it was live in. */
export interface Ended {
  room: string;
  share: LiveShare;
}

/** A condition on the `share` and `watch` tables, which both name a member, device, room and tab. */
interface Where {
  where: string;
  bindings: SqlStorageValue[];
}

function whereCovered(covered: Covered): Where {
  if ("tab" in covered) return { where: "tab_id = ?", bindings: [covered.tab] };
  if ("device" in covered) return { where: "device_id = ?", bindings: [covered.device] };
  if (covered.room === undefined) return { where: "member_id = ?", bindings: [covered.member] };
  return { where: "member_id = ? AND room_address = ?", bindings: [covered.member, covered.room] };
}

/** What the instance hears of watching as it changes, to tell the tabs concerned. */
export interface WatchingListener {
  /** The tab `tab` no longer watches `share`: its pull is closed. */
  unwatched(tab: string, share: LiveShare): void;
  /** The members watching `share`, live in the room `room`, are now `members`. */
  watchers(room: string, share: LiveShare, members: string[]): void;
}

/** What became of a request to watch a share. */
export type Watched =
  /** It is on the tab's stage: `offer`, `video` and `audio` go to the viewer's tab. */
  | { watching: true; offer: string; video: string; audio: string | null }
  /** It was refused, or the media server failed it. */
  | { watching: false };

/** What became of a request to start a share. */
export type Started =
  /** It is live: `answer` goes to the sharer's tab. */
  | { live: true; share: ListedShare; answer: string }
  /** It was refused, or the media server failed it. */
  | { live: false };

interface WatchRow extends Record<string, SqlStorageValue> {
  id: string;
  watching_at: number | null;
  tab_id: string;
  member_id: string;
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
}

export class Shares {
  /** Shares whose forced close is under way, so a second stop does not close them again. */
  private readonly ending = new Set<string>();
  /** Watches whose forced close is under way, likewise. */
  private readonly closing = new Set<string>();
  /**
   * Records whose first call to the media server (connect, publish, pull) is under way in
   * this run of the instance, by tab id for a connection and record id otherwise. A sweep
   * leaves them alone. After a restart there are none: whatever was under way never returns.
   */
  private readonly inFlight = new Set<string>();

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
  ) {}

  /** The live shares in the room at `address`, oldest first. */
  live(address: string): ListedShare[] {
    return this.records("WHERE room_address = ? AND live_at IS NOT NULL ORDER BY live_at, rowid", address).map(
      toListedShare,
    );
  }

  /** Every live share of `member`, wherever it is live, oldest first. */
  sharedBy(member: string): { room: string; kind: ShareKind }[] {
    return this.records("WHERE member_id = ? AND live_at IS NOT NULL ORDER BY live_at, rowid", member).map(
      (share) => ({ room: share.room, kind: share.kind }),
    );
  }

  /** The shares the tab `tab` watches, in the order it began watching them. */
  stage(tab: string): LiveShare[] {
    return this.watches("WHERE tab_id = ? AND watching_at IS NOT NULL ORDER BY watching_at, rowid", tab).map(
      (watch) => watch.share,
    );
  }

  /** The shares on the tab `tab`'s stage it watches at a quality other than "Auto", in the order it began watching them. */
  qualities(tab: string): ChosenQuality[] {
    return this.watches(
      "WHERE tab_id = ? AND watching_at IS NOT NULL AND quality != 'auto' ORDER BY watching_at, rowid",
      tab,
    ).map((watch) => ({ share: watch.share, quality: watch.quality as ChosenQuality["quality"] }));
  }

  /** Who watches each of `member`'s live shares in the room at `address`. A share nobody watches is left out. */
  watchers(address: string, member: string): { share: LiveShare; members: string[] }[] {
    return this.records("WHERE room_address = ? AND member_id = ? AND live_at IS NOT NULL ORDER BY live_at, rowid", address, member)
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

  /**
   * Makes `tab`'s one media connection and mints the relay credential for it. "already"
   * when the tab has one or is making it; null when the media server fails.
   */
  async connect(tab: Tab): Promise<IceServer[] | "already" | null> {
    if (this.connectionRow(tab.id)) return "already";
    this.sql.exec(
      "INSERT INTO media_connection (tab_id, device_id, room_address, media_id, created_at) VALUES (?, ?, ?, NULL, ?)",
      tab.id,
      tab.device,
      tab.room,
      Date.now(),
    );
    this.inFlight.add(tab.id);
    try {
      const mediaId = await this.media.connect();
      this.sql.exec("UPDATE media_connection SET media_id = ? WHERE tab_id = ?", mediaId, tab.id);
      return await this.media.relayCredential(RELAY_CREDENTIAL_TTL_SECONDS);
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
   * viewer can choose between and its maximum bitrate for the usage count. `stillOpen`
   * says whether the tab is still there once the media server has answered.
   */
  async start(
    tab: Tab,
    member: string,
    kind: ShareKind,
    offer: string,
    mids: { video: string; audio?: string },
    plan: EncodingPlan,
    stillOpen: () => boolean,
  ): Promise<Started> {
    const mediaId = this.connectionRow(tab.id)?.media_id;
    if (typeof mediaId !== "string") return { live: false };
    if (mids.audio !== undefined && (kind === "webcam" || mids.audio === mids.video)) return { live: false };
    if (this.records("WHERE member_id = ? AND kind = ?", member, kind).length > 0) return { live: false };

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

    this.inFlight.add(share.id);
    try {
      let answer: string;
      try {
        answer = await this.media.publish(mediaId, offer, tracksOf(share));
      } catch {
        // The track may exist even so: close it before forgetting it.
        await this.closeTracks(share);
        return { live: false };
      }
      if (!stillOpen()) {
        // The tab left while the media server was answering, and its leaving could not
        // close a track that did not exist yet.
        await this.closeTracks(share);
        this.forgetConnectionIfEmpty(tab.id);
        return { live: false };
      }
      this.sql.exec("UPDATE share SET live_at = ? WHERE id = ?", Date.now(), share.id);
      return { live: true, share: toListedShare(share), answer };
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
    const viewerMediaId = this.connectionRow(tab.id)?.media_id;
    if (typeof viewerMediaId !== "string") return { watching: false };
    const watched = this.records(
      "WHERE member_id = ? AND kind = ? AND room_address = ? AND live_at IS NOT NULL",
      share.member,
      share.kind,
      tab.room,
    )[0];
    if (!watched || this.ending.has(watched.id) || watched.tab === tab.id) return { watching: false };
    const sharerMediaId = this.connectionRow(watched.tab)?.media_id;
    if (typeof sharerMediaId !== "string") return { watching: false };
    if (this.watches("WHERE tab_id = ? AND share_id = ?", tab.id, watched.id).length > 0) return null;

    const record: WatchRecord = {
      id: crypto.randomUUID(),
      tab: tab.id,
      member: tab.member,
      room: tab.room,
      shareId: watched.id,
      share: toLiveShare(watched),
      video: { name: watched.video.name, mid: null },
      audio: watched.audio ? { name: watched.audio.name, mid: null } : null,
      watching: false,
      quality: "auto",
    };
    this.sql.exec(
      `INSERT INTO watch (id, tab_id, member_id, device_id, room_address, share_id, sharer_id, kind, video_track, audio_track, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      tab.id,
      tab.member,
      tab.device,
      tab.room,
      watched.id,
      watched.member,
      watched.kind,
      record.video.name,
      record.audio?.name ?? null,
      Date.now(),
    );

    this.inFlight.add(record.id);
    try {
      let pulled: Pulled;
      try {
        // A screen share's video and audio are pulled together, as one unit. A picture
        // sent at two qualities is watched at "Auto" to begin with.
        pulled = await this.media.pull(
          viewerMediaId,
          sharerMediaId,
          pulledTracksOf(record).map((track) => track.name),
          ...(watched.qualities === 2 ? [{ name: record.video.name, quality: record.quality }] : []),
        );
      } catch {
        // The media server gave no mid to close by, so the record goes. A pulled track it
        // made all the same is for the sweep, which closes what no record names.
        this.sql.exec("DELETE FROM watch WHERE id = ?", record.id);
        return { watching: false };
      }
      const midOf = (name: string) => pulled.tracks.find((track) => track.name === name)?.mid ?? null;
      record.video.mid = midOf(record.video.name) ?? pulled.tracks[0]?.mid ?? "";
      if (record.audio) record.audio.mid = midOf(record.audio.name);
      this.sql.exec(
        "UPDATE watch SET video_mid = ?, audio_mid = ? WHERE id = ?",
        record.video.mid,
        record.audio?.mid ?? null,
        record.id,
      );

      // A share being ended gains no viewer, even if its own close then fails.
      const shareGone = this.ending.has(watched.id) || this.records("WHERE id = ?", watched.id).length === 0;
      if (!stillOpen() || shareGone) {
        // The tab left, or the share ended, while the media server was answering, and
        // neither could close a pull that had no mid yet.
        await this.closeWatch(record);
        this.forgetConnectionIfEmpty(tab.id);
        return { watching: false };
      }
      this.changeWatchers(record, () =>
        this.sql.exec("UPDATE watch SET watching_at = ? WHERE id = ?", Date.now(), record.id),
      );
      return { watching: true, offer: pulled.offer, video: record.video.mid, audio: record.audio?.mid ?? null };
    } finally {
      this.inFlight.delete(record.id);
    }
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
    if (!watch?.video.mid || this.closing.has(watch.id)) return watch?.quality ?? null;
    const watched = this.records("WHERE id = ?", watch.shareId)[0];
    if (!watched || watched.qualities !== 2 || this.ending.has(watched.id) || quality === watch.quality) return watch.quality;
    const viewerMediaId = this.connectionRow(tab.id)?.media_id;
    const sharerMediaId = this.connectionRow(watched.tab)?.media_id;
    if (typeof viewerMediaId !== "string" || typeof sharerMediaId !== "string") return watch.quality;
    try {
      await this.media.setQuality(viewerMediaId, sharerMediaId, { name: watch.video.name, mid: watch.video.mid }, quality);
    } catch {
      return watch.quality;
    }
    // The pull may have been closed while the media server was answering.
    if (this.watches("WHERE id = ?", watch.id).length === 0) return null;
    this.sql.exec("UPDATE watch SET quality = ? WHERE id = ?", quality, watch.id);
    return quality;
  }

  /** `tab`'s watch of `share`, once it is on the tab's stage. */
  private watching(tab: Tab, share: LiveShare): WatchRecord | undefined {
    return this.watches("WHERE tab_id = ? AND watching_at IS NOT NULL", tab.id).find((watch) => sameShare(watch.share, share));
  }

  /**
   * Stops `tab` watching `share` by a forced close of its pull. The tab and the sharer
   * hear of it through the listener once the close has returned. Nothing happens when the
   * tab does not watch it, is still starting to, or is already stopping.
   */
  async unwatch(tab: Tab, share: LiveShare): Promise<void> {
    const record = this.watches("WHERE tab_id = ? AND watching_at IS NOT NULL", tab.id).find((watch) =>
      sameShare(watch.share, share),
    );
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
   * Ends `tab`'s live share of `kind` through the cut-off's own forced close. Returns the
   * share once it has ended, or null when the tab has no such share, it is already
   * ending, or the close failed, in which case its record stays.
   */
  async stop(tab: Tab, kind: ShareKind): Promise<LiveShare | null> {
    const share = this.records("WHERE tab_id = ? AND kind = ? AND live_at IS NOT NULL", tab.id, kind)[0];
    if (!share) return null;
    const [ended] = await this.end([share], null);
    return ended?.share ?? null;
  }

  /**
   * The cut-off, which every clean leave goes through too: ends the live shares `covered`
   * takes in and closes the watching it takes in. In order, it force-closes the shares'
   * own tracks, then every other pull of those shares, then the covered pulls. Then it
   * sweeps the media connections of the covered tabs and of `tabs`, and forgets each once
   * nothing is left on it: an empty connection a cut-off browser keeps open carries
   * nothing and cannot gain a track, so it is left alone. Returns the shares that ended.
   * A share whose close failed stays live with its record, and so does every pull of it
   * but the covered ones, until a try succeeds; `subject` is who the owner hears about if
   * none has after a minute.
   *
   * The caller has already changed storage, so no request of the covered tabs is granted
   * any more, and the covered tabs are no longer open: a share or pull of theirs still
   * waiting for the media server closes itself when it returns.
   */
  async cutOff(covered: Covered, tabs: readonly string[] = [], subject?: Subject): Promise<Ended[]> {
    const where = whereCovered(covered);
    const shares = this.records(`WHERE ${where.where} AND live_at IS NOT NULL`, ...where.bindings);
    const touched = new Set([
      ...tabs,
      ...("tab" in covered ? [covered.tab] : []),
      ...shares.map((share) => share.tab),
      ...this.watches(`WHERE ${where.where}`, ...where.bindings).map((watch) => watch.tab),
    ]);
    const ended = await this.end(shares, where, subject);
    ended.push(...(await this.sweep([...touched])));
    for (const tab of touched) this.forgetConnectionIfEmpty(tab);
    return ended;
  }

  /** The cut-off's closes, in order, for `shares` and the pulls `covered` takes in. See `cutOff`. */
  private async end(
    shares: readonly ShareRecord[],
    covered: Where | null,
    subject?: Subject,
    { gone = false } = {},
  ): Promise<Ended[]> {
    const ours = shares.filter((share) => !this.ending.has(share.id));
    // From this instant none of them can gain a viewer, though their closes come one by one.
    for (const share of ours) this.ending.add(share.id);

    const closed: ShareRecord[] = [];
    for (const share of ours) {
      try {
        if (await this.closeTracks(share, { subject, gone })) closed.push(share);
      } finally {
        this.ending.delete(share.id);
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
    return closed.map((share) => ({ room: share.room, share: toLiveShare(share) }));
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
      this.failed({ kind: "share", id: share.id }, subject);
      return false;
    }
    this.sql.exec("DELETE FROM share WHERE id = ?", share.id);
    this.confirmed(share.id);
    return true;
  }

  /**
   * Force-closes a watch's pull and drops its record once the close returns, or at once
   * when a sweep has shown it `gone`. If the share was on the viewer's stage, tells the
   * viewer's tab, and the sharer if who watches has changed. A failed close keeps the
   * record, the share stays on the viewer's stage, and the close is tried again later.
   */
  private async closeWatch(watch: WatchRecord, { subject, gone = false }: { subject?: Subject; gone?: boolean } = {}) {
    // Already closed by another way out while this one waited its turn.
    if (this.closing.has(watch.id) || this.watches("WHERE id = ?", watch.id).length === 0) return;
    const mediaId = this.connectionRow(watch.tab)?.media_id;
    this.closing.add(watch.id);
    try {
      const pulled = pulledTracksOf(watch).flatMap((track) => (track.mid === null ? [] : [{ name: track.name, mid: track.mid }]));
      if (typeof mediaId === "string" && pulled.length > 0 && !gone) await this.media.close(mediaId, pulled);
    } catch {
      this.failed({ kind: "watch", id: watch.id }, subject);
      return;
    } finally {
      this.closing.delete(watch.id);
    }
    this.confirmed(watch.id);
    if (!watch.watching) {
      this.sql.exec("DELETE FROM watch WHERE id = ?", watch.id);
      return;
    }
    this.changeWatchers(watch, () => this.sql.exec("DELETE FROM watch WHERE id = ?", watch.id));
    this.listener.unwatched(watch.tab, watch.share);
  }

  /**
   * The sweep: asks the media server which tracks each media connection of `tabs` really
   * has, or of every tab without it, as after a restart. A track no record accounts for is
   * force-closed. A record whose track is gone is dropped, and what it was ends as if
   * closed: a live share ends for its viewers too. A record left half-made by a call that
   * never returned (a restart in the middle of it) is dropped, its track closed if the
   * media server made one. Records whose call is still under way are left alone. A
   * connection the media server cannot be asked about now is left as it is. Returns the
   * shares that ended.
   */
  async sweep(tabs?: readonly string[]): Promise<Ended[]> {
    const rows = this.sql
      .exec<{ tab_id: string; media_id: string | null }>("SELECT tab_id, media_id FROM media_connection")
      .toArray()
      .filter((row) => tabs === undefined || tabs.includes(row.tab_id));
    const ended: Ended[] = [];
    for (const row of rows) {
      if (typeof row.media_id === "string") ended.push(...(await this.sweepConnection(row.tab_id, row.media_id)));
      else if (!this.inFlight.has(row.tab_id)) this.forgetConnectionIfEmpty(row.tab_id);
    }
    return ended;
  }

  private async sweepConnection(tab: string, mediaId: string): Promise<Ended[]> {
    // What the records held before the question: a record made while it was being
    // answered cannot be judged by the answer.
    const before = new Set([
      ...this.records("WHERE tab_id = ?", tab).map((share) => share.id),
      ...this.watches("WHERE tab_id = ?", tab).map((watch) => watch.id),
    ]);
    let open: Track[];
    try {
      open = await this.media.tracks(mediaId);
    } catch {
      return [];
    }
    const busy = (id: string) => this.inFlight.has(id) || this.ending.has(id) || this.closing.has(id);
    const shares = this.records("WHERE tab_id = ?", tab);
    const watches = this.watches("WHERE tab_id = ?", tab);
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
        // Its picture is gone: the share has ended, and its viewers' pulls carry nothing.
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
        if (!track) await this.closeWatch(watch, { gone: true });
      } else {
        const found = { ...watch, video: track ?? watch.video, audio: audio ?? watch.audio };
        await this.closeWatch(found, { gone: !track && !audio });
      }
    }
    for (const track of open) {
      if (accounted.has(track.name)) continue;
      try {
        await this.media.close(mediaId, [track]);
      } catch {
        this.failed({ kind: "track", id: `${mediaId} ${track.mid}`, connection: mediaId, track });
      }
    }
    return ended;
  }

  /**
   * Tries again every failed close whose time has come. Returns the shares that ended.
   * `present` says whether a tab is still open or in its grace period: the media
   * connection of one that is not is forgotten once nothing is left on it.
   */
  async retry(present: (tab: string) => boolean): Promise<Ended[]> {
    const now = Date.now();
    const ended: Ended[] = [];
    const touched = new Set<string>();
    for (const due of this.retries().filter((retry) => retry.next <= now)) {
      if (due.kind === "track") {
        try {
          await this.media.close(due.connection!, [due.track!]);
          this.confirmed(due.id);
        } catch {
          this.failed(due);
        }
        continue;
      }
      if (due.kind === "share") {
        const share = this.records("WHERE id = ?", due.id)[0];
        if (!share) {
          this.confirmed(due.id);
          continue;
        }
        touched.add(share.tab);
        if (share.live) ended.push(...(await this.end([share], null, due.subject)));
        else await this.closeTracks(share, { subject: due.subject });
        continue;
      }
      const watch = this.watches("WHERE id = ?", due.id)[0];
      if (!watch) {
        this.confirmed(due.id);
        continue;
      }
      touched.add(watch.tab);
      await this.closeWatch(watch, { subject: due.subject });
    }
    for (const tab of touched) if (!present(tab)) this.forgetConnectionIfEmpty(tab);
    return ended;
  }

  /** When the next failed close is due to be tried again, or null when none is. */
  nextRetry(): number | null {
    const moments = this.retries().map((retry) => retry.next);
    return moments.length > 0 ? Math.min(...moments) : null;
  }

  /**
   * The members whose cut-off has had a close failing for a minute or more, each once:
   * the owner hears that it could not be confirmed.
   */
  unconfirmed(): { member: string; name: string }[] {
    const now = Date.now();
    const members = new Map<string, string>();
    for (const { subject } of this.retries()) {
      if (subject && now - subject.at >= UNCONFIRMED_AFTER_MS) members.set(subject.member, subject.name);
    }
    return [...members].map(([member, name]) => ({ member, name }));
  }

  /** A close failed: tries it again after the next wait of the backoff. */
  private failed(what: Pick<Retry, "kind" | "id" | "connection" | "track">, subject?: Subject) {
    const retries = this.retries();
    const before = retries.find((retry) => retry.id === what.id);
    const tries = (before?.tries ?? 0) + 1;
    const retry: Retry = {
      kind: what.kind,
      id: what.id,
      ...(what.connection ? { connection: what.connection, track: what.track } : {}),
      tries,
      next: Date.now() + retryDelay(tries),
      ...((before?.subject ?? subject) ? { subject: before?.subject ?? subject } : {}),
    };
    this.saveRetries([...retries.filter((other) => other.id !== what.id), retry]);
  }

  /** A close succeeded, or a sweep showed its track gone: it is tried no more. */
  private confirmed(id: string) {
    const retries = this.retries();
    if (retries.some((retry) => retry.id === id)) this.saveRetries(retries.filter((retry) => retry.id !== id));
  }

  private retries(): Retry[] {
    return this.kv.get<Retry[]>(RETRIES_KEY) ?? [];
  }

  private saveRetries(retries: Retry[]) {
    if (retries.length > 0) this.kv.put(RETRIES_KEY, retries);
    else this.kv.delete(RETRIES_KEY);
    this.schedule();
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
        `SELECT member_id FROM watch WHERE share_id = ? AND watching_at IS NOT NULL AND member_id != ?
         GROUP BY member_id ORDER BY MIN(watching_at), MIN(rowid)`,
        shareId,
        sharer,
      )
      .toArray()
      .map((row) => row.member_id);
  }

  private forgetConnectionIfEmpty(tabId: string) {
    this.sql.exec(
      `DELETE FROM media_connection WHERE tab_id = ?
       AND NOT EXISTS (SELECT 1 FROM share WHERE tab_id = ?)
       AND NOT EXISTS (SELECT 1 FROM watch WHERE tab_id = ?)`,
      tabId,
      tabId,
      tabId,
    );
  }

  private connectionRow(tabId: string) {
    return this.sql
      .exec<{ media_id: string | null }>("SELECT media_id FROM media_connection WHERE tab_id = ?", tabId)
      .toArray()[0];
  }

  private records(where: string, ...bindings: SqlStorageValue[]): ShareRecord[] {
    return this.sql
      .exec<ShareRow>(
        `SELECT id, member_id, room_address, tab_id, kind, video_track, video_mid, audio_track, audio_mid, live_at,
           qualities, max_bitrate
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
      }));
  }

  private watches(where: string, ...bindings: SqlStorageValue[]): WatchRecord[] {
    return this.sql
      .exec<WatchRow>(
        `SELECT id, tab_id, member_id, room_address, share_id, sharer_id, kind, video_track, video_mid, audio_track, audio_mid,
           watching_at, quality
         FROM watch ${where}`,
        ...bindings,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        tab: row.tab_id,
        member: row.member_id,
        room: row.room_address,
        shareId: row.share_id,
        share: { member: row.sharer_id, kind: row.kind as ShareKind },
        video: { name: row.video_track, mid: row.video_mid },
        audio: row.audio_track !== null ? { name: row.audio_track, mid: row.audio_mid } : null,
        watching: row.watching_at !== null,
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
