// `pnpm real-media`: one member of a deployed graeae instance in a real, headed Chromium,
// on the real media server, driven by commands typed or piped in. It joins by an invite
// address (or a room's, once its profile is remembered), shares or watches on command,
// and prints what it sends and receives every few seconds: resolution, frame rate,
// frames encoded or decoded, codec, encoder or decoder, and sound level. Not a test:
// it calls Cloudflare's media server, which `pnpm test` never does.
//
//   pnpm real-media --url https://<instance>/invite/<code> --name tux [options]
//
// then, say, `watch "Bia" screen` to watch Bia's screen, or `share screen` with
// `--pick tab:<title>` to share a tab. A viewer's decoder prints as "?": Chromium names
// it only to a page that is capturing.
//
// On a machine with no screen, start a virtual one first (scripts/real-media/desktop.sh)
// and run with the DISPLAY and PULSE_SERVER it prints. Options:
//   --name <label>       labels its lines; its browser profile is ~/.cache/graeae-real-media/<label>
//   --size WxH           the page's size (default 1920x953, a maximised window on a 1080p monitor)
//   --pick <source>      what the browser's picker chooses by itself: "Entire screen", a
//                        window's title ("<page title> - Chromium" for a Chromium window),
//                        or tab:<title> for a tab. The picker opens otherwise.
//   --webcam real|fake|<file.y4m>   the camera: the real one (default), or a generated
//                        640x480 (4:3) test picture, or a .y4m file
//   --every <seconds>    how often it prints its streams (default 5; 0 for never)
//   --shots <dir>        where `shot` saves (default .impeccable/review/real-media)
//   --position X,Y       where its window opens
//   --chromium-arg <arg> passed to Chromium; repeatable
//
// Commands, one a line (a "quoted name" may hold spaces):
//   share screen|webcam          press Share screen (and the first-time notice) or Share webcam
//   handover screen|webcam       "Share from here" in the offer a share of yours live elsewhere brings
//   stop screen|webcam           graeae's Stop
//   stopbar                      the browser's own "Stop sharing" bar, clicked as a person
//                                would (needs xdotool: XDO=<path>)
//   audio on|off                 your screen share's audio switch
//   watch|unwatch <name> screen|webcam     a share's icon in the bar
//   follow <name>                click a name in the bar
//   everything | webcams | nothing          the watch shortcuts
//   focus|unfocus|fullscreen|hover <name> screen|webcam     on a stage tile
//   exitfullscreen | reload | offline | online
//   reopen                       the room in a new tab, with no click on it yet
//   newtab                       the room in another tab, keeping this one open; the new one is driven
//   tab <n>                      drive tab n (1 is the first) and bring it to the front
//   content <kind> <title> [WxH] [X,Y] [fps] [tone Hz]   opens scripts/real-media/content.html in
//                                a window of its own and clicks it so it plays sound;
//                                kind is game, document, tone or portrait
//   raise                        puts the content window back on top of the member's own
//   closecontent                 closes it
//   theme dark|light | size WxH
//   shot <name>                  <shots>/<name>.<theme>.<W>x<H>.png
//   shots <name> [WxH,WxH]       the same at 1920x953 and 1366x768 (or the sizes given), dark and light
//   until <seconds> <text>       waits for text on the page
//   see <text>                   says whether the text is on the page
//   signal <word> | waitfor <seconds> <word>   take turns with another member on this machine
//   wait <seconds> | stats | eval <js> | quit

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { chromium, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { fakeWebcam } from "./webcam.ts";

const HERE = import.meta.dirname;
const SIZES = [
  { width: 1920, height: 953 },
  { width: 1366, height: 768 },
] as const;
const THEMES = ["dark", "light"] as const;
/** Where `signal` and `waitfor` meet, so two members on one machine can take turns. */
const SIGNALS = join(homedir(), ".cache", "graeae-real-media", "signals");

const { values: options } = parseArgs({
  options: {
    url: { type: "string" },
    name: { type: "string", default: "member" },
    size: { type: "string", default: "1920x953" },
    pick: { type: "string" },
    webcam: { type: "string", default: "real" },
    every: { type: "string", default: "5" },
    shots: { type: "string", default: ".impeccable/review/real-media" },
    position: { type: "string", default: "0,0" },
    "chromium-arg": { type: "string", multiple: true, default: [] },
  },
});

if (!options.url) {
  console.error("usage: pnpm real-media --url <invite or room address> [--name <label>] [--pick <source>] ...");
  process.exit(2);
}
const label = options.name;
const profile = join(homedir(), ".cache", "graeae-real-media", label);
mkdirSync(profile, { recursive: true });
const shots = resolve(options.shots);
let viewport = size(options.size);
let theme: (typeof THEMES)[number] = "dark";

function size(text: string) {
  const [width, height] = text.split("x").map(Number);
  if (!width || !height) throw new Error(`Not a size: ${text}`);
  return { width, height };
}

function say(line: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${label} ${line}`);
}

// The content pages, from localhost so the page counts as secure.
const server = createServer((request, response) => {
  if (!request.url?.startsWith("/content.html")) return void response.writeHead(404).end();
  response.setHeader("content-type", "text/html");
  response.end(readFileSync(join(HERE, "content.html")));
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const contentBase = `http://localhost:${(server.address() as { port: number }).port}/content.html`;

const context = await launch();
/** Every tab of the room open, in the order opened; `page` is the one driven. */
const tabs: Page[] = [];
let page = listen(context.pages()[0] ?? (await context.newPage()));
tabs.push(page);
let content: Page | null = null;
let contentTitle: string | null = null;
let hovered: { name: string; kind: string } | null = null;
let cdp: CDPSession | null = null;

await enter();

const counted = new Map<string, { bytes: number; at: number }>();
const every = Number(options.every) * 1000;
const ticker = every > 0 ? setInterval(() => void printStats().catch(() => undefined), every) : null;

// Commands run one at a time, in the order given.
let queue = Promise.resolve();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  queue = queue.then(() => run(line.trim())).catch((error: Error) => say(`failed: ${line.trim()}: ${error.message.split("\n")[0]}`));
});
input.on("close", () => void queue.then(quit));
process.on("SIGINT", () => void quit());

