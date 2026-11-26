// Ticket 68's check on a deployed instance: a watcher whose watch's pull was closed before
// its offer reached the tab (the share ended while the media server made it) can still
// watch that share once it is live again, and its other watch plays on meanwhile. Not a
// test: it calls Cloudflare's media server, which `pnpm test` never does.
//
//   nix-shell --run 'node scripts/real-media/repro-68.ts --sharer <invite file> --other <invite file> \
//     --watcher <invite file> [--offsets "0.1 0.2 0.3 0.4 0.5"] [--runs 1] [--unwatch]'
//
// Three members (`member.ts`, fake webcams) in one room. The other member shares its webcam,
// and the watcher watches it, so the watcher's receiving connection carries it throughout.
// For each run and each offset in `--offsets`, the sharer shares its webcam, the watcher
// presses Watch on it, and `offset` seconds after that click the sharer stops it: when the
// stop lands while the media server makes the watcher's pull, the instance closes the pull
// with its offer never sent, and blocks the watcher's connection (ticket 68, case A).
//
// Then the watcher's other watch is read over 5 seconds: frames decoded mean a session
// waiting for an answer still delivers what it pulled before. With `--unwatch`, the watcher
// stops watching the other member's webcam next, closing that pull on the blocked
// connection, which then carries nothing; whether that close went through is in the
// instance's lines (`watch.ended`, or `watch.close-failed`).
//
// Last, the sharer shares its webcam again and the watcher presses Watch on it once.
// 8 seconds on, the watch passes when it is on the stage and every picture the watcher
// watches decodes frames over 5 seconds, and is RED otherwise: the media server refused
// the pull into the blocked connection (406), as before this ticket.
//
// Whether a run hit the race is in the instance's lines, not the page: `media.blocked`,
// then `media.replacing` with `blocked` (or `media.dropped` with --unwatch). Each run
// prints the UTC time of its stop, for `pnpm logs` and `pnpm logs:view`.
//
// Exit 0: every watch went live. Exit 1: one did not (the bug). Exit 2: the rig itself
// failed (a command, a share that never went live), so no verdict.
//
// Needs a display: start scripts/real-media/desktop.sh and pass its DISPLAY and
// PULSE_SERVER in the environment.

import { parseArgs } from "node:util";
import { framesBetween, has, Member, NoVerdict, READ, type Reading } from "./driver.ts";

const { values: options } = parseArgs({
  options: {
    sharer: { type: "string" },
    other: { type: "string" },
    watcher: { type: "string" },
    "sharer-name": { type: "string", default: "Sharer68" },
    "other-name": { type: "string", default: "Other68" },
    "watcher-name": { type: "string", default: "Watcher68" },
    offsets: { type: "string", default: "0.1 0.2 0.3 0.4 0.5" },
    runs: { type: "string", default: "1" },
    unwatch: { type: "boolean", default: false },
  },
});
if (!options.sharer || !options.other || !options.watcher) {
  console.error(
    "usage: node scripts/real-media/repro-68.ts --sharer <invite file> --other <invite file> --watcher <invite file> [--offsets '0.1 0.2 0.3 0.4 0.5'] [--runs N] [--unwatch]",
  );
  process.exit(2);
}
const OFFSETS = options.offsets!.split(/[\s,]+/).filter(Boolean).map(Number);
const RUNS = Number(options.runs);
const sharerName = options["sharer-name"]!;
const otherName = options["other-name"]!;
const watcherName = options["watcher-name"]!;
const sharing = has("Stop sharing your webcam");
const watchingSharer = has(`Stop watching ${sharerName}'s webcam`);
const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));
const utc = () => new Date().toISOString().slice(11, 23);

/** The frames the watcher decoded over the next `ms`. */
async function framesOver(watcher: Member, ms: number): Promise<number> {
  const before = await watcher.eval<Reading[]>(READ);
  await wait(ms);
  return framesBetween(before, await watcher.eval<Reading[]>(READ));
}

