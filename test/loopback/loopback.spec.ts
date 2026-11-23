// The real media client's negotiations, in a real Chromium, against a stand-in for the
// media server in the same page (`page/media-server.ts`): what Chrome does with each
// share, stop, watch and restart, which the fake media client never exercises and which
// only a deployed instance showed before (ticket 57). Nothing here calls Cloudflare; what
// the stand-in cannot show is in `docs/media-server.md`. Run by `pnpm test`, in the
// "media client" project of `playwright.config.ts`.

import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import type { RunSeen, WatchSeen } from "./observations.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

let server: ViteDevServer;

test.beforeAll(async () => {
  // The page and the client's own modules, as the app's build would bundle them.
  server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
    define: { __GRAEAE_FAKE_MEDIA__: "false", __GRAEAE_BUILD__: JSON.stringify("loopback") },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

async function scenario<Seen>(page: Page, call: string): Promise<Seen> {
  const address = server.resolvedUrls?.local[0];
  if (!address) throw new Error("the loopback page's server has no address");
  await page.goto(new URL("test/loopback/page/index.html", address).href);
  await expect(page).toHaveTitle("ready");
  return page.evaluate<Seen>(`loopback.${call}`);
}

test.describe.configure({ timeout: 90_000 });

test("fourteen shares in turn each go out, on one transport, and leave no more than two sections", async ({ page }) => {
  const seen = await scenario<RunSeen>(page, "sharesInTurn(14)");

  expect(seen.shares.map((share) => share.error)).toEqual(Array(14).fill(null));
  expect(seen.shares.every((share) => share.mid !== null && share.arrived)).toBe(true);
  // A stopped share's transceiver is let go of, and its encoder with it (ticket 57).
  expect(seen.shares.at(-1)!.liveSections).toBeLessThanOrEqual(2);
  // A new ufrag is a new transport, which the media server never connects (410).
  expect(new Set(seen.ufrags).size).toBe(1);
});

test("a share after a refused one gets a mid and goes out", async ({ page }) => {
  const seen = await scenario<RunSeen>(page, "afterARefusedShare()");

  expect(seen.shares.map(({ mid, error, arrived }) => ({ mid: mid !== null, error, arrived }))).toEqual(
    Array(4).fill({ mid: true, error: null, arrived: true }),
  );
  expect(new Set(seen.ufrags).size).toBe(1);
});

test("a share after an abandoned restart gets a mid and goes out", async ({ page }) => {
  const seen = await scenario<RunSeen>(page, "afterAnAbandonedRestart()");

  expect(seen.shares.map(({ mid, error, arrived }) => ({ mid: mid !== null, error, arrived }))).toEqual(
    Array(4).fill({ mid: true, error: null, arrived: true }),
  );
});

test("a watch the media server puts on a stopped share's section arrives, on the same transport", async ({ page }) => {
  const seen = await scenario<WatchSeen>(page, "watchOnAStoppedSharesSection()");

  expect(seen.mid).toBe("0");
  expect(seen.answered).toBe("recvonly");
  expect(seen.quality).toBe("720p");
  expect(seen.shares.map((share) => share.error)).toEqual([null, null, null]);
  expect(new Set(seen.ufrags).size).toBe(1);
});
