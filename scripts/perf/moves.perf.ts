// Every move around the app the owner makes, each timed: when the loading mark and the
// skeleton placeholders came and went, and when the page was ready. A move fails when it
// flashes a loading state: shows one for less than FLASH_MS.

import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { SETUP_SECRET } from "../../test/browser/app.ts";

const RTT = Number(process.env.GRAEAE_PERF_RTT ?? 0);
const FLASH_MS = 300;

type Interval = { kind: "loading" | "skeleton"; from: number; to: number | null };

const RECORDER = fileURLToPath(new URL("./recorder.js", import.meta.url));
type Change = { kind: Interval["kind"]; on: boolean; t: number };

async function slow(context: BrowserContext, page: Page) {
  if (!RTT) return;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: RTT,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

async function newContext(browser: import("@playwright/test").Browser, baseURL?: string) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 953 } });
  await context.addInitScript({ path: RECORDER });
  // Sockets are outside Chromium's emulated latency: each message waits half a round trip.
  if (RTT)
    await context.routeWebSocket(/\/api\/socket/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((m) => setTimeout(() => server.send(m), RTT / 2));
      server.onMessage((m) => setTimeout(() => socket.send(m), RTT / 2));
      socket.onClose((code, reason) => void server.close({ code, reason }));
      server.onClose((code, reason) => void socket.close({ code, reason }));
    });
  return context;
}

const rows: string[] = [];

/** Runs `act` on `page` and waits for `ready`, then reports what showed in between. */
async function move(name: string, page: Page, act: () => Promise<unknown>, ready: () => Locator) {
  const fresh = page.url() === "about:blank";
  const start = await page.evaluate<number>("performance.now()").catch(() => 0);
  const before = await page.evaluate<number>("window.__perf.length").catch(() => 0);
  await act();
  // Not `expect`, whose polling backs off to a second: this notices on the frame.
  await ready().waitFor({ state: "visible", timeout: 15_000 });
  const readyAt = await page.evaluate<number>("performance.now()");
  await page.waitForTimeout(600);
  const log = await page.evaluate<Change[]>(`window.__perf.slice(${before})`);
  const intervals: Interval[] = [];
  for (const e of log) {
    if (e.on) intervals.push({ kind: e.kind, from: e.t, to: null });
    else {
      const open = [...intervals].reverse().find((i) => i.kind === e.kind && i.to === null);
      if (open) open.to = e.t;
    }
  }
  const origin = fresh ? 0 : start;
  const shown = intervals
    .map((i) => `${i.kind} ${Math.round(i.from - origin)}+${i.to === null ? "∞" : Math.round(i.to - i.from)}`)
    .join(", ");
  const flashes = intervals.filter((i) => i.to !== null && i.to - i.from < FLASH_MS);
  rows.push(
    `${flashes.length ? "FLASH" : "ok   "}  ${name.padEnd(34)} ready ${String(Math.round(readyAt - origin)).padStart(5)}ms  ${shown || "-"}`,
  );
  return flashes.length;
}

test("moving around the app", async ({ browser, baseURL }) => {
  let flashes = 0;

  const ownerContext = await newContext(browser, baseURL);
  const fresh = async () => {
    const page = await ownerContext.newPage();
    await slow(ownerContext, page);
    return page;
  };

  const setup = await fresh();
  flashes += await move(
    "setup → room",
    setup,
    () => setup.goto(`/setup#${SETUP_SECRET}`),
    () => setup.getByRole("heading", { name: "First room" }),
  );
  const room = setup.url();
  const here = (page: Page) => page.getByRole("region", { name: "Here", exact: true });

  const reload = await fresh();
  flashes += await move(
    "open the room (new tab)",
    reload,
    () => reload.goto(room),
    () => here(reload).getByRole("link", { name: /you/ }),
  );

  const owner = await fresh();
  flashes += await move(
    "open /owner (new tab)",
    owner,
    () => owner.goto("/owner"),
    () => owner.getByRole("list").first(),
  );
  for (const section of ["Invites", "Rooms", "Usage", "People", "Invites"]) {
    flashes += await move(
      `owner: ${section}`,
      owner,
      () => owner.getByRole("navigation", { name: "Owner page" }).getByRole("link", { name: section }).click(),
      () => owner.getByRole("heading", { name: section, level: 1 }),
    );
  }

  flashes += await move(
    "owner: house → the one room",
    owner,
    () => owner.getByRole("link", { name: "Rooms" }).first().click(),
    () => here(owner).getByRole("link", { name: /you/ }),
  );

  const you = await fresh();
  flashes += await move("open /you (new tab)", you, () => you.goto("/you"), () => you.getByLabel("Your devices"));

  // A second room, so the root address lists them.
  expect((await ownerContext.request.post("/api/owner/rooms", { data: { name: "Second room" } })).status()).toBe(200);
  const list = await fresh();
  flashes += await move(
    "open / with two rooms (new tab)",
    list,
    () => list.goto("/"),
    () => list.getByRole("link", { name: /Second room/ }),
  );
  flashes += await move(
    "list → Second room",
    list,
    () => list.getByRole("link", { name: /Second room/ }).click(),
    () => list.getByRole("heading", { name: "Second room" }),
  );
  flashes += await move(
    "Second room → house → list",
    list,
    () => list.getByRole("link", { name: "Rooms" }).first().click(),
    () => list.getByRole("link", { name: /First room/ }),
  );
  flashes += await move(
    "list → First room",
    list,
    () => list.getByRole("link", { name: /First room/ }).click(),
    () => list.getByRole("heading", { name: "First room" }),
  );
  flashes += await move("back → list", list, () => list.goBack(), () => list.getByRole("link", { name: /Second room/ }));

  console.log(`\nRTT ${RTT}ms (intervals: kind start+duration, from the move's start)\n${rows.join("\n")}\n`);
  expect(flashes, "moves that flashed a loading state").toBe(0);
});
