// The usage count: what members' tabs receive over their media connections, as each tab
// reports it over its socket, with the instance's own rules on top (the 5% margin, the
// maximum bitrate where a tab fell silent, relayed watching twice), counted for the month
// that resets on the owner's day. Tabs are driven only through their sockets; the owner
// reads the count over HTTP, as the owner page does.

import { describe, expect, it } from "vitest";
import type { UsageAnswer } from "../src/shared/api.ts";
import type { LiveShare } from "../src/shared/socket/index.ts";
import { startInstance, type TestBrowser } from "./harness.ts";
import { addMember, connectMedia, setUpOwner, shareScreen, shareWebcam, stopWatching, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;
const DAY = 86_400_000;

/** What the room client sends every few seconds: its media connection's running total received. */
async function report(tab: Tab, received: number, { relayed = false, final = false } = {}) {
  tab.send({ type: "usage", request: { type: "received", bytes: received, relayed, ...(final ? { final: true } : {}) } });
  // The answer to a heartbeat comes once the instance has read everything sent before it.
  await tab.heartbeat();
}

async function usage(owner: TestBrowser): Promise<UsageAnswer> {
  const response = await owner.fetch("/api/owner/usage");
  expect(response.status).toBe(200);
  return response.json<UsageAnswer>();
}

/** The owner, with a tab open on the first room whose media connection is made. */
async function ownerConnected() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { tab } = await openRoom(owner, room);
  await connectMedia(tab);
  return { instance, owner, room, tab };
}

describe("the bytes a tab reports", () => {
  it("are charged in full from the first report, with 5% added", async () => {
    const { owner, tab } = await ownerConnected();

    await report(tab, 1_000_000);

    expect((await usage(owner)).used).toBe(1_050_000);
  });
});

/** The owner and Bia in the first room, Bia sharing (a webcam unless said), the owner watching it on `tab`. */
async function ownerWatchingBia({ kind = "webcam" as "webcam" | "chromium screen" | "firefox screen" } = {}) {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await tab.next(); // Bia arrived
  if (kind === "webcam") await shareWebcam(biaTab);
  else await shareScreen(biaTab, { browser: kind === "firefox screen" ? "firefox" : "chromium" });
  await tab.next(); // Bia's share started
  const share: LiveShare = { member: biaState.people.you.id, kind: kind === "webcam" ? "webcam" : "screen" };
  await connectMedia(tab);
  await watch(tab, share);
  return { instance, owner, bia, room, tab, biaTab, share };
}

describe("the bytes a tab reports", () => {
  it("are charged as the difference between one running total and the next", async () => {
    const { owner, tab } = await ownerConnected();

    await report(tab, 1_000_000);
    await report(tab, 3_000_000);

    expect((await usage(owner)).used).toBe(3_150_000);
  });

  it("are made up by the next report when one is lost", async () => {
    const { owner, tab } = await ownerConnected();

    await report(tab, 1_000_000);
    // The report of 2,000,000 never arrived.
    await report(tab, 5_000_000);

    expect((await usage(owner)).used).toBe(5_250_000);
  });

  it("count from zero again after a final total, sent before a connection restart", async () => {
    const { owner, tab } = await ownerConnected();

    await report(tab, 4_000_000);
    await report(tab, 6_000_000, { final: true });
    await report(tab, 1_000_000);

    expect((await usage(owner)).used).toBe(7_350_000);
  });

  it("count from zero again when a total is lower than the last, the final one having been lost", async () => {
    const { owner, tab } = await ownerConnected();

    await report(tab, 4_000_000);
    await report(tab, 1_000_000);

    expect((await usage(owner)).used).toBe(5_250_000);
  });

  it("are counted twice while the media connection is on the relay", async () => {
    const { owner, tab } = await ownerConnected();

    await report(tab, 1_000_000, { relayed: true });
    expect((await usage(owner)).used).toBe(2_100_000);

    await report(tab, 2_000_000, { relayed: false });
    expect((await usage(owner)).used).toBe(3_150_000);
  });

  it("are counted from each tab apart", async () => {
    const { owner, room, tab } = await ownerConnected();
    const { tab: second } = await openRoom(owner, room);
    await connectMedia(second);

    await report(tab, 1_000_000);
    await report(second, 2_000_000);
    await report(tab, 1_500_000);

    expect((await usage(owner)).used).toBe(3_675_000);
  });

  it("carry on from the last report through a restart of the instance", async () => {
    const { instance, owner, room, tab } = await ownerConnected();
    await report(tab, 1_000_000);

    await instance.restart();
    // The browser reconnects within its grace period and takes its tab back.
    const { tab: back } = await openRoom(owner, room);
    await report(back, 3_000_000);

    expect((await usage(owner)).used).toBe(3_150_000);
  });

  it("are ignored when they are not a whole number of bytes, or do not say whether they are relayed", async () => {
    const { owner, tab } = await ownerConnected();

    for (const bytes of [-1, 1.5, "1000", null, Number.MAX_VALUE]) {
      tab.send({ type: "usage", request: { type: "received", bytes: bytes as number, relayed: false } });
    }
    tab.send({ type: "usage", request: { type: "received", bytes: 1000 } as never });
    await tab.heartbeat();

    expect((await usage(owner)).used).toBe(0);
  });
});

