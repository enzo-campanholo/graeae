// `pnpm run deploy [wrangler deploy options]`: builds and deploys the instance.
// `.secrets` is uploaded with the code when present; without it the Worker keeps the
// secrets it already has. Extra options go to wrangler, e.g. `--name` for a second instance.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SECRETS_FILE = ".secrets";

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}

// Wrangler would upload a blank line as an empty secret, overwriting a real one on the
// Worker, so a secret named in the file must have a value.
/** @param {string} file */
function blankSecrets(file) {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line))
    .filter((assignment) => assignment !== null)
    .filter(([, , value]) => value === "" || value === '""' || value === "''")
    .map(([, name]) => name);
}

const wranglerArgs = process.argv.slice(2).filter((arg) => arg !== "--");
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

// Always the production build: the real media server and media client, never the fakes
// the tests build with (`--mode fake-media`), even if `dist/` holds a test build.
run("pnpm", ["exec", "vite", "build", "--mode", "production"]);
run("pnpm", ["exec", "wrangler", "deploy", ...secrets, ...wranglerArgs]);
