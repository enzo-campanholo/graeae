// The people-and-rooms rules: members (the owner among them), the browsers remembered as
// their devices, the rooms they have access to, and the invites that let them in.

import { describeBrowser } from "./browser.ts";
import { log } from "./log.ts";

const DAY = 24 * 60 * 60 * 1000;

/** A device is forgotten once it goes this long without a visit. */
export const DEVICE_LIFE_MS = 400 * DAY;

/** An owner's invite can be used until this long after it was made. */
export const OWNER_INVITE_LIFE_MS = 7 * DAY;

/** A member's "Add a device" invite can be used until this long after it was made. */
export const DEVICE_INVITE_LIFE_MS = 10 * 60 * 1000;

/** The longest display name, in characters. */
export const DISPLAY_NAME_MAX = 40;

/** The cookie that remembers a device. `__Host-` keeps it to this one origin. */
const DEVICE_COOKIE = "__Host-device";

const FIRST_ROOM_NAME = "First room";
const OWNER_DISPLAY_NAME = "Owner";

export interface Member {
  id: string;
  name: string;
  owner: boolean;
}

/** The device a request came from, and the member it belongs to. */
export interface Visitor {
  deviceId: string;
  member: Member;
}

/** A device the instance has just forgotten, and the member it belonged to. */
export interface Forgotten {
  device: string;
  member: Member;
}

export interface Room {
  address: string;
  name: string;
}

/** An invite nobody has used or cancelled, and that has not expired. */
export interface PendingInvite {
  code: string;
  name: string;
  rooms: Room[];
  expiresAt: number;
}

/** A member's "Add a device" invite, pending until used or expired. */
export interface DeviceInvite {
  code: string;
  expiresAt: number;
}

/** What the invite page shows before the press: the display name the browser joins as. */
export interface OpenInvite {
  name: string;
}

export interface Device {
  id: string;
  browser: string;
  os: string;
  lastUsed: number;
}

export class People {
  constructor(private readonly sql: SqlStorage) {}

  /**
   * The remembered device a request comes from, or null. A device whose last visit is
   * longer ago than its life is forgotten here, the first time it is seen again.
   */
  async recognise(request: Request): Promise<Visitor | null> {
    const token = readCookie(request.headers.get("Cookie"), DEVICE_COOKIE);
    if (!token) return null;
    const tokenHash = await hash(token);
    const row = this.sql
      .exec<{ device_id: string; last_used_at: number; member_id: string; display_name: string; is_owner: number }>(
        `SELECT device.id AS device_id, device.last_used_at, member.id AS member_id,
                member.display_name, member.is_owner
         FROM device JOIN member ON member.id = device.member_id
         WHERE device.token_hash = ?`,
        tokenHash,
      )
      .toArray()[0];
    if (!row) return null;
    if (Date.now() - row.last_used_at >= DEVICE_LIFE_MS) {
      log.info("device.expired", { device: row.device_id, member: row.member_id, lastUsed: row.last_used_at });
      this.sql.exec("DELETE FROM device WHERE id = ?", row.device_id);
      return null;
    }
    return {
      deviceId: row.device_id,
      member: { id: row.member_id, name: row.display_name, owner: row.is_owner === 1 },
    };
  }

  /**
   * Counts a visit from a remembered device: its last use becomes now. Its browser and
   * operating system stay as they were recorded when it was remembered.
   */
  visited(visitor: Visitor) {
    this.sql.exec("UPDATE device SET last_used_at = ? WHERE id = ?", Date.now(), visitor.deviceId);
  }

  /**
   * The answer to a visit from a remembered device, renewing its cookie for a full life
   * from now, unless the answer already gives the browser a new one.
   */
  renewCookie(request: Request, response: Response): Response {
    const token = readCookie(request.headers.get("Cookie"), DEVICE_COOKIE);
    const replaced = response.headers.getSetCookie().some((c) => c.startsWith(`${DEVICE_COOKIE}=`));
    if (!token || replaced) return response;
    const renewed = new Response(response.body, response);
    renewed.headers.append("Set-Cookie", deviceCookie(token));
    return renewed;
  }

