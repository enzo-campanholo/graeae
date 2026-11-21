// PROTOTYPE (prototype/overlay), throwaway: `pnpm prototype:overlay` shoots the three
// overlay variants at both sizes and in both themes, into
// `.impeccable/review/captures/overlay-prototype/` with a contact sheet. One server:
// `vite dev --mode fake-media`, so the room is the sample's (with pictures) while the
// owner page reads the fake instance, which the shoot fills first.

import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { SECRETS } from "../../test/browser/app.ts";

process.env.GRAEAE_CAPTURE ??= "overlay-prototype";
process.env.GRAEAE_OVERLAY_PORT ??= String(await freePort());
const port = Number(process.env.GRAEAE_OVERLAY_PORT);
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "overlay-prototype.capture.ts",
  workers: 1,
  reporter: "list",
  outputDir: "../../test-results/overlay-prototype",
  globalTeardown: "./contact-sheet.ts",
  timeout: 300_000,
  use: {
    headless: true,
    browserName: "chromium",
    baseURL: `http://localhost:${port}`,
    launchOptions: { executablePath: process.env.GRAEAE_CHROMIUM || undefined },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite dev --mode fake-media --port ${port} --strictPort`,
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
