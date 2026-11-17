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

import type { IceServer } from "../shared/socket/media.ts";
import type { ListedShare, LiveShare, ShareKind } from "../shared/socket/shares.ts";
import { sameShare } from "../shared/socket/watching.ts";
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
}

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
}

export class Shares {
  /** Shares whose forced close is under way, so a second stop does not close them again. */
  private readonly ending = new Set<string>();
  /** Watches whose forced close is under way, likewise. */
  private readonly closing = new Set<string>();

  constructor(
    private readonly sql: SqlStorage,
    private readonly media: MediaLayer,
    private readonly listener: WatchingListener,
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

  /** Who watches each of `member`'s live shares in the room at `address`. A share nobody watches is left out. */
  watchers(address: string, member: string): { share: LiveShare; members: string[] }[] {
    return this.records("WHERE room_address = ? AND member_id = ? AND live_at IS NOT NULL ORDER BY live_at, rowid", address, member)
      .map((share) => ({ share: toLiveShare(share), members: this.watcherIds(share.id, share.member) }))
      .filter((entry) => entry.members.length > 0);
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
    try {
      const mediaId = await this.media.connect();
      this.sql.exec("UPDATE media_connection SET media_id = ? WHERE tab_id = ?", mediaId, tab.id);
      return await this.media.relayCredential(RELAY_CREDENTIAL_TTL_SECONDS);
    } catch {
      // A media connection with no tracks carries nothing, so it needs no close.
      this.sql.exec("DELETE FROM media_connection WHERE tab_id = ?", tab.id);
      return null;
    }
  }

  /**
   * Starts a share of `kind` by `member` from `tab`, which the browser's `offer` sends:
   * its video on the transceiver `mids.video` and, for a screen share with screen audio,
   * its audio on `mids.audio`. The two are one unit: recorded, published and closed
   * together. Refused unless the tab's media connection is made and the member has no
   * other share of that kind anywhere in the instance, live or starting. A webcam share
   * is video only. `stillOpen` says whether the tab is still there once the media server
   * has answered.
   */
  async start(
    tab: Tab,
    member: string,
    kind: ShareKind,
    offer: string,
    mids: { video: string; audio?: string },
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
    };
    this.sql.exec(
      `INSERT INTO share (id, member_id, device_id, room_address, tab_id, kind, video_track, video_mid, audio_track, audio_mid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      Date.now(),
    );

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

    let pulled: Pulled;
    try {
      // A screen share's video and audio are pulled together, as one unit.
      const names = [record.video.name, ...(record.audio ? [record.audio.name] : [])];
      pulled = await this.media.pull(viewerMediaId, sharerMediaId, names);
    } catch {
      // The media server gave no mid to close by, so the record goes. A pulled track it
      // made all the same is for the sweep (ticket 21), which closes what no record names.
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
      await this.closeWatch(record, { tell: false });
      this.forgetConnectionIfEmpty(tab.id);
      return { watching: false };
    }
    this.changeWatchers(record, () =>
      this.sql.exec("UPDATE watch SET watching_at = ? WHERE id = ?", Date.now(), record.id),
    );
    return { watching: true, offer: pulled.offer, video: record.video.mid, audio: record.audio?.mid ?? null };
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
   * forgets the media connections of the covered tabs and of `tabs` once nothing is left
   * on them. Returns the shares that ended. A share whose close failed stays live with
   * its record, and so does every pull of it but the covered ones; ticket 21 retries.
   *
   * The caller has already changed storage, so no request of the covered tabs is granted
   * any more, and the covered tabs are no longer open: a share or pull of theirs still
   * waiting for the media server closes itself when it returns.
   */
  async cutOff(covered: Covered, tabs: readonly string[] = []): Promise<Ended[]> {
    const where = whereCovered(covered);
    const shares = this.records(`WHERE ${where.where} AND live_at IS NOT NULL`, ...where.bindings);
    const touched = new Set([
      ...tabs,
      ...("tab" in covered ? [covered.tab] : []),
      ...shares.map((share) => share.tab),
      ...this.watches(`WHERE ${where.where}`, ...where.bindings).map((watch) => watch.tab),
    ]);
    const ended = await this.end(shares, where);
    for (const tab of touched) this.forgetConnectionIfEmpty(tab);
    return ended;
  }

  /** The cut-off's closes, in order, for `shares` and the pulls `covered` takes in. See `cutOff`. */
  private async end(shares: readonly ShareRecord[], covered: Where | null): Promise<Ended[]> {
    const ours = shares.filter((share) => !this.ending.has(share.id));
    // From this instant none of them can gain a viewer, though their closes come one by one.
    for (const share of ours) this.ending.add(share.id);

    const closed: ShareRecord[] = [];
    for (const share of ours) {
      try {
        if (await this.closeTracks(share)) closed.push(share);
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
      for (const watch of pulls) await this.closeWatch(watch);
    }

    if (covered) {
      for (const watch of this.watches(`WHERE (${covered.where}) AND watching_at IS NOT NULL`, ...covered.bindings)) {
        await this.closeWatch(watch);
      }
    }
    return closed.map((share) => ({ room: share.room, share: toLiveShare(share) }));
  }

  /**
   * Force-closes a share's own tracks and drops its record once the close returns. False
   * if the close failed, in which case the record stays, so nothing is lost track of.
   */
  private async closeTracks(share: ShareRecord): Promise<boolean> {
    const mediaId = this.connectionRow(share.tab)?.media_id;
    try {
      // A screen share's video and audio close together, in one call.
      if (typeof mediaId === "string") await this.media.close(mediaId, tracksOf(share));
    } catch {
      return false;
    }
    this.sql.exec("DELETE FROM share WHERE id = ?", share.id);
    return true;
  }

  /**
   * Force-closes a watch's pull and drops its record once the close returns. Unless told
   * not to, tells the viewer's tab, and the sharer if who watches has changed. A failed
   * close keeps the record, and the share stays on the viewer's stage; ticket 21 retries.
   */
  private async closeWatch(watch: WatchRecord, { tell = true } = {}) {
    // Already closed by another way out while this one waited its turn.
    if (this.closing.has(watch.id) || this.watches("WHERE id = ?", watch.id).length === 0) return;
    const mediaId = this.connectionRow(watch.tab)?.media_id;
    this.closing.add(watch.id);
    try {
      const pulled = [watch.video, watch.audio].flatMap((track) =>
        track?.mid != null ? [{ name: track.name, mid: track.mid }] : [],
      );
      if (typeof mediaId === "string" && pulled.length > 0) await this.media.close(mediaId, pulled);
    } catch {
      return;
    } finally {
      this.closing.delete(watch.id);
    }
    if (!tell) {
      this.sql.exec("DELETE FROM watch WHERE id = ?", watch.id);
      return;
    }
    this.changeWatchers(watch, () => this.sql.exec("DELETE FROM watch WHERE id = ?", watch.id));
    this.listener.unwatched(watch.tab, watch.share);
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
        `SELECT id, member_id, room_address, tab_id, kind, video_track, video_mid, audio_track, audio_mid, live_at
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
      }));
  }

  private watches(where: string, ...bindings: SqlStorageValue[]): WatchRecord[] {
    return this.sql
      .exec<WatchRow>(
        `SELECT id, tab_id, member_id, room_address, share_id, sharer_id, kind, video_track, video_mid, audio_track, audio_mid
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
      }));
  }
}

function toLiveShare(share: ShareRecord): LiveShare {
  return { member: share.member, kind: share.kind };
}

/** A share as the room lists it: a screen share says whether it carries screen audio. */
function toListedShare(share: ShareRecord): ListedShare {
  return share.kind === "screen" ? { ...toLiveShare(share), audio: share.audio !== null } : toLiveShare(share);
}

/** A share's own tracks, which are recorded, published and closed together. */
function tracksOf(share: ShareRecord): Track[] {
  return share.audio ? [share.video, share.audio] : [share.video];
}