  /**
   * Makes the browser behind `request` an owner device and forgets every other device
   * of the owner. On a fresh instance it first makes the owner and the first room.
   * Returns the owner, the cookie that remembers the new device, and the devices it
   * forgot, whose tabs the caller cuts off.
   */
  async becomeOwner(
    request: Request,
    current: Visitor | null,
  ): Promise<{ owner: Member; cookie: string; forgotten: Forgotten[] }> {
    const remember = await this.newDevice(request, current);

    let owner = this.owner();
    if (!owner) {
      owner = { id: crypto.randomUUID(), name: OWNER_DISPLAY_NAME, owner: true };
      this.sql.exec(
        "INSERT INTO member (id, display_name, is_owner, created_at) VALUES (?, ?, 1, ?)",
        owner.id,
        owner.name,
        Date.now(),
      );
      this.createRoom(FIRST_ROOM_NAME);
    }
    return { owner, ...remember(owner, { forgetOthers: true }) };
  }

  /**
   * Makes an owner's invite for a new member called `name`, who will get access to
   * `rooms` (their addresses), or to the first room when `rooms` is left out. Null when
   * `name` is not a display name, or `rooms` is not a list of one or more of the
   * instance's rooms, each named once.
   */
  createInvite(name: unknown, rooms: unknown): PendingInvite | null {
    const displayName = toDisplayName(name);
    if (displayName === null) return null;
    const all = this.allRooms();
    let granted: Room[];
    if (rooms === undefined) {
      granted = all.slice(0, 1);
    } else {
      if (!Array.isArray(rooms) || new Set(rooms).size !== rooms.length) return null;
      granted = all.filter((room) => rooms.includes(room.address));
      if (granted.length !== rooms.length) return null;
    }
    if (granted.length === 0) return null;

    const now = Date.now();
    const invite: PendingInvite = {
      code: newInviteCode(),
      name: displayName,
      rooms: granted,
      expiresAt: now + OWNER_INVITE_LIFE_MS,
    };
    this.sql.exec(
      "INSERT INTO invite (code, display_name, created_at, expires_at) VALUES (?, ?, ?, ?)",
      invite.code,
      invite.name,
      now,
      invite.expiresAt,
    );
    for (const room of granted) {
      this.sql.exec("INSERT INTO invite_room (invite_code, room_address) VALUES (?, ?)", invite.code, room.address);
    }
    return invite;
  }

  /**
   * Makes an "Add a device" invite for `member`: whichever browser presses it becomes
   * another device of theirs. No approval and no limit on how many devices they have.
   */
  createDeviceInvite(member: Member): DeviceInvite {
    this.forgetExpiredInvites();
    const now = Date.now();
    const invite: DeviceInvite = { code: newInviteCode(), expiresAt: now + DEVICE_INVITE_LIFE_MS };
    this.sql.exec(
      `INSERT INTO invite (code, display_name, created_at, expires_at, member_id, kind)
       VALUES (?, ?, ?, ?, ?, 'device')`,
      invite.code,
      member.name,
      now,
      invite.expiresAt,
      member.id,
    );
    return invite;
  }

  /**
   * The owner's pending invites, newest first, "Let back in" among them. Expired invites
   * are forgotten here.
   */
  pendingInvites(): PendingInvite[] {
    this.forgetExpiredInvites();
    return this.ownerInvites("WHERE invite.kind = 'owner'");
  }

  /**
   * Makes a "Let back in" invite for `member`, who lost their devices: whichever browser
   * presses it becomes their one device, and every other device of theirs is forgotten.
   * It lasts as long as any owner's invite, and replaces an earlier one still pending.
   * Null for the owner, whose way back in is the setup secret.
   */
  createLetBackIn(member: Member): PendingInvite | null {
    if (member.owner) return null;
    const earlier = this.letBackIn(member);
    if (earlier) this.deleteInvite(earlier.code);
    const now = Date.now();
    const code = newInviteCode();
    this.sql.exec(
      `INSERT INTO invite (code, display_name, created_at, expires_at, member_id, kind)
       VALUES (?, ?, ?, ?, ?, 'owner')`,
      code,
      member.name,
      now,
      now + OWNER_INVITE_LIFE_MS,
      member.id,
    );
    return this.letBackIn(member);
  }

