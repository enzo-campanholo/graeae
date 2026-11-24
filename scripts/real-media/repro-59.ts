// Ticket 59's check on a deployed instance: a screen share in H.264 high, watched in a
// reused section that lists only baseline. Not a test: it calls Cloudflare's media server,
// which `pnpm test` never does.
//
//   nix-shell --run 'node scripts/real-media/repro-59.ts --cam <invite file> --screen <invite file> \
//     --watcher <invite file> --clip <high.h264> [--steps "cam share screen"] [--runs 1]'
//
// Three members (`member.ts`, fake webcams) in one room:
// - the webcam member (--cam) shares its webcam, in baseline H.264 as the encoding plan has it;
// - the screen member shares a game window in H.264 high, as a hardware encoder on
//   Windows sends it (ticket 54's rig): it sends the clip (`--fake-h264`, an x264
//   high-profile clip as fake-h264.js makes one) in place of its encoder's frames, and
//   offers high, its browser's own (`--codec H264:6400`) or, from a browser that lists
//   none, baseline relabelled as `--as` (default 64001f, as Chrome on Windows offers it);
// - the watcher loads the room afresh each run and does `--steps` in turn: "share" shares
//   its webcam and stops it, "cam" watches the webcam member's webcam for --watch seconds
//   (default 6) and stops, "screen" the same with the screen member's screen.
//
// Each watch prints the mid it went in, the codecs that section knows (payload type, mime
// type, profile-level-id), the codec the packets arrived in (none when their payload type
// is not the section's, as in ticket 58) and the frames decoded.
//
// Exit 0: every watch decoded frames. Exit 1: a watch decoded none. Exit 2: the rig itself
// failed, so no verdict.
//
// Needs a display: start scripts/real-media/desktop.sh and pass its DISPLAY and
// PULSE_SERVER in the environment.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { has, liveOut, Member, NoVerdict, READ, SDP, watchSummary, type Reading } from "./driver.ts";

const { values: options } = parseArgs({
  options: {
    cam: { type: "string" },
    screen: { type: "string" },
    watcher: { type: "string" },
    clip: { type: "string" },
    as: { type: "string", default: "64001f" },
    "cam-name": { type: "string", default: "Cam59" },
    "screen-name": { type: "string", default: "Screen59" },
    "watcher-name": { type: "string", default: "Watcher59" },
    steps: { type: "string", default: "cam share screen" },
    runs: { type: "string", default: "1" },
    watch: { type: "string", default: "6" },
    dump: { type: "string" },
  },
});
if (!options.cam || !options.screen || !options.watcher || !options.clip) {
  console.error("usage: node scripts/real-media/repro-59.ts --cam <invite file> --screen <invite file> --watcher <invite file> --clip <high.h264> [--steps 'cam share screen'] [--runs N]");
  process.exit(2);
}
const STEPS = options.steps!.split(/[\s,]+/).filter(Boolean);
if (STEPS.some((step) => !["share", "cam", "screen"].includes(step))) throw new Error("--steps takes share, cam and screen");
const RUNS = Number(options.runs);
const WATCH_MS = Number(options.watch) * 1000;

const camName = options["cam-name"]!;
const screenName = options["screen-name"]!;
const watcherName = options["watcher-name"]!;
const GAME = "Game59";
const sharingWebcam = has("Stop sharing your webcam");
const sharingScreen = has("Stop sharing your screen");
const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

const cam = new Member(camName, options.cam, "0,0");
const screen = new Member(screenName, options.screen, "640,0", ["--fake-h264", options.clip, "--fake-h264-as", options.as!, "--codec", "H264:6400", "--pick", `${GAME} - Chromium`]);
const watcher = new Member(watcherName, options.watcher, "1280,0");
let verdict = 0;
try {
  await Promise.all([cam, screen, watcher].map((member) => member.line(/ in the room at /, 60_000)));
  if (!(await cam.eval<boolean>(sharingWebcam))) await cam.run("share webcam");
  await cam.until(sharingWebcam, 30_000, "went live");
  if (!(await screen.eval<boolean>(sharingScreen))) {
    await screen.run(`content game ${GAME}`);
    await screen.run("share screen");
  }
  await screen.until(sharingScreen, 30_000, "went live");
  await wait(2000);
  const sent = await liveOut(screen);
  if (!sent) throw new NoVerdict(`${screenName}'s screen share encoded nothing`);
  console.log(`${camName}'s webcam is live; ${screenName}'s screen goes out in mid ${sent.mid} as ${sent.codec ?? "?"} (${sent.encoder ?? "?"}), the clip swapped in`);

  for (let run = 1; run <= RUNS; run++) {
    await watcher.run("reload", 60_000);
    await watcher.until(`${has(`Watch ${camName}'s webcam`)} && ${has(`Watch ${screenName}'s screen`)}`, 30_000, "saw both shares to watch");
    const published: string[] = [];
    const watches: string[] = [];
    let shares = 0;
    let red = false;
    for (const step of STEPS) {
      if (step === "share") {
        shares++;
        await watcher.run("share webcam");
        await watcher.until(sharingWebcam, 30_000, `went live (share ${shares})`);
        await wait(2000);
        const mid = (await liveOut(watcher))?.mid;
        if (mid === undefined) throw new NoVerdict(`${watcherName}'s share ${shares} encoded nothing`);
        published.push(mid);
        await watcher.run("stop webcam");
        await watcher.until(`!${sharingWebcam}`, 30_000, `stopped (share ${shares})`);
        await wait(1500);
        continue;
      }
      const [who, kind] = step === "cam" ? [camName, "webcam"] : [screenName, "screen"];
      const before = await watcher.eval<Reading[]>(READ);
      await watcher.run(`watch "${who}" ${kind}`);
      await wait(WATCH_MS);
      const after = await watcher.eval<Reading[]>(READ);
      if (options.dump) {
        mkdirSync(options.dump, { recursive: true });
        const file = join(options.dump, `run${run}-watch${watches.length + 1}-${step}.json`);
        writeFileSync(file, JSON.stringify({ steps: STEPS, before, after, descriptions: await watcher.eval(SDP) }, null, 2));
      }
      await watcher.run(`unwatch "${who}" ${kind}`);
      await wait(1500);
      const watch = watchSummary(before, after);
      if (watch.red) verdict = 1;
      red ||= watch.red;
      watches.push(`${step} watch after ${shares} shares: ${watch.text}`);
    }
    console.log(`run ${run}: shares in sending mids [${published.join(", ")}]; ${watches.join("; ")} → ${red ? "RED" : "green"}`);
  }
} catch (error) {
  if (!(error instanceof NoVerdict)) throw error;
  console.log(`no verdict: ${error.message}`);
  verdict = 2;
} finally {
  for (const member of [cam, screen, watcher]) member.quit();
}
process.exitCode = verdict;
