// Pulls a deployed instance's lines from Workers Logs for a window, into
// `.logs/<worker>-<from>-<to>.jsonl`: one event a line, oldest first by the time graeae
// wrote it (`.source.at`), a tab's batch that arrived twice kept once, and without the
// two fields that hold a request's address, invite codes included (`$workers.event.request`
// and `$metadata.trigger`, which Cloudflare redacts only by a heuristic).
//
//   pnpm logs <worker> <from> <to>
//
// `from` and `to` are milliseconds since the epoch or anything `Date` reads
// ("2026-11-22T11:30Z"). The token is the owner's, kept in `.logs/cloudflare-token`
// (CLAUDE.md, "Logs"); it is checked before every pull. The account is
// `CLOUDFLARE_ACCOUNT_ID`, or the one the wrangler login belongs to.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

/** One event as Workers Logs gives it; graeae's own line is `source`. */
interface LogEvent {
  source?: { source?: string; at?: number };
  $workers?: { event?: { request?: unknown } };
  $metadata: { id: string; trigger?: unknown; timestamp?: number };
  timestamp?: number;
}

/** An answer of Cloudflare's API. */
interface ApiAnswer<Result> {
  success?: boolean;
  errors?: unknown;
  result: Result;
}

const TOKEN_FILE = ".logs/cloudflare-token";
const API = "https://api.cloudflare.com/client/v4";
const PAGE = 2000;

const [worker, fromArg, toArg] = process.argv.slice(2);
if (!worker || !fromArg || !toArg) fail("usage: pnpm logs <worker> <from> <to>");
const from = moment(fromArg);
const to = moment(toArg);
if (from >= to) fail("<from> must come before <to>");

const token = readToken();
await checkToken();
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? wranglerAccount();

const events: LogEvent[] = [];
let offset: string | undefined;
for (let page = 0; ; page++) {
  const found = await query(offset);
  console.error(`page ${page}: ${found.length} events`);
  events.push(...found);
  if (found.length < PAGE) break;
  offset = found.at(-1)?.$metadata.id;
}

const seen = new Set();
const lines: LogEvent[] = [];
for (const event of events) {
  delete event.$workers?.event?.request;
  delete event.$metadata?.trigger;
  if (event.source?.source === "tab") {
    const key = JSON.stringify(event.source);
    if (seen.has(key)) continue;
    seen.add(key);
  }
  lines.push(event);
}
lines.sort((a, b) => timeOf(a) - timeOf(b));

const out = `.logs/${worker}-${from}-${to}.jsonl`;
writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
console.error(`${lines.length} events (${events.length - lines.length} repeated batch lines dropped) in ${out}`);
if (Date.now() - to < 5 * 60_000) console.error("the window ended under 5 minutes ago: lines may still be arriving");

async function query(after: string | undefined): Promise<LogEvent[]> {
  const body = {
    queryId: "graeae-pull",
    view: "events",
    limit: PAGE,
    timeframe: { from, to },
    parameters: { filters: [{ key: "$metadata.service", operation: "eq", type: "string", value: worker }] },
    ...(after === undefined ? {} : { offset: after, offsetDirection: "next" }),
  };
  const answer = await call<{ events?: { events?: LogEvent[] } }>(`/accounts/${account}/workers/observability/telemetry/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return answer.result.events?.events ?? [];
}

async function call<Result>(path: string, init: RequestInit = {}): Promise<ApiAnswer<Result>> {
  const response = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const answer = (await response.json().catch(() => ({}))) as ApiAnswer<Result>;
  if (!response.ok || answer.success === false) {
    fail(`${path.split("/").at(-1)}: ${response.status} ${JSON.stringify(answer.errors ?? answer)}`);
  }
  return answer;
}

function readToken() {
  if (!existsSync(TOKEN_FILE)) fail(`no ${TOKEN_FILE}: ask the owner for a token (CLAUDE.md, "Logs")`);
  if (statSync(TOKEN_FILE).mode & 0o077) fail(`${TOKEN_FILE} is readable by others: chmod 600 it`);
  return readFileSync(TOKEN_FILE, "utf8").trim();
}

async function checkToken() {
  const { result } = await call<{ status: string; expires_on?: string }>("/user/tokens/verify");
  if (result.status !== "active") fail(`the token in ${TOKEN_FILE} is ${result.status}: ask the owner for a new one`);
  if (result.expires_on) console.error(`token active until ${result.expires_on}`);
}

function wranglerAccount() {
  const who: { accounts?: { id: string }[] } = JSON.parse(execFileSync("pnpm", ["exec", "wrangler", "whoami", "--json"], { encoding: "utf8" }));
  const ids = (who.accounts ?? []).map((one) => one.id);
  if (ids.length !== 1) fail(`the wrangler login has ${ids.length} accounts: set CLOUDFLARE_ACCOUNT_ID`);
  return ids[0];
}

function moment(text: string): number {
  const time = /^\d+$/.test(text) ? Number(text) : Date.parse(text);
  if (!Number.isFinite(time)) fail(`not a time: ${text}`);
  return time;
}

function timeOf(event: LogEvent): number {
  return event.source?.at ?? event.$metadata?.timestamp ?? event.timestamp ?? 0;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