  /** The pending "Let back in" invite for `member`, or null. */
  letBackIn(member: Member): PendingInvite | null {
    return (
      this.ownerInvites("WHERE invite.kind = 'owner' AND invite.member_id = ? AND invite.expires_at > ?", member.id, Date.now())[0] ??
      null
    );
  }

  /**
   * Any pending invite with this code, the owner's or a member's own, as its page shows
   * it; null when it was never made, or is used, cancelled or expired.
   */
  openInvite(code: string): OpenInvite | null {
    const row = this.inviteRow(code);
    return row ? { name: row.member?.name ?? row.name } : null;
  }

  /** Cancels one of the owner's pending invites. False when there is no such invite with this code. */
  cancelInvite(code: string): boolean {
    if (this.inviteRow(code)?.kind !== "owner") return false;
    this.deleteInvite(code);
    return true;
  }

  /**
   * Uses up a pending invite. For an owner's invite, the browser behind `request` becomes
   * the device of a new member with the invite's display name and access to its rooms;
   * for "Let back in", the one device of the member it is for, whose other devices are
   * forgotten; for "Add a device", another device of the member who made it. Null, and
   * nothing changed, when the invite is not pending. Returns the member, the cookie that
   * remembers the new device, and the devices it forgot, whose tabs the caller cuts off.
   */
  async join(
    request: Request,
    current: Visitor | null,
    code: string,
  ): Promise<{ member: Member; cookie: string; forgotten: Forgotten[] } | null> {
    const remember = await this.newDevice(request, current);
    // Nothing below waits, so two presses of one invite cannot both use it.
    const invite = this.inviteRow(code);
    if (!invite) return null;
    const rooms = this.inviteRooms(code);
    this.deleteInvite(code);
    if (invite.member) {
      return { member: invite.member, ...remember(invite.member, { forgetOthers: invite.kind === "owner" }) };
    }
    const member: Member = { id: crypto.randomUUID(), name: invite.name, owner: false };
    this.sql.exec(
      "INSERT INTO member (id, display_name, is_owner, created_at) VALUES (?, ?, 0, ?)",
      member.id,
      member.name,
      Date.now(),
    );
    for (const room of rooms) {
      this.sql.exec("INSERT INTO access (member_id, room_address) VALUES (?, ?)", member.id, room.address);
    }
    return { member, ...remember(member) };
  }

  /**
   * The member whose device `deviceId` is, while the instance still remembers it; null
   * once it is forgotten. An open socket checks its device with this on every request.
   */
  deviceMember(deviceId: string): Member | null {
    const row = this.sql
      .exec<{ id: string; display_name: string; is_owner: number }>(
        `SELECT member.id, member.display_name, member.is_owner
         FROM device JOIN member ON member.id = device.member_id
         WHERE device.id = ? AND device.last_used_at > ?`,
        deviceId,
        Date.now() - DEVICE_LIFE_MS,
      )
      .toArray()[0];
    return row ? { id: row.id, name: row.display_name, owner: row.is_owner === 1 } : null;
  }

  /**
   * Changes `member`'s display name to `name`, trimmed. Null, and nothing changed, when
   * `name` is not a display name.
   */
  rename(member: Member, name: unknown): Member | null {
    const displayName = toDisplayName(name);
    if (displayName === null) return null;
    this.sql.exec("UPDATE member SET display_name = ? WHERE id = ?", displayName, member.id);
    return { ...member, name: displayName };
  }

  /** The rooms a member has access to, oldest first. The owner has access to every room. */
  rooms(member: Member): Room[] {
    if (member.owner) return this.allRooms();
    return this.sql
      .exec<{ address: string; name: string }>(
        `SELECT room.address, room.name FROM room
         JOIN access ON access.room_address = room.address
         WHERE access.member_id = ?
         ORDER BY room.created_at, room.rowid`,
        member.id,
      )
      .toArray()
      .map(({ address, name }) => ({ address, name }));
  }

