// A forced close that fails keeps its record and is tried again on a backoff, 1 s, 2 s,
// 4 s and so on up to 30 s between tries, until it succeeds or a sweep shows the track
// gone. The owner's page shows a removal as done at once, and hears after a minute of
// failing closes that the cut-off could not be confirmed.
//
// The fake media server is told to fail closes; how many queued failures are left shows
// how many tries the instance has made.

import { describe, expect, it, vi } from "vitest";
import type { PeopleAnswer } from "../src/shared/api.ts";
import type { LiveShare } from "../src/shared/socket/index.ts";
import { startInstance, type TestBrowser, type TestInstance } from "./harness.ts";
import { addMember, connectMedia, setUpOwner, shareWebcam, stopWebcam, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

const SECOND = 1000;

/** Moves the clock on by `ms`, with each of `alive` beating every 5 seconds on the way. */
async function pass(instance: TestInstance, ms: number, alive: Tab[]) {
  for (let left = ms; left > 0; left -= 5 * SECOND) {
    await instance.clock.advance(Math.min(left, 5 * SECOND));
    for (const tab of alive) await tab.heartbeat();
  }
}

/** The owner watching Bia's webcam, each with a tab open on the first room. */
async function ownerWatchingBia() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab } = await openRoom(owner, room);
  const { tab: biaTab, state } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  await shareWebcam(biaTab);
  await ownerTab.next(); // her webcam went live
  const biasWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
  await connectMedia(ownerTab, "receiving");
  await watch(ownerTab, biasWebcam);
  await biaTab.next(); // the owner is watching
  return { instance, owner, bia, room, ownerTab, biaTab, biasWebcam, biaId: biasWebcam.member };
}

/**
 * Waits, in real time, until `condition` holds. Unlike `vi.waitFor`, it leaves the test's
 * clock where it is.
 */
async function until(condition: () => boolean) {
  for (let tries = 0; !condition(); tries++) {
    if (tries > 200) throw new Error("the condition never held");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function people(owner: TestBrowser): Promise<PeopleAnswer> {
  const response = await owner.fetch("/api/owner/people");
  expect(response.status).toBe(200);
  return response.json<PeopleAnswer>();
}

function removeFromInstance(owner: TestBrowser, member: string) {
  return owner.fetch(`/api/owner/people/${member}`, { method: "DELETE" });
}

describe("a failed forced close", () => {
  it("ends the share for the room at once, keeps its record, and is tried again a second later", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await ownerWatchingBia();
    instance.media.fail("close");

    stopWebcam(biaTab);
    await biaTab.heartbeat();
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([
      { type: "shares", change: { type: "ended", share: biasWebcam } },
      { type: "watching", change: { type: "unwatched", share: biasWebcam } },
    ]);
    await ownerTab.next();
    await ownerTab.next();
    expect(instance.media.connections().flat()).toHaveLength(2);

    await instance.clock.advance(SECOND - 1);
    await ownerTab.heartbeat();
    expect(instance.media.connections().flat()).toHaveLength(2);

    // The try that succeeds tells nobody anything more.
    await instance.clock.advance(1);
    await vi.waitFor(() => expect(instance.media.connections().flat()).toEqual([]));
    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([]);
  });

  it("is tried again after 1 s, 2 s, 4 s, 8 s, 16 s, then every 30 s, until it succeeds", async () => {
    const { instance, ownerTab, biaTab, biasWebcam } = await ownerWatchingBia();
    for (let i = 0; i < 8; i++) instance.media.fail("close");

    stopWebcam(biaTab);
    await biaTab.heartbeat();
    expect(instance.media.queued("close")).toBe(7);

    for (const [wait, left] of [
      [1, 6],
      [2, 5],
      [4, 4],
      [8, 3],
      [16, 2],
      [30, 1],
      [30, 0],
    ] as const) {
      await pass(instance, wait * SECOND - 1, [ownerTab, biaTab]);
      expect(instance.media.queued("close"), `a try came before ${wait} s`).toBe(left + 1);
      await instance.clock.advance(1);
      expect(instance.media.queued("close"), `no try after ${wait} s`).toBe(left);
    }
    expect(instance.media.connections().flat()).toHaveLength(2);

    await pass(instance, 30 * SECOND, [ownerTab, biaTab]);
    expect(ownerTab.queued()).toContainEqual({ type: "shares", change: { type: "ended", share: biasWebcam } });
    expect(instance.media.connections().flat()).toEqual([]);
  });

  it("is tried no more once a sweep shows its track gone", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: biaTab, state } = await openRoom(bia, room);
    await shareWebcam(biaTab);
    const biaId = state.people.you.id;
    // The media server closes the track but reports a failure, then fails every close.
    instance.media.fail("close", { done: true });
    for (let i = 0; i < 3; i++) instance.media.fail("close");
    stopWebcam(biaTab);
    await biaTab.heartbeat();
    expect(instance.media.connections().flat()).toEqual([]);

    // The restart sweeps every media connection on record.
    await instance.restart();
    const { tab: back } = await openRoom(bia, room);

    await vi.waitFor(async () =>
      expect((await people(owner)).people.find((person) => person.id === biaId)!.sharing).toEqual([]),
    );
    await pass(instance, 2 * 60 * SECOND, [back]);
    expect(instance.media.queued("close")).toBe(3);
  });
});

describe("a removal whose closes fail", () => {
  it("shows as done at once on the owner's page, whatever the media server is doing", async () => {
    const { instance, owner, biaId } = await ownerWatchingBia();
    const close = instance.media.hold("close");

    const removed = await removeFromInstance(owner, biaId);

    expect(removed.status).toBe(204);
    expect((await people(owner)).people.map((person) => person.id)).not.toContain(biaId);
    close.release();
  });

  it("warns the owner once closes have failed for a minute, and stops once one succeeds", async () => {
    const { instance, owner, ownerTab, biaId } = await ownerWatchingBia();
    // The first close and every try up to a minute later fail: at 0, 1, 3, 7, 15, 31 and 61 s.
    for (let i = 0; i < 7; i++) instance.media.fail("close");

    expect((await removeFromInstance(owner, biaId)).status).toBe(204);
    await until(() => instance.media.queued("close") === 6);
    expect((await people(owner)).unconfirmed).toEqual([]);

    await pass(instance, 60 * SECOND - 1, [ownerTab]);
    expect((await people(owner)).unconfirmed).toEqual([]);
    await instance.clock.advance(1);
    expect((await people(owner)).unconfirmed).toEqual([{ member: biaId, name: "Bia" }]);
    // Her webcam and the owner's pull of it are still open.
    expect(instance.media.connections().flat()).toHaveLength(2);

    // The try at 91 s succeeds.
    await pass(instance, 31 * SECOND, [ownerTab]);
    expect((await people(owner)).unconfirmed).toEqual([]);
    expect(instance.media.connections().flat()).toEqual([]);
  });
});
