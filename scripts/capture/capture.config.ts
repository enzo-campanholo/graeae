// `pnpm capture`: screenshots of every surface and state a design pass looks at, taken the
// same way each time, so a pass can compare before and after. Not a test: it checks only
// what it needs to reach each state, and `pnpm test` never runs it. Everything runs on the
// fakes, on two local servers that start empty:
//
// - "samples": `vite dev --mode fake-media` with `?sample`, whose made-up shares draw
//   pictures, for the room as it looks with colour in it (see `src/app/sample/`).
// - "journeys": the fake-media build under `vite preview`, as Seam 2 runs it, driven
//   through real journeys for the states the samples do not have: the owner page's
//   sections and confirms, the sharer's notes, the hand-over, the reconnecting states
//   and the usage budget. Fake media has no pictures, so these tiles are empty.
//
// Shots land in `.impeccable/review/captures/<label>/` (never committed), with an
// `index.html` contact sheet. `GRAEAE_CAPTURE=<label>` names the set (default
// "current"); `GRAEAE_CAPTURE_AGAINST=<label>` puts an earlier set beside it in the sheet.

import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { SECRETS } from "../../test/browser/app.ts";

process.env.GRAEAE_CAPTURE_SAMPLES_PORT ??= String(await freePort());
process.env.GRAEAE_CAPTURE_JOURNEYS_PORT ??= String(await freePort());
const samples = Number(process.env.GRAEAE_CAPTURE_SAMPLES_PORT);
const journeys = Number(process.env.GRAEAE_CAPTURE_JOURNEYS_PORT);
// The servers run from the repo root, not from this folder, which is Playwright's default.
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "*.capture.ts",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "../../test-results/capture",
  globalTeardown: "./contact-sheet.ts",
  timeout: 300_000,
  use: {
    headless: true,
    launchOptions: { executablePath: process.env.GRAEAE_CHROMIUM || undefined },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "samples",
      testMatch: "samples.capture.ts",
      use: { browserName: "chromium", baseURL: `http://localhost:${samples}` },
    },
    {
      name: "journeys",
      testMatch: "journeys.capture.ts",
      use: { browserName: "chromium", baseURL: `http://localhost:${journeys}` },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite dev --mode fake-media --port ${samples} --strictPort`,
      port: samples,
      cwd: ROOT_DIR,
      reuseExistingServer: false,
      env: { ...SECRETS, GRAEAE_EMPTY_INSTANCE: "1" },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `pnpm exec vite preview --port ${journeys} --strictPort`,
      port: journeys,
      cwd: ROOT_DIR,
      reuseExistingServer: false,
      env: { ...SECRETS, GRAEAE_EMPTY_INSTANCE: "1" },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}
