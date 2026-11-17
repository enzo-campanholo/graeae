// Shares and the media connections they are sent over: the instance's records of what it
// has asked of the media server, and the calls that keep the two in step (ADR 0003).
//
// Every call follows one order. The record is written first, with every track name
// picked here, then the media layer is called. A close is always a forced close, and a
// record is dropped only once its close has returned. So a call that fails, or a crash in
// the middle of one, leaves a record with nothing behind it, never a track with no record.
//
// The checks on who may ask (a remembered device, access, presence) are the instance's;
// this module holds the records and the rules about shares themselves.

import type { IceServer } from "../shared/socket/media.ts";
import type { LiveShare, ShareKind } from "../shared/socket/shares.ts";
import type { MediaLayer, Track } from "./media/index.ts";
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
}

/** What became of a request to start a share. */
export type Started =
  /** It is live: `answer` goes to the sharer's tab. */
  | { live: true; share: LiveShare; answer: string }
  /** It was refused, or the media server failed it. */
  | { live: false };

interface ShareRow extends Record<string, SqlStorageValue> {
  id: string;
  member_id: string;
  room_address: string;
  tab_id: string;
  kind: string;
  video_track: string;
  video_mid: string;
  live_at: number | null;
}

export class Shares {
  /** Shares whose forced close is under way, so a second stop does not close them again. */
  private readonly ending = new Set<string>();

  constructor(
    private readonly sql: SqlStorage,
    private readonly media: MediaLayer,
  ) {}

  /** The live shares in the room at `address`, oldest first. */
  live(address: string): LiveShare[] {
    return this.records("WHERE room_address = ? AND live_at IS NOT NULL ORDER BY live_at, rowid", address).map(
      toLiveShare,
    );
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
   * Starts a webcam share by `member` from `tab`, which the browser's `offer` sends on
   * the transceiver `mid`. Refused unless the tab's media connection is made and the
   * member has no other webcam share anywhere in the instance, live or starting.
   * `stillOpen` says whether the tab is still there once the media server has answered.
   */
  async startWebcam(
    tab: Tab,
    member: string,
    offer: string,
    mid: string,
    stillOpen: () => boolean,
  ): Promise<Started> {
    const mediaId = this.connectionRow(tab.id)?.media_id;
    if (typeof mediaId !== "string") return { live: false };
    if (this.records("WHERE member_id = ? AND kind = 'webcam'", member).length > 0) return { live: false };

    const share: ShareRecord = {
      id: crypto.randomUUID(),
      member,
      room: tab.room,
      tab: tab.id,
      kind: "webcam",
      video: { name: `webcam-${crypto.randomUUID()}`, mid },
    };
    this.sql.exec(
      `INSERT INTO share (id, member_id, device_id, room_address, tab_id, kind, video_track, video_mid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      share.id,
      member,
      tab.device,
      tab.room,
      tab.id,
      share.kind,
      share.video.name,
      share.video.mid,
      Date.now(),
    );

    let answer: string;
    try {
      answer = await this.media.publish(mediaId, offer, [share.video]);
    } catch {
      // The track may exist even so: close it before forgetting it.
      await this.close(share);
      return { live: false };
    }
    if (!stillOpen()) {
      // The tab left while the media server was answering, and its leaving could not
      // close a track that did not exist yet.
      await this.close(share);
      this.forgetConnectionIfEmpty(tab.id);
      return { live: false };
    }
    this.sql.exec("UPDATE share SET live_at = ? WHERE id = ?", Date.now(), share.id);
    return { live: true, share: toLiveShare(share), answer };
  }

  /**
   * Ends `tab`'s live share of `kind` by a forced close. Returns the share once it has
   * ended, or null when the tab has no such share, it is already ending, or the close
   * failed, in which case its record stays.
   */
  async stop(tab: Tab, kind: ShareKind): Promise<LiveShare | null> {
    const share = this.records("WHERE tab_id = ? AND kind = ? AND live_at IS NOT NULL", tab.id, kind)[0];
    if (!share || this.ending.has(share.id)) return null;
    return (await this.close(share)) ? toLiveShare(share) : null;
  }

  /**
   * `tab` has left cleanly: ends each of its live shares by a forced close, then forgets
   * its media connection once nothing is left on it. Returns the shares that ended.
   */
  async left(tab: Tab): Promise<LiveShare[]> {
    const ended: LiveShare[] = [];
    for (const share of this.records("WHERE tab_id = ? AND live_at IS NOT NULL", tab.id)) {
      if (this.ending.has(share.id)) continue;
      if (await this.close(share)) ended.push(toLiveShare(share));
    }
    this.forgetConnectionIfEmpty(tab.id);
    return ended;
  }

  /** Force-closes a share's tracks and drops its record once the close returns. False if the close failed. */
  private async close(share: ShareRecord): Promise<boolean> {
    const mediaId = this.connectionRow(share.tab)?.media_id;
    this.ending.add(share.id);
    try {
      if (typeof mediaId === "string") await this.media.close(mediaId, [share.video]);
    } catch {
      // The record stays, so nothing is lost track of. Ticket 21 retries the close.
      return false;
    } finally {
      this.ending.delete(share.id);
    }
    this.sql.exec("DELETE FROM share WHERE id = ?", share.id);
    return true;
  }

  private forgetConnectionIfEmpty(tabId: string) {
    this.sql.exec(
      "DELETE FROM media_connection WHERE tab_id = ? AND NOT EXISTS (SELECT 1 FROM share WHERE tab_id = ?)",
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
        `SELECT id, member_id, room_address, tab_id, kind, video_track, video_mid, live_at FROM share ${where}`,
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
      }));
  }
}

function toLiveShare(share: ShareRecord): LiveShare {
  return { member: share.member, kind: share.kind };
}
