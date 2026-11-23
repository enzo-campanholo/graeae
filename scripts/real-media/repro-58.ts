// Ticket 58's repro on a deployed instance: a sharer who has stopped shares watches
// nothing. Not a test: it calls Cloudflare's media server, which `pnpm test` never does.
//
//   nix-shell --run 'node scripts/real-media/repro-58.ts --sharer <invite file> --watcher <invite file> [--steps "share share watch"] [--runs 1]'
//
// Two members (`member.ts`, fake webcams) in one room. The watcher shares its webcam. For
// each run the sharer loads the room afresh and does `--steps` in turn: "share" shares its
// webcam and stops it, "watch" watches the watcher's webcam for --watch seconds (default 6),
// reads its connection's stats, and stops watching.
//
// Exit 0: every watch decoded frames. Exit 1: a watch decoded none (the bug). Exit 2: the
// rig itself failed (a command, a share that never went live), so no verdict.
//
// Needs a display: start scripts/real-media/desktop.sh and pass its DISPLAY and
// PULSE_SERVER in the environment.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    sharer: { type: "string" },
    watcher: { type: "string" },
    "sharer-name": { type: "string", default: "Sharer58" },
    "watcher-name": { type: "string", default: "Watcher58" },
    steps: { type: "string", default: "share share watch" },
    runs: { type: "string", default: "1" },
    watch: { type: "string", default: "6" },
    dump: { type: "string" },
    "sharer-arg": { type: "string", multiple: true, default: [] },
    before: { type: "string", multiple: true, default: [] },
  },
});
if (!options.sharer || !options.watcher) {
  console.error("usage: node scripts/real-media/repro-58.ts --sharer <invite file> --watcher <invite file> [--steps 'share share watch'] [--runs N]");
  process.exit(2);
}
/** What the sharer does each run: "share" is a share and its stop, "watch" a watch for --watch seconds and its unwatch. */
const STEPS = options.steps!.split(/[\s,]+/).filter(Boolean);
if (STEPS.some((step) => step !== "share" && step !== "watch")) throw new Error("--steps takes share and watch");
const RUNS = Number(options.runs);
/** --before <n>=<js>: JS the sharer's page runs before step n (from 1), to try a change in place. */
const BEFORE = new Map(options.before!.map((hook) => [Number(hook.slice(0, hook.indexOf("="))), hook.slice(hook.indexOf("=") + 1)]));
const WATCH_MS = Number(options.watch) * 1000;

class NoVerdict extends Error {}

/** One member.ts, driven over stdin, its lines read from stdout. */
class Member {
  private process: ChildProcessWithoutNullStreams;
  private lines: string[] = [];
  private waiters: Array<() => void> = [];

  readonly label: string;

