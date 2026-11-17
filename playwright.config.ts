// Seam 2: a few journeys in a real Chromium against the whole app running locally. One
// headless browser and one app at a time, so it stays light on the machine.

import { createServer } from "node:net";
import { defineConfig } from "@playwright/test";
import { SECRETS } from "./test/browser/app.ts";

// A free port, chosen once and handed down to Playwright's worker processes, so two
// runs on one machine never meet.
process.env.GRAEAE_SEAM_2_PORT ??= String(await freePort());
const baseURL = `http://localhost:${process.env.GRAEAE_SEAM_2_PORT}`;

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    // shell.nix provides a Chromium; elsewhere, `pnpm exec playwright install chromium`.
    launchOptions: { executablePath: process.env.GRAEAE_CHROMIUM || undefined },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  // The built app, as `pnpm test` leaves it, on an instance that starts empty each run.
  webServer: {
    command: `pnpm exec vite preview --port ${process.env.GRAEAE_SEAM_2_PORT} --strictPort`,
    // Every address answers 404 to a browser it does not know, so readiness is the open port.
    port: Number(process.env.GRAEAE_SEAM_2_PORT),
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
