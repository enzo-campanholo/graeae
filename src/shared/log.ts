// The log line: one JSON object per line, which the instance writes to Workers Logs and
// the tabs hand to the instance to write (ticket 48). Both sides build every line here,
// so what is left out is decided in one place. The instance's own lines are written by
// `src/instance/log.ts`, a tab's events are kept and sent by `src/app/lib/log.ts`, and
// how to pull them is in CLAUDE.md, under "Logs".
//
// Every line carries:
// - `source`: "instance", or "tab" for an event a tab recorded;
// - `event`: a short fixed name, listed below;
// - `at`: the writer's clock, in milliseconds since the epoch. A tab's is its own clock,
//   since its events reach the instance in batches, seconds late; `up` is how long its
//   page had been open, and `page` the id of that page load, which outlives its sockets;
// - whichever of `member`, `device`, `tab` and `room` apply: the instance's ids, never a
//   display name. A tab's lines are tagged by the instance from the socket or the device
//   cookie they came on, never from what the tab says. `ws.open` maps a member's id to
//   their display name; a display name is otherwise written only where it is the news
//   (`member.renamed`, `invite.used`, `room.made`, `room.renamed`).
//
// Left out of every line, whatever field it is in: the setup secret, device cookies and
// their tokens, invite codes, the media server's application secret, the relay key and
// its credentials, `iceServers`, and any value the writer knows to be a secret. SDP is
// logged by its size and its media sections (mid, kind, direction), never its body; an
// ICE candidate by its type and protocol; an IP address not at all. Nobody's picture or
// sound ever reaches the instance. Workers Logs adds its own `$workers` and `$metadata`
// to every line, with the request's address but no headers: an invite code in it is
// written as `REDACTED` only because `newInviteCode` makes codes Cloudflare's heuristic
// masks, and CLAUDE.md's pull leaves those fields out.
//
// The events. On the instance (`source: "instance"`):
// - `instance.start` (`build`, `migrations` run), `restart.restored`, `restart.swept`
// - `error`: every exception, caught or not, with its stack and what it was `during`
// - `http`: every request: `method`, `route`, `status`, `ms`, the `room`, `subject` or
//   `subjectDevice` its address names, and `refused` with why (the visitor sees only
//   "nothing here")
// - `ws.open` (`name`: the member's display name), `ws.close` (`code`, `reason`, `how`:
//   left, lost, list, closed by the instance, unknown), `ws.error`, `ws.silent` (closed when its
//   grace period ran out), `ws.taken-back`, `ws.cut`, and `ws.in` and `ws.out` with the
//   `message`: every one but heartbeats, a full state by its `bytes` and `areas`
// - `request.not-understood`: a request the instance ignores, since it does not know its
//   name or its fields fail their check, by its `request` (`<area>.<type>`, or null)
// - `grace.start`, `grace.end` (taken back in time), `grace.expired`
// - `presence.arrived`, `presence.left`, `presence.reconnecting`,
//   `presence.reconnected`, `tab.silent`, `tab.heard` (a tab's own shares' mark)
// - `media.connected`, `media.unavailable` (`why`: the media server or the relay
//   failed, nothing to replace, or not allowed), `media.answered`, `media.restarted`,
//   `media.reconnect`, `media.dropped`, each with the `connection` it is about
//   (sending or receiving); `media.replacing`, `media.replacement-abandoned`,
//   `media.replaced` and `watch.pulled-again` (a receiving connection replaced);
//   `falter.start`, `falter.end`, `falter.due`
// - `share.refused` (`why`), `share.live`, `share.ending` (its end began: no longer listed),
//   `share.ended`, `share.close-failed`
// - `watch.refused` (`why`), `watch.started`, `watch.ended`, `watch.close-failed`,
//   `quality.set`, `quality.failed`
// - `handover.started`, `handover.done`, `handover.moved`
// - `retry.scheduled`, `retry.confirmed`, `cutoff.start`, `cutoff.done`, `sweep.closed`
//   (a track no record named), `sweep.gone` (a record whose track was gone),
//   `sweep.skipped`
// - `usage.gap-charged`, `budget.told`, `budget.stop`, `budget.stopped`,
//   `usage.reset-day`, `usage.budget`; what each tab received is its `usage.received`
//   in `ws.in`
// - `relay.minted`, `relay.renewed`, `relay.failed`
// - `owner.setup`, `invite.made`, `invite.used`, `invite.cancelled`, `device.remembered`,
//   `device.expired`, `device.forgotten`, `member.renamed`, `member.removed`,
//   `access.granted`, `access.revoked`, `room.made`, `room.renamed`
// - `media-server`: every call to the media server or the relay: `op`, `connection`,
//   `from`, `tracks`, `ms`, `ok`, and on a failure `status`, `body` in full,
//   `failedTracks` with their error codes, and `error` (a timeout is a `TimeoutError`)
// - `tab.batch`: a batch of a tab's that came with drops, malformed events, or too large
//
// From a tab (`source: "tab"`), each with `page`, `up` and the tab's own `at`:
// - `page.open` (`userAgent`, `language`, `screen`, `viewport`, `build`, and whether
//   the instance `refused` the page), `page.route` (`route`,
//   `params`, the page it `shows`, and the page `under` it while that is an overlay),
//   `page.hidden`, `page.visible`, `page.online`,
//   `page.offline`, `page.leave`
// - `ws.open`, `ws.close`, `ws.lost` (`why`), `ws.retry`, `ws.refused`, `ws.late` (a
//   heartbeat answered after more than a second), `ws.in`, `ws.out`, each with the
//   `socket` it is about (room or list); `reconnecting.shown`, `reconnecting.cleared`
// - `http.refused`, `http.failed`
// - `pc.connection`, `pc.ice`, `pc.gathering`, `pc.signaling` (each a state change),
//   `pc.pair` (the candidate pair in use, by type and protocol), `pc.restart`,
//   `pc.restarted`, `pc.restart-failed`
// - `capture.asked`, `capture.granted`, `capture.refused` (with the `error` name),
//   `capture.track` (what the browser captured), `capture.ended` (by the browser),
//   `capture.track-ended`, `capture.muted`, `capture.unmuted`, `capture.audio-dropped`
//   (a screen share's audio that was not a tab's or one application's, by `kind`, never
//   its label)
// - `share.asked`, `share.offered`, `share.confirmed`, `share.failed`, `share.stopped`,
//   `share.handed-over`, `watch.asked`, `watch.pulled`, `watch.confirmed`, `watch.shown`
//   (its first frame), `watch.refused`, `watch.failed`, `watch.left`, `watch.moved`,
//   `quality.chosen`
// - `media.connected`, `media.unavailable` (with the instance's `reason`, when it gave
//   one), `media.health`, `media.dropped`, `media.rejoined`, `media.rebuild`,
//   `media.reconnect`, `media.reconnect-failed`, `media.renew`, `media.replace`,
//   `media.replaced`, `media.replace-failed`, each with its `connection`;
//   `pc.*` lines too
// - `stats`: every 15 seconds while sharing or watching, one line per stream:
//   `direction`, `kind`, `mid`, `rid`, `bitrate`, `fps`, `width`, `height`,
//   `packetsLost`, `jitter`, `rtt`, `layer` (the quality received), `limitedBy` (the
//   encoder's `qualityLimitationReason`), `framesDropped`, `freezes`; a picture sent
//   adds `encoder`, `hardware`, `codec`, `targetBitrate`, `estimate` (the browser's
//   `availableOutgoingBitrate`), `keyFrames`, `resolutionChanges` and `capture` (the
//   track's `surface`, `width` and `height` at that reading); a picture received adds
//   `decoder`, `freezeSeconds`, `pli`, `fir` and `nack`; a sound received, its `audioLevel`
// - `error`: `window.onerror`, `unhandledrejection` and caught errors, with the stack
//
// The daily allowance. Estimated for 6 people for 5 hours, each sharing a webcam and
// watching 3 shares, with one screen share at two qualities: the usage reports (every 5
// seconds per tab with media, logged by both ends) are about 43,000 lines; `stats`
// (about 5 streams per tab every 15 seconds, some 500 bytes each) about 36,000; everything else a few
// thousand. About 85,000 lines in all, under half of the free plan's 200,000 a day, and
// some 40 MB, far under the 0.5 GB a day it allows from 1 December 2026. It takes both of
// the ticket's cuts to stay under half: `stats` every 15 seconds rather than 10 (at 10,
// about 102,000 lines), and invocation logs off (`wrangler.jsonc`), since every
// heartbeat, report and alarm is an invocation and would add about 65,000 more.