  constructor(label: string, file: string, position: string, chromiumArgs: string[] = []) {
    this.label = label;
    this.process = spawn("node", ["scripts/real-media/member.ts", "--url-file", file, "--name", label, "--webcam", "fake", "--every", "0", "--position", position, ...chromiumArgs.map((arg) => `--chromium-arg=${arg}`)], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const stream of [this.process.stdout, this.process.stderr]) {
      createInterface({ input: stream }).on("line", (line) => {
        this.lines.push(line);
        if (process.env.GRAEAE_REPRO_LOG_DIR) appendFileSync(join(process.env.GRAEAE_REPRO_LOG_DIR, `${label}.log`), `${line}\n`);
        if (process.env.GRAEAE_REPRO_VERBOSE) console.log(`  | ${line}`);
        if (/ failed: | page exception: /.test(line)) console.log(`  ! ${line}`);
        for (const wake of this.waiters.splice(0)) wake();
      });
    }
    this.process.on("exit", () => {
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  /** Waits for a line matching `pattern` after line `from`; returns it. */
  async line(pattern: RegExp, ms: number, from = 0): Promise<string> {
    const until = Date.now() + ms;
    for (;;) {
      const found = this.lines.slice(from).find((line) => pattern.test(line));
      if (found) return found;
      const failed = this.lines.slice(from).find((line) => / failed: /.test(line));
      if (failed) throw new NoVerdict(`${this.label}: ${failed}`);
      if (this.process.exitCode !== null) throw new NoVerdict(`${this.label} exited`);
      const left = until - Date.now();
      if (left <= 0) throw new NoVerdict(`${this.label}: no line ${pattern} in ${ms} ms`);
      await new Promise<void>((wake) => {
        const timer = setTimeout(wake, left);
        this.waiters.push(() => (clearTimeout(timer), wake()));
      });
    }
  }

  /** Runs one command and waits for its echo and the next command's turn (a `wait 0` after it). */
  async run(command: string, ms = 30_000): Promise<void> {
    const from = this.lines.length;
    const marker = `wait 0.0${Math.floor(Math.random() * 1e6)}`;
    this.process.stdin.write(`${command}\n${marker}\n`);
    await this.line(new RegExp(`> ${marker.replace(/\./g, "\\.")}$`), ms, from);
    const failed = this.lines.slice(from).find((line) => / failed: /.test(line));
    if (failed) throw new NoVerdict(`${this.label}: ${failed}`);
  }

  /** Evaluates `js` in the page; returns its JSON value. */
  async eval<T>(js: string): Promise<T> {
    const from = this.lines.length;
    this.process.stdin.write(`eval ${js.replace(/\n/g, " ")}\n`);
    const echo = await this.line(/ > eval /, 30_000, from);
    const at = this.lines.indexOf(echo, from);
    const answer = await this.line(new RegExp(`^\\S+ ${this.label} ([[{"\\d-]|true|false|null)`), 30_000, at + 1);
    if (/ failed: /.test(answer)) throw new NoVerdict(`${this.label}: ${answer}`);
    return JSON.parse(answer.replace(/^\S+ \S+ /, "")) as T;
  }

  /** Polls `js` until it is truthy. */
  async until(js: string, ms: number, what: string): Promise<void> {
    const until = Date.now() + ms;
    while (!(await this.eval<boolean>(js))) {
      if (Date.now() > until) throw new NoVerdict(`${this.label}: never ${what}`);
      await new Promise((wake) => setTimeout(wake, 500));
    }
  }

  quit() {
    this.process.stdin.end("quit\n");
  }
}

/** The page's media connection: each transceiver, and each inbound and outbound video stream. */
const READ = `(async () => {
  const out = [];
  for (const c of window.__realMedia.connections) {
    if (c.connectionState === "closed") continue;
    const stats = [...(await c.getStats()).values()];
    out.push({
      state: c.connectionState,
      received: stats.filter((s) => s.type === "transport").reduce((sum, s) => sum + (s.bytesReceived ?? 0), 0),
      transceivers: c.getTransceivers().map((t) => ({ mid: t.mid, kind: t.receiver.track.kind, direction: t.direction, current: t.currentDirection, stopped: t.stopped, muted: t.receiver.track.muted, recvCodecs: t.receiver.getParameters().codecs.map((x) => x.payloadType + " " + x.mimeType), sources: t.receiver.getSynchronizationSources().length })),
      inbound: stats.filter((s) => s.type === "inbound-rtp" && s.kind === "video").map((s) => ({ mid: s.mid, ssrc: s.ssrc, frames: s.framesDecoded ?? 0, bytes: s.bytesReceived ?? 0, packets: s.packetsReceived ?? 0, received: s.framesReceived ?? 0, keyFrames: s.keyFramesDecoded ?? 0, dropped: s.framesDropped ?? 0, plis: s.pliCount ?? 0, firs: s.firCount ?? 0, nacks: s.nackCount ?? 0, codec: stats.find((c) => c.id === s.codecId)?.mimeType, track: s.trackIdentifier })),
      outbound: stats.filter((s) => s.type === "outbound-rtp" && s.kind === "video").map((s) => ({ mid: s.mid, active: s.active, frames: s.framesEncoded ?? 0 })),
    });
  }
  return out;
})()`;

interface Reading {
  state: string;
  received: number;
  transceivers: Array<{ mid: string | null; kind: string; direction: string; current: string | null; stopped: boolean; muted: boolean; recvCodecs: string[]; sources: number }>;
  inbound: Array<{ mid: string; ssrc: number; frames: number; bytes: number; packets: number; received: number; keyFrames: number; dropped: number; plis: number; firs: number; nacks: number; codec?: string; track?: string }>;
  outbound: Array<{ mid: string; active: boolean; frames: number }>;
}

const label = (name: string) => `[aria-label=${JSON.stringify(name)}]`;
const has = (name: string) => `!!document.querySelector(${JSON.stringify(label(name))})`;
const sharing = has("Stop sharing your webcam");

/** The connection's descriptions now, for --dump. */
const SDP = `window.__realMedia.connections.filter((c) => c.connectionState !== "closed").map((c) => ({ remote: c.currentRemoteDescription?.sdp, local: c.currentLocalDescription?.sdp }))`;

/** The sharer's outbound video stream that is encoding now, by mid. */
async function liveOut(member: Member): Promise<string | undefined> {
  const before = await member.eval<Reading[]>(READ);
  await new Promise((wake) => setTimeout(wake, 1000));
  const after = await member.eval<Reading[]>(READ);
  const was = new Map(before.flatMap((r) => r.outbound).map((o) => [o.mid, o.frames]));
  return after.flatMap((r) => r.outbound).find((o) => o.frames > (was.get(o.mid) ?? 0))?.mid;
}

const sharerName = options["sharer-name"]!;
const watcherName = options["watcher-name"]!;
const watcher = new Member(watcherName, options.watcher, "0,0");
const sharer = new Member(sharerName, options.sharer, "960,0", options["sharer-arg"]);
let verdict = 0;
try {
  await Promise.all([watcher.line(/ in the room at /, 60_000), sharer.line(/ in the room at /, 60_000)]);
  if (!(await watcher.eval<boolean>(sharing))) await watcher.run("share webcam");
  await watcher.until(sharing, 30_000, "went live");
  console.log(`${watcherName}'s webcam is live`);

  for (let run = 1; run <= RUNS; run++) {
    await sharer.run("reload", 60_000);
    await sharer.until(has(`Watch ${watcherName}'s webcam`), 30_000, `saw ${watcherName}'s webcam to watch`);
    const published: string[] = [];
    const watches: string[] = [];
    let shares = 0;
    for (const [index, step] of STEPS.entries()) {
      const hook = BEFORE.get(index + 1);
      if (hook) console.log(`  before step ${index + 1}: ${JSON.stringify(await sharer.eval(hook))}`);
      if (step === "share") {
        shares++;
        await sharer.run("share webcam");
        await sharer.until(sharing, 30_000, `went live (share ${shares})`);
        await new Promise((wake) => setTimeout(wake, 2000));
        const mid = await liveOut(sharer);
        if (mid === undefined) throw new NoVerdict(`${sharerName}'s share ${shares} encoded nothing`);
        published.push(mid);
        await sharer.run("stop webcam");
        await sharer.until(`!${sharing}`, 30_000, `stopped (share ${shares})`);
        await new Promise((wake) => setTimeout(wake, 1500));
        continue;
      }
      const before = await sharer.eval<Reading[]>(READ);
      await sharer.run(`watch "${watcherName}" webcam`);
      await new Promise((wake) => setTimeout(wake, WATCH_MS));
      const after = await sharer.eval<Reading[]>(READ);
      if (options.dump) {
        mkdirSync(options.dump, { recursive: true });
        const file = join(options.dump, `run${run}-watch${watches.length + 1}.json`);
        writeFileSync(file, JSON.stringify({ steps: STEPS, before, after, descriptions: await sharer.eval(SDP) }, null, 2));
      }
      await sharer.run(`unwatch "${watcherName}" webcam`);
      await new Promise((wake) => setTimeout(wake, 1500));

      const mids = new Set(before.flatMap((r) => r.transceivers.map((t) => `${t.mid}:${t.current}`)));
      const placed = after.flatMap((r) => r.transceivers).filter((t) => t.current === "recvonly" && t.kind === "video" && !mids.has(`${t.mid}:${t.current}`));
      const was = new Map(before.flatMap((r) => r.inbound).map((i) => [i.ssrc, i.frames]));
      const decoded = after.flatMap((r) => r.inbound).reduce((sum, i) => sum + i.frames - (was.get(i.ssrc) ?? 0), 0);
      if (decoded === 0) verdict = 1;
      const where = placed.map((t) => `${t.mid}${published.includes(t.mid!) ? " (published on)" : ""}`).join(", ") || "?";
      const received = after.reduce((sum, r) => sum + r.received, 0) - before.reduce((sum, r) => sum + r.received, 0);
      const inbound = after.flatMap((r) => r.inbound).map((i) => `mid ${i.mid} ${i.packets - (before.flatMap((b) => b.inbound).find((b) => b.ssrc === i.ssrc)?.packets ?? 0)} packets ${i.received} received ${i.keyFrames} key ${i.dropped} dropped ${i.plis} PLI ${i.firs} FIR ${i.nacks} NACK ${i.codec ?? "no codec"}`).join(", ") || "none";
      watches.push(`watch ${watches.length + 1} after ${shares} shares: mid ${where}, ${decoded} frames (transport +${Math.round(received / 1024)} KiB; inbound ${inbound})${decoded === 0 ? " RED" : ""}`);
    }
    console.log(`run ${run}: shares in mids [${published.join(", ")}]; ${watches.join("; ")} → ${watches.some((w) => w.includes(" RED")) ? "RED" : "green"}`);
  }
} catch (error) {
  if (!(error instanceof NoVerdict)) throw error;
  console.log(`no verdict: ${error.message}`);
  verdict = 2;
} finally {
  sharer.quit();
  watcher.quit();
}
process.exitCode = verdict;
