// Reads a chrome://webrtc-internals dump and prints, for each peer connection and each
// stream it sends or receives (outbound-rtp and inbound-rtp, audio and video), one row per
// `--every` seconds: frame size, frames per second, kbps, frames encoded or decoded,
// freezes, packets lost, jitter, key frames decoded, why the encoder is holding back, the
// codec and the encoder or decoder. So the numbers an owner sees in webrtc-internals come
// from the saved file, not from screenshots or a reading out loud.
//
//   node scripts/real-media/webrtc-dump.ts <dump.json> [--every <seconds>]   (inside nix-shell)
//
// The owner saves the dump in the browser that shared or watched: open chrome://webrtc-internals
// (edge://webrtc-internals in Edge) while the call runs, open "Create a dump" and press
// "Download the PeerConnection updates and stats data". The file holds the room's addresses
// and the tab's media details, so read it from where the owner hands it over: a
// `request_secret` with `delivery: "file"`, or an attachment's path.
//
// The dump's `PeerConnections.<id>.stats` holds one series per `<stat id>-<field>`, with the
// stat's `statsType`, `startTime`, `endTime` and its `values`, a JSON-encoded array sampled
// evenly between the two times (once a second by default).

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

interface Series {
  statsType: string;
  startTime: string;
  endTime: string;
  values: string;
}

interface Dump {
  PeerConnections?: Record<string, { url?: string; stats?: Record<string, Series> }>;
}

/** One field of one stat over time, its samples' times in ms. */
interface Samples {
  times: number[];
  values: unknown[];
}

interface Stat {
  type: string;
  fields: Map<string, Samples>;
}

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: { every: { type: "string", default: "1" } },
});
const file = positionals[0];
const every = Number(options.every) * 1000;
if (!file || !(every > 0)) {
  console.error("usage: node scripts/real-media/webrtc-dump.ts <dump.json> [--every <seconds>]");
  process.exit(2);
}

const dump = JSON.parse(readFileSync(file, "utf8")) as Dump;
const connections = Object.entries(dump.PeerConnections ?? {});
if (connections.length === 0) {
  console.error(`${file} holds no PeerConnections: is it a webrtc-internals dump?`);
  process.exit(1);
}

for (const [id, connection] of connections) {
  const stats = statsOf(connection.stats ?? {});
  const streams = [...stats].filter(([, stat]) => stat.type === "inbound-rtp" || stat.type === "outbound-rtp");
  console.log(`\n== peer connection ${id}${connection.url ? ` (${connection.url})` : ""}: ${streams.length} streams`);
  for (const [statId, stat] of streams) printStream(statId, stat, stats);
}

/** The dump's series, gathered by stat: `<stat id>-<field>`, split at the last dash. */
function statsOf(series: Record<string, Series>): Map<string, Stat> {
  const stats = new Map<string, Stat>();
  for (const [key, entry] of Object.entries(series)) {
    const dash = key.lastIndexOf("-");
    if (dash <= 0 || typeof entry.values !== "string") continue;
    const statId = key.slice(0, dash);
    const values = JSON.parse(entry.values) as unknown[];
    const start = Date.parse(entry.startTime);
    const end = Date.parse(entry.endTime);
    const step = values.length > 1 ? (end - start) / (values.length - 1) : 0;
    const stat = stats.get(statId) ?? { type: entry.statsType, fields: new Map() };
    stat.fields.set(key.slice(dash + 1), { times: values.map((_, i) => start + i * step), values });
    stats.set(statId, stat);
  }
  return stats;
}

/** A field's last value at or before `at`. */
function valueAt(stat: Stat | undefined, field: string, at: number): unknown {
  const samples = stat?.fields.get(field);
  if (!samples) return undefined;
  let found: unknown;
  for (let i = 0; i < samples.times.length && samples.times[i]! <= at; i++) found = samples.values[i];
  return found;
}

function printStream(statId: string, stat: Stat, stats: Map<string, Stat>) {
  const inbound = stat.type === "inbound-rtp";
  const bytesField = inbound ? "bytesReceived" : "bytesSent";
  const bytes = stat.fields.get(bytesField);
  const kind = String(lastOf(stat, "kind") ?? lastOf(stat, "mediaType") ?? "?");
  console.log(`\n${stat.type} ${kind} ${statId} ssrc ${String(lastOf(stat, "ssrc") ?? "?")}`);
  if (!bytes || bytes.times.length === 0) {
    console.log("  no samples");
    return;
  }

  const columns: { name: string; value: (at: number, before: number) => unknown }[] = [
    { name: "s", value: (at) => Math.round((at - bytes.times[0]!) / 1000) },
    {
      name: "size",
      value: (at) => {
        const width = valueAt(stat, "frameWidth", at);
        return width === undefined ? undefined : `${String(width)}x${String(valueAt(stat, "frameHeight", at))}`;
      },
    },
    { name: "fps", value: (at) => valueAt(stat, "framesPerSecond", at) },
    {
      name: "kbps",
      value: (at, before) => {
        const now = Number(valueAt(stat, bytesField, at));
        const then = Number(valueAt(stat, bytesField, before));
        return at > before && Number.isFinite(now) && Number.isFinite(then) ? Math.round(((now - then) * 8) / (at - before)) : undefined;
      },
    },
    { name: inbound ? "decoded" : "encoded", value: (at) => valueAt(stat, inbound ? "framesDecoded" : "framesEncoded", at) },
    { name: "freezes", value: (at) => valueAt(stat, "freezeCount", at) },
    { name: "lost", value: (at) => valueAt(stat, "packetsLost", at) },
    { name: "jitter", value: (at) => valueAt(stat, "jitter", at) },
    { name: "keys", value: (at) => valueAt(stat, "keyFramesDecoded", at) },
    { name: "limit", value: (at) => valueAt(stat, "qualityLimitationReason", at) },
    {
      name: "codec",
      value: (at) => {
        const codecId = valueAt(stat, "codecId", at);
        return typeof codecId === "string" ? valueAt(stats.get(codecId), "mimeType", at) : undefined;
      },
    },
    { name: inbound ? "decoder" : "encoder", value: (at) => valueAt(stat, inbound ? "decoderImplementation" : "encoderImplementation", at) },
  ];

  const first = bytes.times[0]!;
  const last = bytes.times.at(-1)!;
  const times: number[] = [];
  for (let at = first; at <= last; at += every) times.push(at);
  // The last sample gets a row of its own when `--every` steps past it.
  if (times.at(-1)! < last) times.push(last);
  const rows = times.map((at, i) => columns.map((column) => format(column.value(at, times[i - 1] ?? at))));
  // A column empty in every row (frames for audio, jitter for a sender) is left out.
  const shown = columns.map((_, i) => rows.some((row) => row[i] !== "")).map((kept, i) => (i === 0 ? true : kept));
  const table = [columns.map((column) => column.name), ...rows].map((row) => row.filter((_, i) => shown[i]));
  const widths = table[0]!.map((_, i) => Math.max(...table.map((row) => row[i]!.length)));
  for (const row of table) console.log(`  ${row.map((cell, i) => cell.padStart(widths[i]!)).join("  ")}`);
}

function lastOf(stat: Stat, field: string): unknown {
  return stat.fields.get(field)?.values.at(-1);
}

function format(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  return String(value);
}
