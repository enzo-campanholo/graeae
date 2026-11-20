// The instance's log: every line it writes, its own and its tabs' (ticket 48). Each is one
// JSON object built by `src/shared/log.ts`, which lists the events and leaves out what
// must never be stored, written with `console.log`, `console.warn` or `console.error` by
// its level, so Workers Logs keeps and indexes it. The instance's secrets are left out by
// their value too, wherever they turn up.
//
// A tab's events arrive in batches (`src/shared/socket/log.ts`) and are written here, one
// line each, tagged from where they came: the socket's member, device, tab and room, or
// the remembered device that posted them. What the tab says of those is dropped.
//
// Under Seam 1, `logControl.capture` keeps the lines in memory instead, so the test
// output stays readable and a test can read them; nothing in the instance uses it.

import { errorFields, logLine, type LogFields, type LogLevel, type LogLine } from "../shared/log.ts";
import { MAX_BATCH_BYTES, MAX_BATCH_EVENTS } from "../shared/socket/log.ts";

/** Where lines go: the console, or a test's memory. */
type Sink = (level: LogLevel, line: LogLine) => void;

const toConsole: Sink = (level, line) => {
  // A test build writes every line to standard output, with its level in the line: Seam 2
  // shows the app's standard error, which would fill with the journeys' own problems.
  if (__GRAEAE_FAKE_MEDIA__) {
    console.log(JSON.stringify(level === "info" ? line : { ...line, level }));
    return;
  }
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
};

let sink: Sink = toConsole;
let secrets: string[] = [];

/** The ids a line from a tab is tagged with, from the instance's own knowledge of it. */
export interface TabTags {
  member: string;
  device: string;
  tab?: string;
  room?: string;
}

/** Fields only the instance sets on a tab's line, whatever the tab says. */
const TAGS = ["source", "member", "device", "tab", "room"] as const;

const EVENT_NAME = /^[a-z][a-z0-9.-]{0,63}$/;

/** The most one event of a tab's may weigh, as JSON, before it is written as a stub. */
const MAX_EVENT_BYTES = 32 * 1024;

/** The instance's log: its own lines, and its tabs' batches. */
export const log = {
  info(event: string, fields?: LogFields) {
    write("info", "instance", event, fields);
  },
  warn(event: string, fields?: LogFields) {
    write("warn", "instance", event, fields);
  },
  /** A problem; with `error`, its name, message and stack. */
  error(event: string, error?: unknown, fields?: LogFields) {
    write("error", "instance", event, error === undefined ? fields : { ...fields, error: errorFields(error) });
  },

  /** Leaves the values of `env`'s secrets out of every line from now on. */
  knowSecrets(env: Partial<Record<"SETUP_SECRET" | "SFU_APP_SECRET" | "TURN_KEY_ID" | "TURN_KEY_TOKEN", string>>) {
    secrets = [env.SETUP_SECRET, env.SFU_APP_SECRET, env.TURN_KEY_ID, env.TURN_KEY_TOKEN].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  },

  /**
   * Writes the events of a tab's batch `request` as lines tagged `tags`. Malformed events
   * and fields the instance sets are dropped; a batch that came with drops, or had to be
   * cut, says so in a line of its own. False when `request` is no batch at all.
   */
  tabBatch(tags: TabTags, request: unknown, size?: number): boolean {
    if (typeof request !== "object" || request === null) return false;
    const { type, events, dropped } = request as { type?: unknown; events?: unknown; dropped?: unknown };
    if (type !== "events" || !Array.isArray(events)) return false;
    if (size !== undefined && size > MAX_BATCH_BYTES) {
      write("warn", "instance", "tab.batch", { ...tags, why: "too large", bytes: size, events: events.length });
      return true;
    }
    let malformed = 0;
    for (const event of events.slice(0, MAX_BATCH_EVENTS)) {
      if (!writeTabEvent(tags, event)) malformed += 1;
    }
    const cut = Math.max(0, events.length - MAX_BATCH_EVENTS);
    const drops = typeof dropped === "number" && Number.isSafeInteger(dropped) && dropped > 0 ? dropped : 0;
    if (malformed > 0 || cut > 0 || drops > 0) {
      write("warn", "instance", "tab.batch", { ...tags, malformed, cut, dropped: drops });
    }
    return true;
  },
};

function writeTabEvent(tags: TabTags, event: unknown): boolean {
  if (typeof event !== "object" || event === null || Array.isArray(event)) return false;
  const fields = { ...(event as Record<string, unknown>) };
  const name = fields.event;
  if (typeof name !== "string" || !EVENT_NAME.test(name)) return false;
  const level: LogLevel = fields.level === "warn" || fields.level === "error" ? fields.level : "info";
  const at = typeof fields.at === "number" && Number.isFinite(fields.at) ? fields.at : undefined;
  for (const key of [...TAGS, "event", "level", "at"]) delete fields[key];
  const tagged = { ...fields, ...tags };
  if (JSON.stringify(tagged).length > MAX_EVENT_BYTES) {
    write(level, "tab", name, { ...tags, page: fields.page, up: fields.up, truncated: true }, at);
    return true;
  }
  write(level, "tab", name, tagged, at);
  return true;
}

function write(level: LogLevel, source: "instance" | "tab", event: string, fields?: LogFields, at?: number) {
  try {
    sink(level, logLine(source, event, fields, { secrets, ...(at === undefined ? {} : { at }) }));
  } catch {
    // A line that cannot be written is not worth failing the request it describes.
  }
}

/** For the tests: keeps the lines in memory rather than writing them. */
export const logControl = {
  /** From now on, lines go to the list returned, and to the console no more. */
  capture(): LogLine[] {
    const lines: LogLine[] = [];
    sink = (level, line) => lines.push(level === "info" ? line : { ...line, level });
    return lines;
  },
};
