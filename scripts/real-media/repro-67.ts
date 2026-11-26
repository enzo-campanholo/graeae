// Ticket 67's check on a deployed instance: a watcher whose receiving connection is being
// replaced while the share it watches is handed over keeps its picture. Not a test: it
// calls Cloudflare's media server, which `pnpm test` never does.
//
//   nix-shell --run 'node scripts/real-media/repro-67.ts --sharer <invite file> --watcher <invite file> \
//     [--offsets "0.3"] [--runs 1]'
//
// Two members (`member.ts`, fake webcams) in one room. The sharer has the room open in two
// tabs (`newtab`), and shares its webcam from one; the watcher watches it. For each run and
// each offset in `--offsets`, the watcher loads the room afresh and watches the webcam until
// it decodes frames; the sharer presses Share webcam in its other tab and then "Share from
// here" (`handover webcam`), and `offset` seconds after that click the watcher's receiving
// connection reports failed (`fail receiving`), so the tab asks for a replacement while the
// hand-over ends the share the replacement pulls. A negative offset fails the connection
// first. 10 seconds on, the watch passes when the page decodes frames over 5 seconds, and
// is RED when it decodes none: the picture froze for good, as in ticket 62's check.
//
// Whether a run hit the race (the replacement's pull of the old share returning after the
// hand-over ended it) is in the instance's lines, not the page: each run prints the UTC time
// of its fail, for `pnpm logs` and `pnpm logs:view`.
//
// Exit 0: every watch decoded frames. Exit 1: one decoded none (the bug). Exit 2: the rig
// itself failed (a command, a share that never went live), so no verdict.
//
// Needs a display: start scripts/real-media/desktop.sh and pass its DISPLAY and
// PULSE_SERVER in the environment.

import { parseArgs } from "node:util";
import { framesBetween, has, Member, NoVerdict, READ, type Reading } from "./driver.ts";

const { values: options } = parseArgs({
  options: {
    sharer: { type: "string" },
    watcher: { type: "string" },
    "sharer-name": { type: "string", default: "Sharer67" },
    "watcher-name": { type: "string", default: "Watcher67" },
    offsets: { type: "string", default: "0.3" },
    runs: { type: "string", default: "1" },
  },
});
if (!options.sharer || !options.watcher) {
  console.error("usage: node scripts/real-media/repro-67.ts --sharer <invite file> --watcher <invite file> [--offsets '0.3'] [--runs N]");
  process.exit(2);
}
const OFFSETS = options.offsets!.split(/[\s,]+/).filter(Boolean).map(Number);
const RUNS = Number(options.runs);
const sharerName = options["sharer-name"]!;
const watcherName = options["watcher-name"]!;
const sharing = has("Stop sharing your webcam");
const watching = has(`Stop watching ${sharerName}'s webcam`);
const offered = `document.body.innerText.includes("Your webcam is already live")`;
const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));
const utc = () => new Date().toISOString().slice(11, 23);

/** The frames the watcher decoded over the next `ms`. */
async function framesOver(watcher: Member, ms: number): Promise<number> {
  const before = await watcher.eval<Reading[]>(READ);
  await wait(ms);
  return framesBetween(before, await watcher.eval<Reading[]>(READ));
}

const sharer = new Member(sharerName, options.sharer, "0,0");
const watcher = new Member(watcherName, options.watcher, "960,0");
let verdict = 0;
try {
  await Promise.all([sharer, watcher].map((member) => member.line(/ in the room at /, 60_000)));
  await sharer.run("newtab", 60_000);
  await sharer.run("tab 1");
  if (!(await sharer.eval<boolean>(sharing))) await sharer.run("share webcam");
  await sharer.until(sharing, 30_000, "went live");
  let live = 1;
  console.log(`${sharerName}'s webcam is live from tab 1 of 2`);

  for (let run = 1; run <= RUNS; run++) {
    for (const offset of OFFSETS) {
      await watcher.run("reload", 60_000);
      await watcher.until(has(`Watch ${sharerName}'s webcam`), 30_000, "saw the webcam to watch");
      await watcher.run(`watch "${sharerName}" webcam`);
      let first = 0;
      for (let tries = 0; first === 0 && tries < 12; tries++) first = await framesOver(watcher, 1000);
      if (first === 0) throw new NoVerdict(`${watcherName}'s watch decoded nothing before the hand-over`);
      await wait(2000);

      const to = 3 - live;
      await sharer.run(`tab ${to}`);
      await sharer.run("share webcam");
      await sharer.until(offered, 15_000, "was offered to share from here");
      let failedAt: string;
      if (offset >= 0) {
        const handing = sharer.run("handover webcam");
        await wait(offset * 1000);
        failedAt = utc();
        await watcher.run("fail receiving");
        await handing;
      } else {
        failedAt = utc();
        const failing = watcher.run("fail receiving");
        await wait(-offset * 1000);
        await sharer.run("handover webcam");
        await failing;
      }
      await sharer.until(sharing, 30_000, `went live from tab ${to}`);
      live = to;

      await wait(10_000);
      const frames = await framesOver(watcher, 5000);
      const showing = await watcher.eval<boolean>(watching);
      const red = frames === 0;
      if (red) verdict = 1;
      console.log(
        `run ${run}, fail ${offset} s after the hand-over (at ${failedAt} UTC): ${frames} frames decoded 10-15 s later, ${showing ? "on the stage" : "not on the stage"} → ${red ? "RED" : "green"}`,
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
