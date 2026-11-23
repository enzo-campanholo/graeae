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

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { has, liveOut, Member, NoVerdict, READ, SDP, watchSummary, type Reading } from "./driver.ts";

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

const sharing = has("Stop sharing your webcam");

const sharerName = options["sharer-name"]!;
const watcherName = options["watcher-name"]!;
const watcher = new Member(watcherName, options.watcher, "0,0");
const sharer = new Member(sharerName, options.sharer, "960,0", options["sharer-arg"]!.map((arg) => `--chromium-arg=${arg}`));
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
    let red = false;
    for (const [index, step] of STEPS.entries()) {
      const hook = BEFORE.get(index + 1);
      if (hook) console.log(`  before step ${index + 1}: ${JSON.stringify(await sharer.eval(hook))}`);
      if (step === "share") {
        shares++;
        await sharer.run("share webcam");
        await sharer.until(sharing, 30_000, `went live (share ${shares})`);
        await new Promise((wake) => setTimeout(wake, 2000));
        const mid = (await liveOut(sharer))?.mid;
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

      const watch = watchSummary(before, after, published);
      if (watch.red) verdict = 1;
      red ||= watch.red;
      watches.push(`watch ${watches.length + 1} after ${shares} shares: ${watch.text}`);
    }
    console.log(`run ${run}: shares in mids [${published.join(", ")}]; ${watches.join("; ")} → ${red ? "RED" : "green"}`);
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