/** Who recorded a line: the instance, or a tab. */
export type LogSource = "instance" | "tab";
/** How bad it is: written with `console.log`, `console.warn` or `console.error`, so Workers Logs can filter on it. */
export type LogLevel = "info" | "warn" | "error";

/** A line's fields, before the builder has been through them. */
export type LogFields = Record<string, unknown>;

/** One line as it is written. */
export interface LogLine {
  source: LogSource;
  event: string;
  at: number;
  [field: string]: unknown;
}

/** What the writer adds to the leave-out rules. */
export interface LineOptions {
  /** Values to leave out wherever they turn up: the instance's own secrets. */
  secrets?: readonly string[];
  /** The writer's clock. */
  at?: number;
}

/** What a left-out value is written as, so a reader can see a field was there. */
export const LEFT_OUT = "[left out]";

/** Fields whose value is never written, by their name in lower case without `-` or `_`. */
const NEVER_KEYS = new Set([
  "secret",
  "setupsecret",
  "cookie",
  "cookies",
  "setcookie",
  "token",
  "devicetoken",
  "password",
  "authorization",
  "credential",
  "credentials",
  "username",
  "iceservers",
  "appsecret",
  "sfuappsecret",
  "turnkeyid",
  "turnkeytoken",
  "invitecode",
  "ip",
  "relatedaddress",
]);

