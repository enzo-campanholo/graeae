// Ticket 66's check on a deployed instance: a watch on a receiving connection that has
// carried nothing for a while goes live on the first click. Not a test: it calls
// Cloudflare's media server, which `pnpm test` never does.
//
//   nix-shell --run 'node scripts/real-media/repro-66.ts --sharer <invite file> --watcher <invite file> \
//     [--before fail] [--gaps "20"] [--runs 1]'
//
// Two members (`member.ts`, fake webcams) in one room. The sharer shares its webcam. For
// each run and each gap in `--gaps`, the watcher loads the room afresh, watches the
// webcam for 4 seconds and stops watching, then does `--before`:
// - "fail": its receiving connection reports failed (`fail receiving`), with nothing
//   watched, so the tab asks for a replacement, which has nothing to carry;
// - "unwatch": nothing more, so the connection it watched on sits with nothing on it.
// It then waits the gap, in seconds, and watches the webcam once more with one click.
// That watch passes when the page decodes frames of it within 12 seconds, and is RED when
// it decodes none: the click did nothing (the media server refused the pull, 410).
//
// Exit 0: every last watch decoded frames. Exit 1: one decoded none (the bug). Exit 2:
// the rig itself failed (a command, a share that never went live), so no verdict.
//
// Needs a display: start scripts/real-media/desktop.sh and pass its DISPLAY and
// PULSE_SERVER in the environment.

import { parseArgs } from "node:util";
import { framesBetween, has, Member, NoVerdict, READ, type Reading } from "./driver.ts";

const { values: options } = parseArgs({
  options: {
    sharer: { type: "string" },
    watcher: { type: "string" },
    "sharer-name": { type: "string", default: "Sharer66" },
    "watcher-name": { type: "string", default: "Watcher66" },
    before: { type: "string", default: "fail" },
    gaps: { type: "string", default: "20" },
    runs: { type: "string", default: "1" },
  },
});
if (!options.sharer || !options.watcher || !["fail", "unwatch"].includes(options.before!)) {
  console.error("usage: node scripts/real-media/repro-66.ts --sharer <invite file> --watcher <invite file> [--before fail|unwatch] [--gaps '20'] [--runs N]");
  process.exit(2);
}
const GAPS = options.gaps!.split(/[\s,]+/).filter(Boolean).map(Number);
const RUNS = Number(options.runs);
const sharerName = options["sharer-name"]!;
const watcherName = options["watcher-name"]!;
const sharing = has("Stop sharing your webcam");
const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/** Watches the sharer's webcam with one click and waits up to `ms` for frames; how many arrived. */
async function watchOnce(watcher: Member, ms: number): Promise<number> {
  const before = await watcher.eval<Reading[]>(READ);
  await watcher.run(`watch "${sharerName}" webcam`);
  const until = Date.now() + ms;
  for (;;) {
    await wait(1000);
    const frames = framesBetween(before, await watcher.eval<Reading[]>(READ));
    if (frames > 0 || Date.now() > until) return frames;
  }
}

const sharer = new Member(sharerName, options.sharer, "0,0");
const watcher = new Member(watcherName, options.watcher, "960,0");
let verdict = 0;
try {
  await Promise.all([sharer, watcher].map((member) => member.line(/ in the room at /, 60_000)));
  if (!(await sharer.eval<boolean>(sharing))) await sharer.run("share webcam");
  await sharer.until(sharing, 30_000, "went live");
  console.log(`${sharerName}'s webcam is live`);

  for (let run = 1; run <= RUNS; run++) {
    for (const gap of GAPS) {
      await watcher.run("reload", 60_000);
      await watcher.until(has(`Watch ${sharerName}'s webcam`), 30_000, "saw the webcam to watch");
      const first = await watchOnce(watcher, 12_000);
      if (first === 0) throw new NoVerdict(`${watcherName}'s first watch decoded nothing`);
      await watcher.run(`unwatch "${sharerName}" webcam`);
      await wait(1500);
      if (options.before === "fail") {
        await watcher.run("fail receiving");
        // The replacement asks the media server for a session and a credential: well under 3 s.
        await wait(3000);
      }
      const madeBefore = await watcher.eval<number>("window.__realMedia.connections.length");
      await wait(gap * 1000);
      const at = new Date().toISOString().slice(11, 23);
      const frames = await watchOnce(watcher, 12_000);
      const made = (await watcher.eval<number>("window.__realMedia.connections.length")) - madeBefore;
      const showing = await watcher.eval<boolean>(has(`Stop watching ${sharerName}'s webcam`));
      const red = frames === 0;
      if (red) verdict = 1;
      console.log(
        `run ${run}, ${options.before} then ${gap} s: the watch at ${at} UTC decoded ${frames} frames, ${made} connection(s) made for it, ${showing ? "on the stage" : "not on the stage"} → ${red ? "RED" : "green"}`,
      );
      if (showing) await watcher.run(`unwatch "${sharerName}" webcam`);
      await wait(1500);
    }
  }
} catch (error) {
  if (!(error instanceof NoVerdict)) throw error;
  console.log(`no verdict: ${error.message}`);
  verdict = 2;
} finally {
  for (const member of [sharer, watcher]) member.quit();
}
process.exitCode = verdict;