/** `tab`, with what its console says of captures and errors printed. */
function listen(tab: Page): Page {
  const which = () => (tabs.length > 1 ? `tab ${tabs.indexOf(tab) + 1}: ` : "");
  tab.on("console", (message) => {
    if (message.text().startsWith("[real-media]")) say(`${which()}${message.text().slice(13)}`);
    else if (message.type() === "error") say(`${which()}page error: ${message.text()}`);
  });
  tab.on("pageerror", (error) => say(`${which()}page exception: ${error.message}`));
  return tab;
}

async function launch(): Promise<BrowserContext> {
  const args = [`--window-position=${options.position}`, `--window-size=${viewport.width},${viewport.height + 90}`];
  if (options.pick?.startsWith("tab:")) args.push(`--auto-select-tab-capture-source-by-title=${options.pick.slice(4)}`);
  else if (options.pick) args.push(`--auto-select-desktop-capture-source=${options.pick}`);
  if (options.webcam !== "real") {
    const file = options.webcam === "fake" ? fakeWebcam(join(profile, "webcam-640x480.y4m")) : resolve(options.webcam);
    args.push("--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`);
  }
  const launched = await chromium.launchPersistentContext(profile, {
    headless: false,
    executablePath: process.env.GRAEAE_CHROMIUM || undefined,
    viewport,
    // Sound plays, so a tab's sound can be shared and a watched share's heard; the bar
    // that says a page is sharing shows, so it can be clicked.
    ignoreDefaultArgs: ["--mute-audio", "--disable-infobars"],
    args: [...args, ...(options["chromium-arg"] ?? [])],
    permissions: ["camera"],
  });
  await launched.addInitScript({ path: join(HERE, "page.js") });
  return launched;
}

/** Into the room: by the invite the first time, by the room's address once remembered. */
async function enter() {
  const remembered = join(profile, "room-address");
  const url = options.url!;
  if (url.includes("/invite/") && existsSync(remembered)) {
    await page.goto(readFileSync(remembered, "utf8"));
  } else if (url.includes("/invite/")) {
    await page.goto(url);
    await page.getByRole("button", { name: /^Join as / }).click();
    await page.waitForURL(/\/r\//);
  } else {
    await page.goto(url);
  }
  await page.getByRole("main", { name: "Stage" }).waitFor({ timeout: 30_000 });
  writeFileSync(remembered, page.url());
  say(`in the room at ${new URL(page.url()).pathname}`);
}

async function run(line: string) {
  if (line === "" || line.startsWith("#")) return;
  const [command, ...rest] = words(line);
  const bar = page.getByRole("complementary", { name: "People" });
  const here = page.getByRole("region", { name: "Here" });
  const kind = (at: number) => {
    const value = rest[at];
    if (value !== "screen" && value !== "webcam") throw new Error(`"screen" or "webcam", not ${value}`);
    return value;
  };
  say(`> ${line}`);
  switch (command) {
    case "share": {
      if (kind(0) === "webcam") return bar.getByRole("button", { name: "Share webcam" }).click();
      await bar.getByRole("button", { name: "Share screen" }).click();
      const notice = page.getByRole("dialog", { name: "Before you pick" });
      // The first time on a device a notice comes first.
      if (await notice.isVisible({ timeout: 1500 }).catch(() => false)) {
        await notice.getByRole("button", { name: "Choose what to share" }).click();
      }
      return;
    }
    case "handover": {
      // After `share` while that kind of yours is live from another tab or device.
      const kindName = rest[0] === "webcam" ? "webcam" : "screen";
      await page.getByRole("dialog", { name: `Your ${kindName} is already live` }).getByRole("button", { name: "Share from here" }).click();
      const notice = page.getByRole("dialog", { name: "Before you pick" });
      if (await notice.isVisible({ timeout: 1500 }).catch(() => false)) {
        await notice.getByRole("button", { name: "Choose what to share" }).click();
      }
      return;
    }
    case "stop":
      return page.getByRole("button", { name: `Stop sharing your ${kind(0)}` }).click();
    case "stopbar":
      return clickStopBar();
    case "audio":
      return page.getByRole("button", { name: `Turn your screen audio ${rest[0]}` }).click();
    case "watch":
    case "unwatch":
      return here.getByRole("button", { name: `${command === "watch" ? "Watch" : "Stop watching"} ${rest[0]}'s ${kind(1)}` }).click();
    case "follow":
      return here.getByRole("button", { name: new RegExp(`^${escape(rest[0] ?? "")}`) }).first().click();
    case "everything":
    case "webcams":
    case "nothing":
      return here.getByRole("button", { name: { everything: "Watch everything", webcams: "Watch every webcam", nothing: "Watch nothing" }[command] }).click();
    case "hover":
      hovered = { name: rest[0]!, kind: kind(1) };
      return hover();
    case "focus":
    case "unfocus":
    case "fullscreen": {
      hovered = { name: rest[0]!, kind: kind(1) };
      await hover();
      const share = `${rest[0]}'s ${kind(1)}`;
      const name = { focus: `Focus ${share}`, unfocus: "Back to the grid", fullscreen: `Show ${share} fullscreen` }[command];
      return page.getByRole("main", { name: "Stage" }).getByRole("button", { name, exact: true }).first().click();
    }
    case "exitfullscreen":
      return void (await page.evaluate("document.fullscreenElement && document.exitFullscreen()"));
    case "reload":
      await page.reload();
      return void (await page.getByRole("main", { name: "Stage" }).waitFor());
    case "reopen": {
      // A reload keeps the page's click, which lets its sound play; a new tab has none.
      const old = page;
      page = listen(await context.newPage());
      cdp = null;
      tabs[tabs.indexOf(old)] = page;
      await page.goto(readFileSync(join(profile, "room-address"), "utf8"));
      await old.close();
      return void (await page.getByRole("main", { name: "Stage" }).waitFor());
    }
    case "newtab": {
      const opened = await context.newPage();
      tabs.push(opened);
      page = listen(opened);
      cdp = null;
      await page.goto(readFileSync(join(profile, "room-address"), "utf8"));
      await page.getByRole("main", { name: "Stage" }).waitFor();
      return say(`tab ${tabs.length} of ${tabs.length} is driven`);
    }
    case "tab": {
      const chosen = tabs[Number(rest[0]) - 1];
      if (!chosen) throw new Error(`no tab ${rest[0]}`);
      page = chosen;
      cdp = null;
      await page.bringToFront();
      return say(`tab ${rest[0]} of ${tabs.length} is driven`);
    }
    case "offline":
    case "online": {
      // One session for both: what a session emulates holds until that session changes it.
      cdp ??= await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: command === "offline", latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      return;
    }
    case "content":
      return openContent(rest);
    case "raise":
      return raiseContent();
    case "closecontent":
      await content?.close();
      content = null;
      contentTitle = null;
      return;
    case "theme":
      theme = rest[0] === "light" ? "light" : "dark";
      return void (await page.evaluate(`document.documentElement.classList.toggle("dark", ${theme === "dark"})`));
    case "size":
      viewport = size(rest[0] ?? "");
      await page.setViewportSize(viewport);
      return hover();
    case "shot":
      return shot(rest[0] ?? "shot");
    case "shots": {
      const was = { viewport, theme };
      const sizes = rest[1] ? rest[1].split(",").map(size) : SIZES;
      for (const each of sizes) {
        viewport = { ...each };
        await page.setViewportSize(viewport);
        for (const which of THEMES) {
          await run(`theme ${which}`);
          await hover();
          await page.waitForTimeout(400);
          await shot(rest[0] ?? "shot");
        }
      }
      viewport = was.viewport;
      await page.setViewportSize(viewport);
      await run(`theme ${was.theme}`);
      return;
    }
    case "until":
      await page.getByText(rest.slice(1).join(" ")).first().waitFor({ timeout: Number(rest[0]) * 1000 });
      return say(`saw "${rest.slice(1).join(" ")}"`);
    case "see": {
      const text = rest.join(" ");
      const seen = await page.getByText(text).first().isVisible();
      return say(`${seen ? "sees" : "does not see"} "${text}"`);
    }
    case "wait":
      return page.waitForTimeout(Number(rest[0]) * 1000);
    case "stats":
      return printStats();
    case "eval":
      return say(JSON.stringify(await page.evaluate(line.slice(5))));
    case "signal":
      mkdirSync(SIGNALS, { recursive: true });
      return writeFileSync(join(SIGNALS, rest[0]!), "");
    case "waitfor": {
      const until = Date.now() + Number(rest[0]) * 1000;
      while (!existsSync(join(SIGNALS, rest[1]!))) {
        if (Date.now() > until) throw new Error(`no signal ${rest[1]}`);
        await page.waitForTimeout(250);
      }
      return;
    }
    case "quit":
      return quit();
    default:
      throw new Error("no such command");
  }
}

/** The pointer on a tile's picture, so its controls show, after a resize or theme change too. */
async function hover() {
  if (!hovered) return;
  const share = `${hovered.name}'s ${hovered.kind}`;
  await page.getByRole("main", { name: "Stage" }).locator(`[aria-label^="${share}"]`).first().hover();
}

async function shot(name: string) {
  mkdirSync(shots, { recursive: true });
  const file = join(shots, `${name}.${theme}.${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: file });
  say(`saved ${file}`);
}

/**
 * Opens something to share in a window of its own, sized and placed, on top of the
 * member's own window, and clicks it so it plays sound.
 */
async function openContent([kind = "game", title = "content", sized, placed, fps, tone]: string[]) {
  await content?.close();
  const url = `${contentBase}?kind=${kind}&title=${encodeURIComponent(title)}${fps ? `&fps=${fps}` : ""}${tone ? `&tone=${tone}` : ""}`;
  const opening = context.waitForEvent("page");
  await page.evaluate(`window.open(${JSON.stringify(url)}, "_blank", "popup")`);
  content = await opening;
  await content.waitForLoadState();
  await content.mouse.click(10, 10);
  contentTitle = title;
  if (sized || placed) {
    const [width, height] = (sized ?? "1280x720").split("x");
    const [x, y] = (placed ?? "0,0").split(",");
    xdo(["search", "--sync", "--name", `^${escape(title)} - Chromium$`, "windowsize", "%@", width!, height!, "windowmove", "%@", x!, y!, "windowraise", "%@"]);
  }
  say(`content "${title}" (${kind}) is open`);
}

/** The content's window back on top, where pressing graeae's buttons may have put the member's own. */
function raiseContent() {
  if (contentTitle) xdo(["search", "--name", `^${escape(contentTitle)} - Chromium$`, "windowraise", "%@"]);
}

/**
 * The browser's own bar that says the page is sharing: its "Stop sharing" button sits
 * left of "Hide" at the bar's right end, and is clicked with the pointer, as a person
 * would. The bar is the small window whose name says it is sharing.
 */
function clickStopBar() {
  const ids = xdo(["search", "--onlyvisible", "--name", "is sharing"]).trim().split("\n").filter(Boolean);
  const id = ids.at(-1);
  if (!id) throw new Error("no sharing bar on the screen");
  const geometry = Object.fromEntries(
    xdo(["getwindowgeometry", "--shell", id])
      .trim()
      .split("\n")
      .map((pair) => pair.split("=") as [string, string]),
  );
  const x = Number(geometry.X) + Number(geometry.WIDTH) - 120;
  const y = Number(geometry.Y) + Number(geometry.HEIGHT) / 2;
  xdo(["mousemove", String(x), String(y), "click", "1"]);
  say(`clicked the browser's "Stop sharing" at ${x},${y}`);
}

function xdo(args: string[]): string {
  const xdotool = process.env.XDO ?? "xdotool";
  return execFileSync(xdotool, args, { encoding: "utf8" });
}

async function printStats() {
  const lines = (await page.evaluate("window.__realMedia?.report() ?? []")) as Stream[];
  if (lines.length === 0) return;
  for (const stream of lines) {
    const before = counted.get(stream.id);
    if (stream.bytes !== undefined && stream.at !== undefined) counted.set(stream.id, { bytes: stream.bytes, at: stream.at });
    if (stream.direction === "in" && !stream.bytes) continue;
    if (stream.direction === "out" && stream.active === false) continue;
    const rate =
      before && stream.bytes !== undefined && stream.at !== undefined && stream.at > before.at
        ? (((stream.bytes - before.bytes) * 8) / (stream.at - before.at) / 1000).toFixed(2)
        : "?";
    const parts = [`${stream.direction} ${stream.kind} mid=${stream.mid}${stream.rid ? ` rid=${stream.rid}` : ""}`];
    if (stream.kind === "video") {
      parts.push(`${stream.width ?? "?"}x${stream.height ?? "?"} ${round(stream.fps)}fps`);
      if (stream.direction === "out") parts.push(`capture ${stream.captureWidth ?? "?"}x${stream.captureHeight ?? "?"} ${round(stream.captureFps)}fps`);
      parts.push(`${stream.direction === "out" ? "encoded" : "decoded"}=${stream.frames ?? "?"}`);
      if (stream.direction === "in") parts.push(`dropped=${stream.dropped ?? 0} freezes=${stream.freezes ?? 0}`);
      parts.push(`${stream.codec ?? "?"} ${stream.implementation ?? "?"}${stream.powerEfficient === false ? " (software)" : stream.powerEfficient ? " (hardware)" : ""}`);
      if (stream.limitedBy && stream.limitedBy !== "none") parts.push(`limited by ${stream.limitedBy}`);
    } else {
      parts.push(`level=${stream.audioLevel === undefined ? "?" : stream.audioLevel.toFixed(3)} ${stream.codec ?? ""}`);
    }
    parts.push(`${rate} Mbps`, stream.path ?? "");
    say(parts.join(" · "));
  }
}

interface Stream {
  id: string;
  direction: "in" | "out";
  kind: string;
  mid?: string;
  rid?: string;
  active?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  captureFps?: number;
  captureWidth?: number;
  captureHeight?: number;
  frames?: number;
  dropped?: number;
  freezes?: number;
  codec?: string;
  implementation?: string;
  powerEfficient?: boolean;
  limitedBy?: string;
  bytes?: number;
  at?: number;
  audioLevel?: number;
  path?: string;
}

function round(value: number | undefined) {
  return value === undefined ? "?" : Math.round(value * 10) / 10;
}

function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]!);
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  if (ticker) clearInterval(ticker);
  await context.close().catch(() => undefined);
  server.close();
  process.exit(0);
}

