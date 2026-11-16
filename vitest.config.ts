import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Seam 1: tests run the real Worker and Durable Object, with real SQLite, inside the
// Workers runtime. The front end must be built first (`pnpm test` does it), since the
// Worker answers with the app's page.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: { include: ["test/**/*.test.ts"] },
});