/** Fields that hold an SDP body when they hold a string. */
const SDP_KEYS = new Set(["sdp", "offer", "answer"]);

/** How deep a field is followed, how many items of a list, and how long a string, before the rest is cut. */
const MAX_DEPTH = 8;
const MAX_ITEMS = 64;
const MAX_STRING = 8_000;

/** Builds one line: `event` from `source` with `fields`, every leave-out rule applied. */
export function logLine(source: LogSource, event: string, fields: LogFields = {}, options: LineOptions = {}): LogLine {
  const secrets = (options.secrets ?? []).filter((secret) => secret.length >= 8);
  const cleaned = clean(fields, secrets, 0) as LogFields;
  return { ...cleaned, source, event, at: options.at ?? Date.now() };
}

/** An error as a line holds it: its name, message and stack. Anything thrown that is not an Error is held as its text. */
export function errorFields(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  }
  return { name: typeof error, message: String(error) };
}

/** An SDP body as a line holds it: its size, and each media section's mid, kind and direction. */
export function sdpSummary(sdp: string): { bytes: number; media: { mid?: string; kind: string; direction?: string }[] } {
  const media: { mid?: string; kind: string; direction?: string }[] = [];
  for (const line of sdp.split(/\r?\n/)) {
    const section = /^m=(\w+)/.exec(line);
    if (section) {
      media.push({ kind: section[1]! });
      continue;
    }
    const current = media.at(-1);
    if (!current) continue;
    const mid = /^a=mid:(.+)$/.exec(line);
    if (mid) current.mid = mid[1]!.trim();
    const direction = /^a=(sendrecv|sendonly|recvonly|inactive)$/.exec(line.trim());
    if (direction) current.direction = direction[1]!;
  }
  return { bytes: sdp.length, media };
}

/** An ICE candidate as a line holds it: its type and protocol, never its address. */
export function candidateSummary(candidate: string): { type?: string; protocol?: string } {
  const type = /\btyp (\w+)/.exec(candidate)?.[1];
  const protocol = /^(?:a=)?candidate:\S+ \d+ (\w+)/i.exec(candidate.trim())?.[1]?.toLowerCase();
  return { ...(type ? { type } : {}), ...(protocol ? { protocol } : {}) };
}

/**
 * A socket message as a line holds it: a full state by its size and areas, anything else
 * as it is, through the same rules as every field.
 */
export function messageSummary(message: unknown, bytes?: number): unknown {
  if (typeof message !== "object" || message === null) return message;
  const { type } = message as { type?: unknown };
  if (type !== "state") return message;
  const { state, tab } = message as { state?: unknown; tab?: unknown };
  const areas = typeof state === "object" && state !== null ? Object.keys(state) : [];
  return {
    type,
    ...(typeof tab === "string" ? { tab } : {}),
    bytes: bytes ?? JSON.stringify(message).length,
    areas,
  };
}

/** The fixed name of the page or API address `pathname` is, with the ids it names. */
export interface Route {
  route: string;
  room?: string;
  member?: string;
  device?: string;
}

/** The addresses that name something, each with what its `:named` segments are. Invite codes are named and left out. */
const ROUTES = [
  "/r/:room",
  "/invite/:invite",
  "/api/invites/:invite",
  "/api/rooms/:room",
  "/api/socket/:room",
  "/api/me/devices/:device",
  "/api/owner/rooms/:room",
  "/api/owner/invites/:invite",
  "/api/owner/people/:member/rooms/:room",
  "/api/owner/people/:member/devices/:device",
  "/api/owner/people/:member/invite",
  "/api/owner/people/:member",
].map((pattern) => pattern.split("/").filter(Boolean));

