// The people-and-rooms rules: members (the owner among them), the browsers remembered as
// their devices, the rooms they have access to, and the invites that let them in.

import { describeBrowser } from "./browser.ts";

const DAY = 24 * 60 * 60 * 1000;

/** A device is forgotten once it goes this long without a visit. */
export const DEVICE_LIFE_MS = 400 * DAY;

/** An owner's invite can be used until this long after it was made. */
export const OWNER_INVITE_LIFE_MS = 7 * DAY;

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
   * Returns the owner, and the cookie that remembers the new device.
   */
  async becomeOwner(
    request: Request,
    current: Visitor | null,
  ): Promise<{ owner: Member; cookie: string }> {
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
    this.sql.exec("DELETE FROM device WHERE member_id = ?", owner.id);
    return { owner, cookie: remember(owner) };
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

  /** The pending invites, newest first. Expired ones are forgotten here. */
  pendingInvites(): PendingInvite[] {
    for (const { code } of this.sql
      .exec<{ code: string }>("SELECT code FROM invite WHERE expires_at <= ?", Date.now())
      .toArray()) {
      this.deleteInvite(code);
    }
    return this.sql
      .exec<{ code: string; display_name: string; expires_at: number }>(
        "SELECT code, display_name, expires_at FROM invite ORDER BY created_at DESC, rowid DESC",
      )
      .toArray()
      .map((row) => ({
        code: row.code,
        name: row.display_name,
        rooms: this.inviteRooms(row.code),
        expiresAt: row.expires_at,
      }));
  }

  /** The pending invite with this code, or null when it was never made, or is used, cancelled or expired. */
  pendingInvite(code: string): PendingInvite | null {
    const row = this.sql
      .exec<{ display_name: string; expires_at: number }>(
        "SELECT display_name, expires_at FROM invite WHERE code = ? AND expires_at > ?",
        code,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return null;
    return { code, name: row.display_name, rooms: this.inviteRooms(code), expiresAt: row.expires_at };
  }

  /** Cancels a pending invite. False when there is no pending invite with this code. */
  cancelInvite(code: string): boolean {
    if (!this.pendingInvite(code)) return false;
    this.deleteInvite(code);
    return true;
  }

  /**
   * Uses up a pending invite: the browser behind `request` becomes the device of a new
   * member with the invite's display name and access to its rooms. Null, and nothing
   * changed, when the invite is not pending. Returns the member and the cookie that
   * remembers the new device.
   */
  async join(
    request: Request,
    current: Visitor | null,
    code: string,
  ): Promise<{ member: Member; cookie: string } | null> {
    const remember = await this.newDevice(request, current);
    // Nothing below waits, so two presses of one invite cannot both use it.
    const invite = this.pendingInvite(code);
    if (!invite) return null;
    this.deleteInvite(code);
    const member: Member = { id: crypto.randomUUID(), name: invite.name, owner: false };
    this.sql.exec(
      "INSERT INTO member (id, display_name, is_owner, created_at) VALUES (?, ?, 0, ?)",
      member.id,
      member.name,
      Date.now(),
    );
    for (const room of invite.rooms) {
      this.sql.exec("INSERT INTO access (member_id, room_address) VALUES (?, ?)", member.id, room.address);
    }
    return { member, cookie: remember(member) };
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
   * Gets ready to remember the browser behind `request` as a new device. This is the
   * one step that waits, so callers take it before they check or change anything. The
   * function it returns forgets the device this browser held before, whoever's it was,
   * records the new one as `member`'s, and returns the cookie that remembers it.
   */
  private async newDevice(request: Request, current: Visitor | null): Promise<(member: Member) => string> {
    const token = newToken();
    const tokenHash = await hash(token);
    const { browser, os } = describeBrowser(request.headers);
    return (member) => {
      const now = Date.now();
      if (current) this.sql.exec("DELETE FROM device WHERE id = ?", current.deviceId);
      this.sql.exec(
        `INSERT INTO device (id, member_id, token_hash, browser, os, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        member.id,
        tokenHash,
        browser,
        os,
        now,
        now,
      );
      return deviceCookie(token);
    };
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

/** 128 random bits: unguessable, and short enough for a link pasted into a chat. */
function newInviteCode(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
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
