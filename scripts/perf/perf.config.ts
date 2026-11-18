// `pnpm perf`: how long each move around the app shows a loading state, on the
// fake-media build under `vite preview`, so a change can be checked for flashes (ticket
// 33). GRAEAE_PERF_RTT sets the network's round trip in milliseconds (default 0). It
// prints a table of moves and fails when any move flashes a loading state. Not a test:
// `pnpm test` never runs it.

import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { SECRETS } from "../../test/browser/app.ts";

process.env.GRAEAE_PERF_PORT ??= String(await freePort());
const port = Number(process.env.GRAEAE_PERF_PORT);
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "*.perf.ts",
  workers: 1,
  reporter: "list",
  outputDir: "../../test-results/perf",
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    launchOptions: { executablePath: process.env.GRAEAE_CHROMIUM || undefined },
  },
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort`,
    port,
    cwd: ROOT_DIR,
    reuseExistingServer: false,
    env: { ...SECRETS, GRAEAE_EMPTY_INSTANCE: "1" },
    stdout: "ignore",
    stderr: "pipe",
  },
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
