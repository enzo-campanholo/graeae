// The real media client's negotiations, in a real Chromium, against a stand-in for the
// media server in the same page (`page/media-server.ts`): what Chrome does with each
// share, stop and restart on the sending connection, and each watch on the receiving
// one, which the fake media client never exercises and which only a deployed instance
// showed before (tickets 57 and 60). Nothing here calls Cloudflare; what
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
  expect(new Set(seen.ufrags.sending).size).toBe(1);
});

test("a share after a refused one gets a mid and goes out", async ({ page }) => {
  const seen = await scenario<RunSeen>(page, "afterARefusedShare()");

  expect(seen.shares.map(({ mid, error, arrived }) => ({ mid: mid !== null, error, arrived }))).toEqual(
    Array(4).fill({ mid: true, error: null, arrived: true }),
  );
  expect(new Set(seen.ufrags.sending).size).toBe(1);
});

test("a share after an abandoned restart gets a mid and goes out", async ({ page }) => {
  const seen = await scenario<RunSeen>(page, "afterAnAbandonedRestart()");

  expect(seen.shares.map(({ mid, error, arrived }) => ({ mid: mid !== null, error, arrived }))).toEqual(
    Array(4).fill({ mid: true, error: null, arrived: true }),
  );
});

test("a watch the media server puts on an ended watch's section arrives, each connection on one transport", async ({ page }) => {
  const seen = await scenario<WatchSeen>(page, "watchOnAnEndedWatchsSection()");

  expect(seen.mid).toBe("0");
  // With no step from inactive in the tab: the section was the media server's from the start.
  expect(seen.answered).toBe("recvonly");
  expect(seen.quality).toBe("720p");
  expect(seen.shares.map((share) => share.error)).toEqual([null, null, null]);
  // The sending connection's restart is an ICE restart, with a ufrag of its own; the
  // receiving connection, which it does not touch, keeps its one.
  expect(new Set(seen.ufrags.sending).size).toBe(2);
  expect(new Set(seen.ufrags.receiving).size).toBe(1);
  // The two connections are two transports.
  expect(seen.ufrags.receiving[0]).not.toBe(seen.ufrags.sending[0]);
});

test("ticket 60's order, a watch, two shares stopped and a second watch, arrives with no codec handling in the tab", async ({ page }) => {
  const seen = await scenario<WatchSeen>(page, "ticket60sOrder()");

  // A section of its own on the receiving connection, which no share's offer narrowed.
  expect(seen.mid).toBe("1");
  expect(seen.answered).toBe("recvonly");
  expect(seen.quality).toBe("720p");
  expect(seen.shares.map(({ error, arrived }) => ({ error, arrived }))).toEqual(Array(2).fill({ error: null, arrived: true }));
  expect(new Set(seen.ufrags.receiving).size).toBe(1);
});