describe("where no later total arrives", () => {
  it.each([
    { kind: "webcam" as const, gap: 750_000 }, // 1.5 Mbps for 4 s
    { kind: "chromium screen" as const, gap: 6_000_000 }, // 12 Mbps for 4 s
    { kind: "firefox screen" as const, gap: 3_000_000 }, // 6 Mbps for 4 s
  ])("a watched $kind share is charged at its maximum bitrate from the last report until the watch ends", async ({ kind, gap }) => {
    const { instance, owner, tab } = await ownerWatchingBia({ kind });
    await report(tab, 1_000_000);

    await instance.clock.advance(4 * SECOND);
    await tab.close();

    expect((await usage(owner)).used).toBe(1_050_000 + gap);
  });

  it("a tab that falls silent is charged until its grace period runs out and the watch ends", async () => {
    const { instance, owner, tab, biaTab } = await ownerWatchingBia();
    await report(tab, 1_000_000);

    await instance.clock.advance(10 * SECOND);
    await biaTab.heartbeat();
    await tab.drop();
    for (let i = 0; i < 3; i++) {
      await instance.clock.advance(10 * SECOND);
      await biaTab.heartbeat();
    }

    // 30 seconds from the last report to the end of the grace period, at 1.5 Mbps.
    expect((await usage(owner)).used).toBe(1_050_000 + 5_625_000);
  });

  it("a tab that reconnects in its grace period has the gap covered by its next report instead", async () => {
    const { instance, owner, room, tab } = await ownerWatchingBia();
    await report(tab, 1_000_000);

    await tab.drop();
    await instance.clock.advance(10 * SECOND);
    const { tab: back } = await openRoom(owner, room);
    await report(back, 4_000_000);

    expect((await usage(owner)).used).toBe(4_200_000);
  });

  it("a watch with no report at all is charged from its start", async () => {
    const { instance, owner, tab } = await ownerWatchingBia();

    await instance.clock.advance(3 * SECOND);
    await tab.close();

    expect((await usage(owner)).used).toBe(562_500);
  });

  it("a watch that ends while its tab carries on is covered by the tab's next report", async () => {
    const { instance, owner, tab, share } = await ownerWatchingBia();
    await report(tab, 1_000_000);

    await instance.clock.advance(2 * SECOND);
    stopWatching(tab, share);
    expect(await tab.next()).toEqual({ type: "watching", change: { type: "unwatched", share } });
    await instance.clock.advance(3 * SECOND);
    await report(tab, 2_000_000);
    await instance.clock.advance(3 * SECOND);
    await tab.close();

    expect((await usage(owner)).used).toBe(2_100_000);
  });

  it("a watch that ended, with no report after it before the tab left, is charged until it ended", async () => {
    const { instance, owner, tab, share } = await ownerWatchingBia();
    await report(tab, 1_000_000);

    await instance.clock.advance(2 * SECOND);
    stopWatching(tab, share);
    expect(await tab.next()).toEqual({ type: "watching", change: { type: "unwatched", share } });
    await instance.clock.advance(3 * SECOND);
    await tab.close();

    // Two seconds at 1.5 Mbps, not five.
    expect((await usage(owner)).used).toBe(1_050_000 + 375_000);
  });

  it("relayed watching is charged twice", async () => {
    const { instance, owner, tab } = await ownerWatchingBia();
    await report(tab, 1_000_000, { relayed: true });

    await instance.clock.advance(4 * SECOND);
    await tab.close();

    expect((await usage(owner)).used).toBe(2_100_000 + 1_500_000);
  });

  it("a sharer's upload is not charged: a share adds only what its viewers receive", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { tab } = await openRoom(owner, room);
    await shareWebcam(tab);
    // What a sharer's connection receives is the media server's feedback, a trickle.
    await report(tab, 10_000);

    await instance.clock.advance(60 * SECOND);
    await tab.close();

    expect((await usage(owner)).used).toBe(10_500);
  });
});