  /** The room at `address` if the member has access to it, otherwise null. */
  room(member: Member, address: string): Room | null {
    return this.rooms(member).find((room) => room.address === address) ?? null;
  }

  /**
   * Makes a new room called `name`, which the owner has access to by rule. Null when
   * `name` is not a room name: like a display name, 1 to 40 characters once trimmed.
   */
  newRoom(name: unknown): Room | null {
    const roomName = toDisplayName(name);
    return roomName === null ? null : this.createRoom(roomName);
  }

  /**
   * Renames the room at `address`, whose address stays as it is. Null, and nothing
   * changed, when there is no such room or `name` is not a room name.
   */
  renameRoom(address: string, name: unknown): Room | null {
    const roomName = toDisplayName(name);
    if (roomName === null) return null;
    const renamed = this.sql
      .exec<{ address: string; name: string }>(
        "UPDATE room SET name = ? WHERE address = ? RETURNING address, name",
        roomName,
        address,
      )
      .toArray()[0];
    return renamed ? { address: renamed.address, name: renamed.name } : null;
  }

  /** Every room of the instance, oldest first. */
  allRooms(): Room[] {
    return this.sql
      .exec<{ address: string; name: string }>("SELECT address, name FROM room ORDER BY created_at, rowid")
      .toArray()
      .map(({ address, name }) => ({ address, name }));
  }

  /** Every member with access to the room at `address`, the owner among them, oldest first. */
  membersOf(address: string): Member[] {
    return this.sql
      .exec<{ id: string; display_name: string; is_owner: number }>(
        `SELECT id, display_name, is_owner FROM member
         WHERE is_owner = 1
            OR EXISTS (SELECT 1 FROM access WHERE access.member_id = member.id AND access.room_address = ?)
         ORDER BY created_at, rowid`,
        address,
      )
      .toArray()
      .map((row) => ({ id: row.id, name: row.display_name, owner: row.is_owner === 1 }));
  }

  /**
   * Grants `member` access to the room at `address`. True when that is new, false when
   * they had it already. Null, and nothing changed, for the owner, who has every room by
   * rule, or a room that does not exist.
   */
  grant(member: Member, address: string): boolean | null {
    if (member.owner || !this.allRooms().some((room) => room.address === address)) return null;
    const { rowsWritten } = this.sql.exec(
      "INSERT INTO access (member_id, room_address) VALUES (?, ?) ON CONFLICT DO NOTHING",
      member.id,
      address,
    );
    return rowsWritten > 0;
  }

  /**
   * Takes away `member`'s access to the room at `address`. True when they had it, false
   * when they did not. Null, and nothing changed, for the owner, who keeps every room,
   * or a room that does not exist.
   */
  revoke(member: Member, address: string): boolean | null {
    if (member.owner || !this.allRooms().some((room) => room.address === address)) return null;
    const { rowsWritten } = this.sql.exec(
      "DELETE FROM access WHERE member_id = ? AND room_address = ?",
      member.id,
      address,
    );
    return rowsWritten > 0;
  }

  /**
   * Removes `member` from the instance: forgets every device of theirs, their access and
   * any invite for them, then the member. Returns the addresses of the rooms they had.
   * Null, and nothing changed, for the owner, who cannot be removed.
   */
  remove(member: Member): string[] | null {
    if (member.owner) return null;
    const rooms = this.rooms(member).map((room) => room.address);
    for (const { code } of this.sql
      .exec<{ code: string }>("SELECT code FROM invite WHERE member_id = ?", member.id)
      .toArray()) {
      this.deleteInvite(code);
    }
    this.sql.exec("DELETE FROM device WHERE member_id = ?", member.id);
    this.sql.exec("DELETE FROM access WHERE member_id = ?", member.id);
    this.sql.exec("DELETE FROM member WHERE id = ?", member.id);
    return rooms;
  }

