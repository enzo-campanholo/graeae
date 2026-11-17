// The people-and-rooms rules: members (the owner among them), the browsers remembered as
// their devices, and the rooms they have access to.

import { describeBrowser } from "./browser.ts";

const DAY = 24 * 60 * 60 * 1000;

/** A device is forgotten once it goes this long without a visit. */
export const DEVICE_LIFE_MS = 400 * DAY;

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
    const token = newToken();
    const tokenHash = await hash(token);
    const { browser, os } = describeBrowser(request.headers);
    const now = Date.now();

    let owner = this.owner();
    if (!owner) {
      owner = { id: crypto.randomUUID(), name: OWNER_DISPLAY_NAME, owner: true };
      this.sql.exec(
        "INSERT INTO member (id, display_name, is_owner, created_at) VALUES (?, ?, 1, ?)",
        owner.id,
        owner.name,
        now,
      );
      this.createRoom(FIRST_ROOM_NAME);
    }
    // This browser's old device, whoever's it was, is replaced by the new one.
    if (current) this.sql.exec("DELETE FROM device WHERE id = ?", current.deviceId);
    this.sql.exec("DELETE FROM device WHERE member_id = ?", owner.id);
    this.sql.exec(
      `INSERT INTO device (id, member_id, token_hash, browser, os, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      owner.id,
      tokenHash,
      browser,
      os,
      now,
      now,
    );
    return { owner, cookie: deviceCookie(token) };
  }

  /** The rooms a member has access to, oldest first. The owner has access to every room. */
  rooms(member: Member): Room[] {
    if (!member.owner) return [];
    return this.sql
      .exec<{ address: string; name: string }>("SELECT address, name FROM room ORDER BY created_at, rowid")
      .toArray()
      .map(({ address, name }) => ({ address, name }));
  }

  /** The room at `address` if the member has access to it, otherwise null. */
  room(member: Member, address: string): Room | null {
    return this.rooms(member).find((room) => room.address === address) ?? null;
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
