// `pnpm run deploy [--wait] [wrangler deploy options]`: builds and deploys the instance.
// `.secrets` is uploaded with the code when present; without it the Worker keeps the
// secrets it already has. Extra options go to wrangler, e.g. `--name` for a second instance.
//
// Before building, it checks that the target Worker (`--name`, else the name in
// wrangler.jsonc) will end up with every secret wrangler.jsonc requires, from `.secrets`
// or already on the Worker, and refuses otherwise. Without this, a deploy to a Worker that
// does not exist yet and no `.secrets` uploads the assets, which creates an empty Worker,
// and only then fails.
//
// `--wait` then fetches the instance's `/` (which a stranger gets as the app's page) every
// 5 s until it names this build's entry script, for up to 6 minutes, and exits 1 if it
// never does: a busy room keeps serving the old release for up to 5 minutes.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SECRETS_FILE = ".secrets";
const CONFIG_FILE = "wrangler.jsonc";
const BUILT_PAGE = "dist/client/index.html";
const WAIT_EVERY_MS = 5_000;
const WAIT_AT_MOST_MS = 6 * 60_000;

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}

/**
 * Runs a command with its stdout echoed as it comes and kept, for reading afterwards.
 * @param {string} command @param {string[]} args
 * @returns {Promise<string>}
 */
function runEchoed(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["inherit", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();
    });
    child.on("close", (status) => {
      if (status !== 0) process.exit(status ?? 1);
      resolve(output);
    });
  });
}

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

/** @param {string} file */
function assignments(file) {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => ASSIGNMENT.exec(line))
    .filter((assignment) => assignment !== null);
}

// Wrangler would upload a blank line as an empty secret, overwriting a real one on the
// Worker, so a secret named in the file must have a value.
/** @param {string} file */
function blankSecrets(file) {
  return assignments(file)
    .filter(([, , value]) => value === "" || value === '""' || value === "''")
    .map(([, name]) => name);
}

/** @param {string[]} args @returns {string} */
function targetName(args) {
  for (const [i, arg] of args.entries()) {
    const next = args[i + 1];
    if (arg === "--name" && next) return next;
    if (arg.startsWith("--name=")) return arg.slice("--name=".length);
  }
  const configured = /"name"\s*:\s*"([^"]+)"/.exec(readFileSync(CONFIG_FILE, "utf8"))?.[1];
  if (!configured) throw new Error(`${CONFIG_FILE} names no Worker`);
  return configured;
}

/** @returns {string[]} */
function requiredSecrets() {
  const list = /"secrets"\s*:\s*\{[^}]*?"required"\s*:\s*\[([^\]]*)\]/.exec(readFileSync(CONFIG_FILE, "utf8"))?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map(([, name]) => name ?? "");
}

/** The secrets already on the Worker; none when the Worker does not exist. @param {string} name */
function secretsOnWorker(name) {
  const { status, stdout, stderr } = spawnSync(
    "pnpm",
    ["exec", "wrangler", "secret", "list", "--name", name, "--format", "json"],
    { encoding: "utf8" },
  );
  if (status !== 0) {
    if (`${stdout}${stderr}`.includes("not found")) return [];
    process.stderr.write(stdout + stderr);
    console.error(`Could not list the secrets on the Worker ${name}, so nothing was deployed.`);
    process.exit(1);
  }
  /** @type {{ name: string }[]} */
  const listed = JSON.parse(stdout.slice(stdout.indexOf("[")));
  return listed.map((secret) => secret.name);
}

const wait = process.argv.includes("--wait");
const wranglerArgs = process.argv.slice(2).filter((arg) => arg !== "--" && arg !== "--wait");
const secrets = existsSync(SECRETS_FILE) ? ["--secrets-file", SECRETS_FILE] : [];

if (secrets.length > 0) {
  const blank = blankSecrets(SECRETS_FILE);
  if (blank.length > 0) {
    console.error(
      `${SECRETS_FILE} has no value for ${blank.join(", ")}. Fill each one in, or delete ` +
        `its line to keep the value already on the Worker.`,
    );
    process.exit(1);
  }
}

const target = targetName(wranglerArgs);
const inFile = new Set(secrets.length > 0 ? assignments(SECRETS_FILE).map(([, name]) => name) : []);
let missing = requiredSecrets().filter((name) => !inFile.has(name));
// Asks Cloudflare only when the file leaves something out.
if (missing.length > 0) {
  const onWorker = new Set(secretsOnWorker(target));
  missing = missing.filter((name) => !onWorker.has(name));
}
if (missing.length > 0) {
  console.error(
    `The Worker ${target} would have no value for ${missing.join(", ")}, so nothing was deployed.\n` +
      `A first deploy takes them from ${SECRETS_FILE} (README, "Deploying"). To deploy another\n` +
      "instance, give its name: this repo's test instance is `pnpm run deploy --name graeae-test`.",
  );
  process.exit(1);
}

// Always the production build: the real media server and media client, never the fakes
// the tests build with (`--mode fake-media`), even if `dist/` holds a test build.
run("pnpm", ["exec", "vite", "build", "--mode", "production"]);
const deployed = await runEchoed("pnpm", ["exec", "wrangler", "deploy", ...secrets, ...wranglerArgs]);

if (!wait) {
  console.log("Open pages keep the old release until no room is busy, up to 5 minutes.");
  process.exit(0);
}

const url = /https:\/\/\S+?\.workers\.dev/.exec(deployed)?.[0];
const entry = /\/assets\/index-[\w-]+\.js/.exec(readFileSync(BUILT_PAGE, "utf8"))?.[0];
if (!url || !entry) {
  console.error(`Cannot wait: no ${url ? `entry script in ${BUILT_PAGE}` : "workers.dev address in wrangler's output"}.`);
  process.exit(1);
}
const started = Date.now();
while (Date.now() - started < WAIT_AT_MOST_MS) {
  // `/` answers a stranger with the app's page, whatever its status.
  const page = await fetch(`${url}/`).then((response) => response.text(), () => "");
  if (page.includes(entry)) {
    console.log(`${url} serves this release (after ${Math.round((Date.now() - started) / 1000)}s)`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, WAIT_EVERY_MS));
}
console.error(`${url} still serves the old release; a busy room holds it back`);
process.exit(1);