  /** Every member of the instance, oldest first, so the owner comes first. */
  everyone(): Member[] {
    return this.sql
      .exec<{ id: string; display_name: string; is_owner: number }>(
        "SELECT id, display_name, is_owner FROM member ORDER BY created_at, rowid",
      )
      .toArray()
      .map((row) => ({ id: row.id, name: row.display_name, owner: row.is_owner === 1 }));
  }

  /** The member `id`, or null when there is none. */
  member(id: string): Member | null {
    const row = this.sql
      .exec<{ display_name: string; is_owner: number }>("SELECT display_name, is_owner FROM member WHERE id = ?", id)
      .toArray()[0];
    return row ? { id, name: row.display_name, owner: row.is_owner === 1 } : null;
  }

  devices(member: Member): Device[] {
    return this.sql
      .exec<{ id: string; browser: string; os: string; last_used_at: number }>(
        "SELECT id, browser, os, last_used_at FROM device WHERE member_id = ? ORDER BY last_used_at DESC, rowid",
        member.id,
      )
      .toArray()
      .map((row) => ({ id: row.id, browser: row.browser, os: row.os, lastUsed: row.last_used_at }));
  }

  /**
   * Forgets `member`'s device `deviceId`: its browser is a stranger from now on. False,
   * and nothing changed, when the member has no such device.
   */
  forgetDevice(member: Member, deviceId: string): boolean {
    const { rowsWritten } = this.sql.exec("DELETE FROM device WHERE id = ? AND member_id = ?", deviceId, member.id);
    return rowsWritten > 0;
  }

