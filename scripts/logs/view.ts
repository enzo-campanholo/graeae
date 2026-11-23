// Reads a file `pnpm logs` saved, in one of a few fixed views, so an evening is followed
// without writing jq. One line per event, its time in UTC to the millisecond; an SDP's
// sections show as `mid:direction`, and an id as its first 8 characters.
//
//   pnpm logs:view <file> tabs                     every tab: its member's name, when, how many events
//   pnpm logs:view <file> tab <tab id or name>     one tab's events and the instance's about it, in order
//   pnpm logs:view <file> calls [connection id]    every media server call: op, ok, mids, error
//   pnpm logs:view <file> failures                 failed calls and every failing event, counted
//
// `tab` leaves out statistics and socket messages; `--all` keeps them. A name matches
// every tab its member opened. The lines are the file's `.source`, as CLAUDE.md's "Logs"
// describes.

import { readFileSync } from "node:fs";

type Line = Record<string, unknown> & { at: number; source: string; event: string; tab?: string };

const [file, view, ...rest] = process.argv.slice(2).filter((arg) => arg !== "--all");
const all = process.argv.includes("--all");
if (!file || !view) fail("usage: pnpm logs:view <file> tabs | tab <tab or name> | calls [connection] | failures [--all]");

const lines: Line[] = readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((text) => (JSON.parse(text) as { source?: Line }).source)
  .filter((line): line is Line => typeof line?.at === "number" && typeof line.event === "string");

/** Each tab's member's display name, from the instance's `ws.open`. */
const names = new Map<string, string>();
for (const line of lines) {
  if (line.source === "instance" && line.event === "ws.open" && line.tab && typeof line.name === "string") names.set(line.tab, line.name);
}

const FAILING = /fail|error|refused|lost|unavailable|silent|dropped/;
const NOISE = /^(stats|ws\.in|ws\.out|pc\.pair)$/;
const IDS = new Set(["at", "source", "event", "page", "member", "device", "room", "tab", "up"]);

switch (view) {
  case "tabs": {
    const tabs = new Map<string, Line[]>();
    for (const line of lines) if (line.tab) tabs.set(line.tab, [...(tabs.get(line.tab) ?? []), line]);
    for (const [tab, own] of tabs) {
      console.log(`${short(tab)}  ${time(own[0]!.at)}–${time(own.at(-1)!.at)}  ${String(own.length).padStart(5)} events  ${names.get(tab) ?? "?"}`);
    }
    break;
  }
  case "tab": {
    const wanted = rest[0] ?? fail("which tab: its id, the start of it, or its member's name");
    const tabs = new Set([...new Set(lines.map((line) => line.tab))].filter((tab): tab is string => !!tab && (tab.startsWith(wanted) || names.get(tab) === wanted)));
    if (tabs.size === 0) fail(`no tab ${wanted}: see \`tabs\``);
    for (const line of lines) {
      if (!line.tab || !tabs.has(line.tab) || (!all && NOISE.test(line.event))) continue;
      console.log(`${time(line.at)} ${tabs.size > 1 ? short(line.tab) + " " : ""}${line.source === "tab" ? "tab " : "inst"} ${line.event.padEnd(22)} ${fields(line)}`);
    }
    break;
  }
  case "calls": {
    for (const line of lines) {
      if (line.event !== "media-server") continue;
      if (rest[0] && !String(line.connection ?? "").startsWith(rest[0])) continue;
      const tracks = Array.isArray(line.tracks) ? line.tracks.map((track: { mid?: string }) => track.mid ?? "?").join(",") : "";
      const offer = sections(line.offer);
      const answer = sections(line.answer);
      const error = line.ok === false ? `${line.status ?? ""} ${text(line.error) || text(line.body)}` : "";
      console.log(
        [time(line.at), String(line.op).padEnd(11), line.ok === false ? "FAIL" : "ok  ", short(line.connection), `tracks ${tracks || "-"}`, offer && `offer ${offer}`, answer && `answer ${answer}`, error]
          .filter(Boolean)
          .join("  "),
      );
    }
    break;
  }
  case "failures": {
    const counted = new Map<string, number>();
    for (const line of lines) {
      const failed = line.event === "media-server" ? line.ok === false : FAILING.test(line.event);
      if (!failed) continue;
      const key = line.event === "media-server" ? `media-server ${line.op} ${line.status ?? ""} ${text(line.error) || text(line.body)}` : `${line.source} ${line.event} ${text(line.why ?? line.reason ?? line.error)}`;
      const shown = key.replace(/[0-9a-f]{32,}/g, "<id>").slice(0, 160);
      counted.set(shown, (counted.get(shown) ?? 0) + 1);
    }
    for (const [key, count] of [...counted].sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(5)}  ${key}`);
    break;
  }
  default:
    fail(`no view ${view}: tabs, tab, calls or failures`);
}

function fields(line: Line): string {
  const kept = Object.entries(line)
    .filter(([key]) => !IDS.has(key))
    .map(([key, value]) => `${key}=${sections(value) || (typeof value === "string" && /^[0-9a-f-]{32,}$/.test(value) ? short(value) : text(value))}`);
  return kept.join(" ").slice(0, 240);
}

/** An SDP as the log keeps it, by its sections: `0:sendonly 1:inactive`. */
function sections(value: unknown): string {
  const media = (value as { media?: { mid?: string; direction?: string; port?: number }[] } | undefined)?.media;
  return Array.isArray(media) ? media.map((one) => `${one.mid}:${one.direction}`).join(" ") : "";
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function short(id: unknown): string {
  return typeof id === "string" ? id.slice(0, 8) : "-";
}

function time(at: number): string {
  return new Date(at).toISOString().slice(11, 23);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
