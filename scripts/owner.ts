// `pnpm as-owner`: the owner's side of a deployed instance from this machine, for a real-media
// run (`pnpm real-media`): its rooms and members, invites made into files, and members
// removed afterwards. An invite's address goes only into a file, mode 600, which
// `pnpm real-media --url-file` reads, so no invite code reaches a terminal or a log.
//
//   pnpm as-owner signin <file>                  sign this machine in with an "Add a device" invite
//   pnpm as-owner rooms                          every room: address, name
//   pnpm as-owner people                         every member: id, name, rooms
//   pnpm as-owner invite <name> <file> [<room address>...]   an invite, its address into <file>
//   pnpm as-owner cancel <file>                  cancels the unused invite in <file>
//   pnpm as-owner remove <id or name>            removes a member from the instance
//
// The instance is `--url <address>`, or GRAEAE_INSTANCE in `.env.owner-checks`. This
// machine is a remembered device of the owner's, its cookie kept in `.owner/<host>`
// (git-ignored, mode 600). To sign it in, the owner presses "Add a device" on their own
// "You" page and hands over the invite in a file (for an agent: `request_secret`,
// `delivery: "file"`); it is good for one device, within 10 minutes, and leaves the owner's
// other devices signed in. The setup secret would sign this machine in too, but it forgets
// every other device of the owner's, so it is not used here.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { CreateInviteAnswer, OwnerRoomsAnswer, PeopleAnswer } from "../src/shared/api.ts";

const { values: options, positionals } = parseArgs({ options: { url: { type: "string" } }, allowPositionals: true });
const [command, ...args] = positionals;

const instance = new URL(options.url ?? fromEnvFile() ?? fail("no instance: --url <address>, or GRAEAE_INSTANCE in .env.owner-checks")).origin;
const COOKIE_FILE = `.owner/${new URL(instance).host}`;

switch (command) {
  case "signin": {
    const code = codeIn(args[0] ?? fail("usage: pnpm as-owner signin <file holding the invite>"));
    await call("POST", `/api/invites/${code}`, {}, false);
    const people = await call<PeopleAnswer>("GET", "/api/owner/people");
    const owner = people.people.find((person) => person.owner);
    console.log(`signed in to ${instance} as ${owner?.name ?? "the owner"}`);
    break;
  }
  case "rooms": {
    const { rooms } = await call<OwnerRoomsAnswer>("GET", "/api/owner/rooms");
    for (const room of rooms) console.log(`${room.address}  ${room.name}`);
    break;
  }
  case "people": {
    const { people } = await call<PeopleAnswer>("GET", "/api/owner/people");
    for (const person of people) console.log(`${person.id}  ${person.owner ? "(owner) " : ""}${person.name}  rooms ${person.rooms.join(",") || "-"}`);
    break;
  }
  case "invite": {
    const [name, file, ...rooms] = args;
    if (!name || !file) fail("usage: pnpm as-owner invite <name> <file> [<room address>...]");
    const { invite } = await call<CreateInviteAnswer>("POST", "/api/owner/invites", { name, ...(rooms.length ? { rooms } : {}) });
    writeFileSync(file, `${instance}/invite/${invite.code}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    const where = invite.rooms.map((room) => room.name).join(", ") || "no room";
    console.log(`invite for ${invite.name} (${where}) in ${file}, until ${new Date(invite.expiresAt).toISOString()}`);
    break;
  }
  case "cancel": {
    const file = args[0] ?? fail("usage: pnpm as-owner cancel <file holding the invite>");
    await call("DELETE", `/api/owner/invites/${codeIn(file)}`);
    console.log(`cancelled the invite in ${file}`);
    break;
  }
  case "remove": {
    const wanted = args[0] ?? fail("usage: pnpm as-owner remove <id or name>");
    const { people } = await call<PeopleAnswer>("GET", "/api/owner/people");
    const found = people.filter((person) => !person.owner && (person.id === wanted || person.name === wanted));
    if (found.length !== 1) fail(`${found.length} members are ${wanted}: name one by its id (pnpm as-owner people)`);
    await call("DELETE", `/api/owner/people/${found[0]!.id}`);
    console.log(`removed ${found[0]!.name}`);
    break;
  }
  default:
    fail("usage: pnpm as-owner [--url <instance>] signin | rooms | people | invite | cancel | remove (see scripts/owner.ts)");
}

/**
 * One request as the owner's device, its renewed cookie kept. With `signedIn` false, it
 * goes with no cookie and keeps the one it gets.
 */
async function call<Answer>(method: string, path: string, body?: unknown, signedIn = true): Promise<Answer> {
  const headers: Record<string, string> = { origin: instance };
  if (signedIn) {
    if (!existsSync(COOKIE_FILE)) fail(`${instance} has no device of the owner's here: pnpm as-owner signin <file> (scripts/owner.ts)`);
    headers.cookie = readFileSync(COOKIE_FILE, "utf8").trim();
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${instance}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]!).filter((cookie) => !cookie.endsWith("="));
  if (cookies.length > 0) {
    mkdirSync(".owner", { recursive: true, mode: 0o700 });
    writeFileSync(COOKIE_FILE, cookies.join("; ") + "\n", { mode: 0o600 });
  }
  // The instance answers "nothing here" to anyone it does not know, owner pages included.
  if (response.status === 404 && signedIn) fail(`${instance} did not know this device: pnpm as-owner signin <file> (scripts/owner.ts)`);
  const why = response.status === 404 ? " (nothing here: an invite used, cancelled or out of time, or an address it does not know)" : "";
  if (!response.ok) fail(`${method} ${path.replace(/\/invites\/[^/]+/, "/invites/<code>")}: ${response.status}${why}`);
  return (await response.json().catch(() => ({}))) as Answer;
}

/** The invite code in a file holding an invite's address, or the code alone. */
function codeIn(file: string): string {
  const text = readFileSync(file, "utf8").trim();
  return text.split("/invite/").at(-1)!.split(/[/?#]/)[0]!;
}

function fromEnvFile(): string | undefined {
  if (!existsSync(".env.owner-checks")) return undefined;
  return /^GRAEAE_INSTANCE=(.+)$/m.exec(readFileSync(".env.owner-checks", "utf8"))?.[1]?.trim();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