/** How many of the watcher's incoming pictures decoded frames over the next `ms`. */
async function picturesOver(watcher: Member, ms: number): Promise<number> {
  const decoded = (readings: Reading[]) =>
    new Map(readings.flatMap((reading, index) => reading.inbound.map((stream) => [`${index}:${stream.ssrc}`, stream.frames])));
  const before = decoded(await watcher.eval<Reading[]>(READ));
  await wait(ms);
  return [...decoded(await watcher.eval<Reading[]>(READ))].filter(([key, frames]) => frames > (before.get(key) ?? 0)).length;
}

/** Has the watcher watch the other member's webcam, until it decodes frames. */
async function watchOther(watcher: Member) {
  await watcher.until(has(`Watch ${otherName}'s webcam`), 30_000, "saw the other webcam to watch");
  await watcher.run(`watch "${otherName}" webcam`);
  let first = 0;
  for (let tries = 0; first === 0 && tries < 12; tries++) first = await framesOver(watcher, 1000);
  if (first === 0) throw new NoVerdict(`${watcherName}'s watch of ${otherName}'s webcam decoded nothing`);
}

/** Has the sharer share its webcam, until it is live and the watcher can watch it. */
async function shareWebcam(sharer: Member, watcher: Member) {
  if (!(await sharer.eval<boolean>(sharing))) await sharer.run("share webcam");
  await sharer.until(sharing, 30_000, "went live");
  await watcher.until(has(`Watch ${sharerName}'s webcam`), 30_000, "saw the webcam to watch");
}

const sharer = new Member(sharerName, options.sharer, "0,0");
const other = new Member(otherName, options.other, "640,0");
const watcher = new Member(watcherName, options.watcher, "1280,0");
let verdict = 0;
try {
  await Promise.all([sharer, other, watcher].map((member) => member.line(/ in the room at /, 60_000)));
  if (!(await other.eval<boolean>(sharing))) await other.run("share webcam");
  await other.until(sharing, 30_000, "went live");

  for (let run = 1; run <= RUNS; run++) {
    for (const offset of OFFSETS) {
      await watcher.run("reload", 60_000);
      await watchOther(watcher);
      await shareWebcam(sharer, watcher);

      // The stop lands while the media server makes the watcher's pull, or not, by offset.
      const watching = watcher.run(`watch "${sharerName}" webcam`);
      await wait(offset * 1000);
      const stoppedAt = utc();
      await sharer.run("stop webcam");
      await watching;
      await wait(3000);

      const carried = await framesOver(watcher, 5000);
      if (options.unwatch) await watcher.run(`unwatch "${otherName}" webcam`);

      await shareWebcam(sharer, watcher);
      await watcher.run(`watch "${sharerName}" webcam`);
      await wait(8000);
      const pictures = await picturesOver(watcher, 5000);
      const expected = options.unwatch ? 1 : 2;
      const showing = await watcher.eval<boolean>(watchingSharer);
      const red = !showing || pictures < expected;
      if (red) verdict = 1;
      console.log(
        `run ${run}, stop ${offset} s after Watch (at ${stoppedAt} UTC): the other watch decoded ${carried} frames over 5 s after it` +
          `${options.unwatch ? ", then was unwatched" : ""}; 8-13 s after the watch again, ${pictures} of ${expected} pictures decoded, ` +
          `${showing ? "on the stage" : "not on the stage"} → ${red ? "RED" : "green"}`,
      );
      if (showing) await watcher.run(`unwatch "${sharerName}" webcam`);
      if (!options.unwatch) await watcher.run(`unwatch "${otherName}" webcam`);
      await sharer.run("stop webcam");
      await wait(1500);
    }
  }
} catch (error) {
  if (!(error instanceof NoVerdict)) throw error;
  console.log(`no verdict: ${error.message}`);
  verdict = 2;
} finally {
  for (const member of [sharer, other, watcher]) member.quit();
}
process.exitCode = verdict;
