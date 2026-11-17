// Steps many tests take, each done only the way a browser would do it.

import { expect } from "vitest";
import type {
  CreateInviteAnswer,
  CreateRoomAnswer,
  DeviceInviteAnswer,
  JoinAnswer,
  PendingInvite,
} from "../src/shared/api.ts";
import { SETUP_SECRET, type TestBrowser, type TestInstance } from "./harness.ts";

/** What the setup page sends: the part of `/setup#<secret>` after the `#`. */
export function useSetupSecret(browser: TestBrowser, secret = SETUP_SECRET, headers: HeadersInit = {}) {
  return browser.fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ secret }),
  });
}

/** Makes `browser` the owner's device, and returns the address of the room it lands in. */
export async function setUpOwner(browser: TestBrowser): Promise<string> {
  const response = await useSetupSecret(browser);
  expect(response.status).toBe(200);
  return (await response.json<{ to: string }>()).to;
}

/** Everything a visitor can see of an answer, to compare two answers whole. */
export async function answer(response: Response) {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}

/** What the owner page's invite form sends. */
export function createInvite(owner: TestBrowser, body: unknown) {
  return owner.fetch("/api/owner/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Has the owner invite `name`, and returns the invite as the owner page shows it. */
export async function invite(owner: TestBrowser, name: string, rooms?: string[]): Promise<PendingInvite> {
  const response = await createInvite(owner, { name, rooms });
  expect(response.status).toBe(200);
  return (await response.json<CreateInviteAnswer>()).invite;
}

/** The press of the invite page's one button. */
export function pressJoin(browser: TestBrowser, code: string) {
  return browser.fetch(`/api/invites/${code}`, { method: "POST" });
}

/**
 * Invites `name` (to `rooms`, by address, or to the first room) and has a fresh browser
 * join as them. Returns that browser and where it lands.
 */
export async function addMember(instance: TestInstance, owner: TestBrowser, name: string, rooms?: string[]) {
  const { code } = await invite(owner, name, rooms);
  const browser = instance.browser();
  const joined = await pressJoin(browser, code);
  expect(joined.status).toBe(200);
  return { browser, to: (await joined.json<JoinAnswer>()).to };
}

/** Has the owner create a room called `name`, and returns its address. */
export async function createRoom(owner: TestBrowser, name: string): Promise<string> {
  const response = await owner.fetch("/api/owner/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(200);
  return (await response.json<CreateRoomAnswer>()).room.address;
}

/** What the owner page's Rooms section sends to rename the room at `address`. */
export function renameRoom(owner: TestBrowser, address: string, name: unknown) {
  return owner.fetch(`/api/owner/rooms/${address}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

/** What the "You" page's "Add a device" sends. */
export function addDevice(browser: TestBrowser) {
  return browser.fetch("/api/me/devices", { method: "POST" });
}

/** Has `browser`'s member add a device, and returns a fresh browser made that device by pressing the invite. */
export async function addSecondBrowser(instance: TestInstance, browser: TestBrowser, userAgent?: string) {
  const made = await addDevice(browser);
  expect(made.status).toBe(200);
  const { invite } = await made.json<DeviceInviteAnswer>();
  const other = instance.browser({ userAgent });
  const joined = await pressJoin(other, invite.code);
  expect(joined.status).toBe(200);
  return { other, to: (await joined.json<JoinAnswer>()).to };
}