  /**
   * Gets ready to remember the browser behind `request` as a new device. This is the
   * one step that waits, so callers take it before they check or change anything. The
   * function it returns forgets the device this browser held before, whoever's it was,
   * and with `forgetOthers` every other device of `member`'s. It records the new one as
   * `member`'s, and returns the cookie that remembers it and the devices it forgot.
   */
  private async newDevice(
    request: Request,
    current: Visitor | null,
  ): Promise<(member: Member, options?: { forgetOthers?: boolean }) => { cookie: string; forgotten: Forgotten[] }> {
    const token = newToken();
    const tokenHash = await hash(token);
    const { browser, os } = describeBrowser(request.headers);
    return (member, { forgetOthers = false } = {}) => {
      const now = Date.now();
      const forgotten: Forgotten[] = [];
      // The visitor's device may have been forgotten while the token was hashed.
      if (current && this.sql.exec("DELETE FROM device WHERE id = ?", current.deviceId).rowsWritten > 0) {
        forgotten.push({ device: current.deviceId, member: current.member });
      }
      if (forgetOthers) {
        for (const { id } of this.sql
          .exec<{ id: string }>("DELETE FROM device WHERE member_id = ? RETURNING id", member.id)
          .toArray()) {
          forgotten.push({ device: id, member });
        }
      }
      const device = crypto.randomUUID();
      log.info("device.remembered", { device, member: member.id, browser, os });
      this.sql.exec(
        `INSERT INTO device (id, member_id, token_hash, browser, os, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        device,
        member.id,
        tokenHash,
        browser,
        os,
        now,
        now,
      );
      return { cookie: deviceCookie(token), forgotten };
    };
  }

  /**
   * The pending invite with this code, and the member it is for when it is for one who
   * already exists; null when it was never made, or is used, cancelled or expired.
   * `member` is null for an invite that makes a new member.
   */
  private inviteRow(code: string): { name: string; kind: string; member: Member | null } | null {
    const row = this.sql
      .exec<{
        display_name: string;
        kind: string;
        member_id: string | null;
        member_name: string | null;
        is_owner: number | null;
      }>(
        `SELECT invite.display_name, invite.kind, invite.member_id, member.display_name AS member_name, member.is_owner
         FROM invite LEFT JOIN member ON member.id = invite.member_id
         WHERE invite.code = ? AND invite.expires_at > ?`,
        code,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return null;
    if (row.member_id === null) return { name: row.display_name, kind: row.kind, member: null };
    // An invite for a member who no longer exists is no invite at all.
    if (row.member_name === null) return null;
    return {
      name: row.member_name,
      kind: row.kind,
      member: { id: row.member_id, name: row.member_name, owner: row.is_owner === 1 },
    };
  }

  /**
   * The owner's invites that `where` picks, newest first. An invite for a member who
   * already exists ("Let back in") shows them as they are now: their display name and
   * the rooms they have.
   */
  private ownerInvites(where: string, ...bindings: SqlStorageValue[]): PendingInvite[] {
    return this.sql
      .exec<{ code: string; display_name: string; expires_at: number; member_id: string | null }>(
        `SELECT invite.code, invite.display_name, invite.expires_at, invite.member_id FROM invite
         ${where} ORDER BY invite.created_at DESC, invite.rowid DESC`,
        ...bindings,
      )
      .toArray()
      .flatMap((row) => {
        if (row.member_id === null) {
          return [{ code: row.code, name: row.display_name, rooms: this.inviteRooms(row.code), expiresAt: row.expires_at }];
        }
        const member = this.member(row.member_id);
        return member ? [{ code: row.code, name: member.name, rooms: this.rooms(member), expiresAt: row.expires_at }] : [];
      });
  }

  private forgetExpiredInvites() {
    for (const { code } of this.sql
      .exec<{ code: string }>("SELECT code FROM invite WHERE expires_at <= ?", Date.now())
      .toArray()) {
      this.deleteInvite(code);
    }
  }

  private inviteRooms(code: string): Room[] {
    return this.sql
      .exec<{ address: string; name: string }>(
        `SELECT room.address, room.name FROM room
         JOIN invite_room ON invite_room.room_address = room.address
         WHERE invite_room.invite_code = ?
         ORDER BY room.created_at, room.rowid`,
        code,
      )
      .toArray()
      .map(({ address, name }) => ({ address, name }));
  }

  private deleteInvite(code: string) {
    this.sql.exec("DELETE FROM invite_room WHERE invite_code = ?", code);
    this.sql.exec("DELETE FROM invite WHERE code = ?", code);
  }

  private owner(): Member | null {
    const row = this.sql
      .exec<{ id: string; display_name: string }>("SELECT id, display_name FROM member WHERE is_owner = 1")
      .toArray()[0];
    return row ? { id: row.id, name: row.display_name, owner: true } : null;
  }

  private createRoom(name: string): Room {
    const room = { address: newRoomAddress(), name };
    this.sql.exec("INSERT INTO room (address, name, created_at) VALUES (?, ?, ?)", room.address, name, Date.now());
    return room;
  }
}

/** The answer's way of telling a browser whose device was just forgotten to drop its cookie. */
export const FORGET_DEVICE_COOKIE = `${DEVICE_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;

function deviceCookie(token: string): string {
  const maxAge = DEVICE_LIFE_MS / 1000;
  return `${DEVICE_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(header: string | null, name: string): string | null {
  for (const pair of (header ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim() || null;
  }
  return null;
}

/** 256 random bits: unguessable, and the cookie's whole value. */
function newToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** About 128 random bits: unguessable, and short enough for a link pasted into a chat. */
function newInviteCode(): string {
  // Workers Logs stores each request's address, and masks a code in it only when the code
  // holds two capitals, two lower case letters and two digits (ticket 48). About 1 in 7
  // random codes lacks two digits, so those are drawn again.
  for (;;) {
    const code = base64url(crypto.getRandomValues(new Uint8Array(16)));
    if ([/[A-Z]/g, /[a-z]/g, /[0-9]/g].every((kind) => (code.match(kind)?.length ?? 0) >= 2)) return code;
  }
}

/** `value` as a display name: trimmed, and 1 to 40 characters long. Null when it is not one. */
function toDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && [...name].length <= DISPLAY_NAME_MAX ? name : null;
}

// Short enough to read in an address, and random so an address says nothing about the
// instance. Access is what guards a room, not its address.
const ROOM_ADDRESS_LETTERS = "abcdefghijkmnpqrstuvwxyz23456789";

function newRoomAddress(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => ROOM_ADDRESS_LETTERS[byte % ROOM_ADDRESS_LETTERS.length]).join("");
}

export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
