// Drives `member.ts` members from a script, for the red loops on a deployed instance
// (`repro-58.ts`, `repro-59.ts`): each member is one member.ts process, fed commands on
// stdin and read from its lines. Not a test: the members call Cloudflare's media server.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

/** The rig itself failed (a command, a share that never went live): no verdict. */
export class NoVerdict extends Error {}

/** One member.ts, driven over stdin, its lines read from stdout. */
export class Member {
  private process: ChildProcessWithoutNullStreams;
  private lines: string[] = [];
  private waiters: Array<() => void> = [];

  readonly label: string;

  /** `args` go to member.ts after its own: `--chromium-arg=…`, `--fake-h264 …` and the like. */
  constructor(label: string, file: string, position: string, args: string[] = []) {
    this.label = label;
    this.process = spawn("node", ["scripts/real-media/member.ts", "--url-file", file, "--name", label, "--webcam", "fake", "--every", "0", "--position", position, ...args], {
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
export const READ = `(async () => {
  const profile = (fmtp) => /profile-level-id=([0-9a-f]{6})/i.exec(fmtp ?? "")?.[1];
  const out = [];
  for (const c of window.__realMedia.connections) {
    if (c.connectionState === "closed") continue;
    const stats = [...(await c.getStats()).values()];
    const codecOf = (s) => {
      const codec = stats.find((c) => c.id === s.codecId);
      return codec ? [codec.payloadType, codec.mimeType, profile(codec.sdpFmtpLine)].filter(Boolean).join(" ") : undefined;
    };
    out.push({
      state: c.connectionState,
      received: stats.filter((s) => s.type === "transport").reduce((sum, s) => sum + (s.bytesReceived ?? 0), 0),
      transceivers: c.getTransceivers().map((t) => ({ mid: t.mid, kind: t.receiver.track.kind, direction: t.direction, current: t.currentDirection, stopped: t.stopped, muted: t.receiver.track.muted, recvCodecs: t.receiver.getParameters().codecs.map((x) => [x.payloadType, x.mimeType, profile(x.sdpFmtpLine)].filter(Boolean).join(" ")), sources: t.receiver.getSynchronizationSources().length })),
      inbound: stats.filter((s) => s.type === "inbound-rtp" && s.kind === "video").map((s) => ({ mid: s.mid, ssrc: s.ssrc, frames: s.framesDecoded ?? 0, bytes: s.bytesReceived ?? 0, packets: s.packetsReceived ?? 0, received: s.framesReceived ?? 0, keyFrames: s.keyFramesDecoded ?? 0, dropped: s.framesDropped ?? 0, plis: s.pliCount ?? 0, firs: s.firCount ?? 0, nacks: s.nackCount ?? 0, codec: codecOf(s), width: s.frameWidth, height: s.frameHeight, track: s.trackIdentifier })),
      outbound: stats.filter((s) => s.type === "outbound-rtp" && s.kind === "video").map((s) => ({ mid: s.mid, active: s.active, frames: s.framesEncoded ?? 0, codec: codecOf(s), encoder: s.encoderImplementation })),
    });
  }
  return out;
})()`;

export interface Reading {
  state: string;
  received: number;
  transceivers: Array<{ mid: string | null; kind: string; direction: string; current: string | null; stopped: boolean; muted: boolean; recvCodecs: string[]; sources: number }>;
  inbound: Array<{ mid: string; ssrc: number; frames: number; bytes: number; packets: number; received: number; keyFrames: number; dropped: number; plis: number; firs: number; nacks: number; codec?: string; width?: number; height?: number; track?: string }>;
  outbound: Array<{ mid: string; active: boolean; frames: number; codec?: string; encoder?: string }>;
}

/** A page check that an element with this accessible label is there. */
export const has = (name: string) => `!!document.querySelector(${JSON.stringify(`[aria-label=${JSON.stringify(name)}]`)})`;

/** The connection's descriptions now, for --dump. */
export const SDP = `window.__realMedia.connections.filter((c) => c.connectionState !== "closed").map((c) => ({ remote: c.currentRemoteDescription?.sdp, local: c.currentLocalDescription?.sdp }))`;

/** The member's outbound video stream that is encoding now. */
export async function liveOut(member: Member): Promise<Reading["outbound"][number] | undefined> {
  const before = await member.eval<Reading[]>(READ);
  await new Promise((wake) => setTimeout(wake, 1000));
  const after = await member.eval<Reading[]>(READ);
  const was = new Map(before.flatMap((r) => r.outbound).map((o) => [o.mid, o.frames]));
  return after.flatMap((r) => r.outbound).find((o) => o.frames > (was.get(o.mid) ?? 0));
}

/** What one watch did: its section on the receiving connection, what that section knows, and what arrived. */
export function watchSummary(before: Reading[], after: Reading[]) {
  const mids = new Set(before.flatMap((r) => r.transceivers.map((t) => `${t.mid}:${t.current}`)));
  const placed = after.flatMap((r) => r.transceivers).filter((t) => t.current === "recvonly" && t.kind === "video" && !mids.has(`${t.mid}:${t.current}`));
  const was = new Map(before.flatMap((r) => r.inbound).map((i) => [i.ssrc, i.frames]));
  const decoded = after.flatMap((r) => r.inbound).reduce((sum, i) => sum + i.frames - (was.get(i.ssrc) ?? 0), 0);
  const where = placed.map((t) => t.mid).join(", ") || "?";
  const knows = placed.map((t) => `[${t.recvCodecs.join(", ")}]`).join(" ");
  const received = after.reduce((sum, r) => sum + r.received, 0) - before.reduce((sum, r) => sum + r.received, 0);
  const inbound =
    after
      .flatMap((r) => r.inbound)
      .filter((i) => placed.length === 0 || placed.some((t) => t.mid === i.mid))
      .map((i) => `mid ${i.mid} ${i.packets - (before.flatMap((b) => b.inbound).find((b) => b.ssrc === i.ssrc)?.packets ?? 0)} packets ${i.received} received ${i.keyFrames} key ${i.dropped} dropped ${i.plis} PLI ${i.firs} FIR ${i.nacks} NACK ${i.codec ?? "no codec"}${i.width ? ` ${i.width}x${i.height}` : ""}`)
      .join(", ") || "none";
  return { red: decoded === 0, text: `receiving mid ${where} knowing ${knows || "?"}, ${decoded} frames (transport +${Math.round(received / 1024)} KiB; inbound ${inbound})${decoded === 0 ? " RED" : ""}` };
}