describe("the month", () => {
  /** Opens a new tab for the owner, has it report `bytes` received, and closes it. */
  async function receivedToday(owner: TestBrowser, room: string, bytes: number) {
    const { tab } = await openRoom(owner, room);
    await connectMedia(tab);
    await report(tab, bytes);
    await tab.close();
  }

  function setResetDay(owner: TestBrowser, day: unknown) {
    return owner.fetch("/api/owner/usage/reset-day", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
    });
  }

  it("resets on the first of the month, at midnight UTC, unless the owner says otherwise", async () => {
    const instance = await startInstance({ startAt: new Date("2037-01-20T15:00:00Z") });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await receivedToday(owner, room, 1_000_000);

    expect(await usage(owner)).toMatchObject({
      used: 1_050_000,
      resetDay: 1,
      since: Date.parse("2037-01-01T00:00:00Z"),
      until: Date.parse("2037-02-01T00:00:00Z"),
    });

    await instance.clock.advance(Date.parse("2037-01-31T23:59:59Z") - instance.clock.now());
    expect((await usage(owner)).used).toBe(1_050_000);
    await instance.clock.advance(SECOND);
    expect(await usage(owner)).toMatchObject({ used: 0, since: Date.parse("2037-02-01T00:00:00Z") });
  });

  it("resets on the day the owner sets, and changing it recounts nothing", async () => {
    const instance = await startInstance({ startAt: new Date("2037-01-10T12:00:00Z") });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await receivedToday(owner, room, 1_000_000);

    const set = await setResetDay(owner, 15);
    expect(set.status).toBe(200);
    expect(await set.json<UsageAnswer>()).toMatchObject({
      used: 1_050_000,
      resetDay: 15,
      since: Date.parse("2036-12-15T00:00:00Z"),
      until: Date.parse("2037-01-15T00:00:00Z"),
    });

    await instance.clock.advance(Date.parse("2037-01-15T00:00:00Z") - instance.clock.now());
    expect((await usage(owner)).used).toBe(0);
    await receivedToday(owner, room, 2_000_000);
    expect((await usage(owner)).used).toBe(2_100_000);

    // Back to the first: the month now holds both days.
    await setResetDay(owner, 1);
    expect(await usage(owner)).toMatchObject({ used: 3_150_000, since: Date.parse("2037-01-01T00:00:00Z") });
  });

  it("resets on the last day of a month too short for the owner's day", async () => {
    const instance = await startInstance({ startAt: new Date("2037-02-10T00:00:00Z") });
    const owner = instance.browser();
    await setUpOwner(owner);

    await setResetDay(owner, 31);

    expect(await usage(owner)).toMatchObject({
      since: Date.parse("2037-01-31T00:00:00Z"),
      until: Date.parse("2037-02-28T00:00:00Z"),
    });
    await instance.clock.advance(20 * DAY);
    expect(await usage(owner)).toMatchObject({
      since: Date.parse("2037-02-28T00:00:00Z"),
      until: Date.parse("2037-03-31T00:00:00Z"),
    });
  });

  it("refuses a reset day that is not a day of the month", async () => {
    const { owner } = await ownerConnected();
    const nothing = await owner.fetch("/no/such/address");

    for (const day of [0, 32, 1.5, "15", null]) {
      const refused = await setResetDay(owner, day);
      expect(refused.status).toBe(nothing.status);
    }
    expect((await usage(owner)).resetDay).toBe(1);
  });

  it("is projected to its end at the same daily rate as the month so far", async () => {
    const instance = await startInstance({ startAt: new Date("2037-01-01T06:00:00Z") });
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await receivedToday(owner, room, 10_000_000_000);

    // The first day counts as a whole one: 10.5 GB a day for 31 days.
    expect(await usage(owner)).toMatchObject({ used: 10_500_000_000, projected: 325_500_000_000 });

    await instance.clock.advance(Date.parse("2037-01-11T00:00:00Z") - instance.clock.now());
    // 10.5 GB in 10 days, for 31 days.
    expect(await usage(owner)).toMatchObject({ used: 10_500_000_000, projected: 32_550_000_000 });
  });

  it("is held against a usage budget of 1,000 GB", async () => {
    const { owner } = await ownerConnected();

    expect((await usage(owner)).budget).toBe(1_000_000_000_000);
  });
});

describe("members", () => {
  it("see nothing about usage", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const nothing = await bia.fetch("/no/such/address");

    const read = await bia.fetch("/api/owner/usage");
    const set = await bia.fetch("/api/owner/usage/reset-day", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: 15 }),
    });
    const { state } = await openRoom(bia, room);

    expect(read.status).toBe(nothing.status);
    expect(await read.text()).toBe(await nothing.text());
    expect(set.status).toBe(nothing.status);
    expect(state.usage).toEqual({});
    expect((await usage(owner)).resetDay).toBe(1);
  });
});