/**
 * The route `pathname` is: its pattern, such as `/r/:room`, and the room, member or
 * device it names. Any other address is its own route, with long segments that may be
 * codes left out.
 */
export function routeOf(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  for (const pattern of ROUTES) {
    if (pattern.length !== parts.length) continue;
    const ids: Record<string, string> = {};
    const matched = pattern.every((expected, i) => {
      if (!expected.startsWith(":")) return expected === parts[i];
      ids[expected.slice(1)] = parts[i]!;
      return true;
    });
    if (!matched) continue;
    const { room, member, device } = ids;
    return {
      route: `/${pattern.join("/")}`,
      ...(room ? { room: decode(room) } : {}),
      ...(member ? { member: decode(member) } : {}),
      ...(device ? { device: decode(device) } : {}),
    };
  }
  const masked = parts.map((part) => (/^[A-Za-z0-9_-]{16,}$/.test(part) ? ":code" : part));
  return { route: `/${masked.join("/")}`.slice(0, 200) };
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function clean(value: unknown, secrets: readonly string[], depth: number, key?: string): unknown {
  if (typeof value === "string") {
    if (key !== undefined && SDP_KEYS.has(key.toLowerCase())) return sdpSummary(value);
    if (key?.toLowerCase() === "candidate") return candidateSummary(value);
    return cleanString(value, secrets, key);
  }
  if (value instanceof Error) {
    return clean(errorFields(value), secrets, depth, key);
  }
  if (typeof value !== "object" || value === null) {
    return typeof value === "bigint" ? String(value) : typeof value === "function" ? undefined : value;
  }
  if (depth >= MAX_DEPTH) return "[too deep]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => clean(item, secrets, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `[${value.length - MAX_ITEMS} more]`] : items;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(value as Record<string, unknown>)) {
    const normal = name.toLowerCase().replace(/[-_]/g, "");
    // A string invite code; a close code, a number, stays.
    if (NEVER_KEYS.has(normal) || (normal === "code" && typeof field === "string")) {
      cleaned[name] = LEFT_OUT;
      continue;
    }
    // An object that is an ICE candidate keeps only what says how it connects.
    if (normal === "candidate" && typeof field === "object" && field !== null) {
      cleaned[name] = pick(field as Record<string, unknown>, ["type", "candidateType", "protocol", "relayProtocol"]);
      continue;
    }
    const kept = clean(field, secrets, depth + 1, name);
    if (kept !== undefined) cleaned[name] = kept;
  }
  return cleaned;
}

function pick(from: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.filter((name) => typeof from[name] === "string").map((name) => [name, from[name]]));
}

/**
 * A string with what must never be stored taken out: known secrets, invite codes in
 * addresses, device cookies, SDP and candidate lines, and IP addresses.
 */
function cleanString(value: string, secrets: readonly string[], key?: string): string | ReturnType<typeof sdpSummary> {
  if (/^v=0\b/.test(value)) return sdpSummary(value);
  let text = value;
  for (const secret of secrets) text = text.split(secret).join(LEFT_OUT);
  text = text
    // Invite codes, wherever an address carries one, but not one already left out: a
    // tab's line goes through here again when the instance writes it.
    .replace(/(\/invites?\/)(?!\[left out\])[^/?#\s"']+/g, `$1${LEFT_OUT}`)
    // A device cookie's token.
    .replace(/(device=)[^;\s"']+/g, `$1${LEFT_OUT}`)
    // A candidate, as an SDP line or on its own: its type and protocol only.
    .replace(/(?:a=)?candidate:\S+ \d+ (\w+) \d+ \S+ \d+ typ (\w+)(?: raddr \S+ rport \d+)?/gi, "candidate $2 $1")
    // IPv4 addresses, but not version numbers such as Chrome/146.0.0.0.
    .replace(/(?<![\w./:-])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, "[address]")
    // IPv6 addresses, written with a `::` or eight groups.
    .replace(/(?<![\w:])(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?(?![\w:])/gi, "[address]")
    .replace(/(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi, "[address]");
  // A stack or a media server's answer is kept in full; anything else is cut short.
  const limit = key === "stack" || key === "body" ? MAX_STRING * 4 : MAX_STRING;
  return text.length > limit ? `${text.slice(0, limit)}[cut]` : text;
}
