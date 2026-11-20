// The instance's logs (ticket 48): a tab's batches of events, over its socket or posted
// to `/api/log`, are written as lines tagged by the instance, and change nothing anyone
// sees; and no line carries a secret.

import { describe, expect, it } from "vitest";
import type { LogRequest, TabEvent } from "../src/shared/socket/log.ts";
import { SETUP_SECRET, startInstance, type TestInstance } from "./harness.ts";
import { addMember, connectMedia, FAKE_OFFER, invite, pressJoin, setUpOwner, shareWebcam, watch } from "./steps.ts";
import { addressOf, openList, openRoom } from "./sockets.ts";

/** A batch of one event, which claims to come from someone else entirely. */
function batch(event = "test.event"): LogRequest {
  const claimed: TabEvent = {
    event,
    at: 1,
    up: 2,
    page: "page-1",
    source: "instance",
    member: "someone-else",
    device: "another-device",
    tab: "another-tab",
    room: "another-room",
    detail: { note: "yes" },
  };
  return { type: "events", events: [claimed] };
}

function linesOf(instance: TestInstance, event: string) {
  return instance.logs().filter((line) => line.event === event);
}

async function ownerAndBia() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = addressOf(await setUpOwner(owner));
  const { browser: bia } = await addMember(instance, owner, "Bia", [room]);
  return { instance, owner, bia, room };
}

describe("a tab's log batches", () => {
  it("over a room's socket are written as the socket's own, and change nothing any tab sees", async () => {
    const { instance, owner, bia, room } = await ownerAndBia();
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state: before } = await openRoom(bia, room);
    await ownerTab.heartbeat();
    ownerTab.queued().splice(0);
    const ownerSeen = ownerTab.received().length;
    const biaSeen = biaTab.received().length;

    biaTab.send({ type: "log", request: batch() });
    await biaTab.heartbeat();
    await ownerTab.heartbeat();

    expect(biaTab.received()).toHaveLength(biaSeen);
    expect(ownerTab.received()).toHaveLength(ownerSeen);
    expect((await openRoom(bia, room)).state).toEqual(before);
    const [line] = linesOf(instance, "test.event");
    const open = instance.logs().find((other) => other.event === "ws.open" && other.tab === biaTab.id);
    expect(line).toMatchObject({
      source: "tab",
      at: 1,
      up: 2,
      page: "page-1",
      member: open?.member,
      device: open?.device,
      tab: biaTab.id,
      room,
      detail: { note: "yes" },
    });
    expect(open).toMatchObject({ name: "Bia" });
  });

  it("over the list of rooms' socket are written as the list's own, and change nothing it sees", async () => {
    const { instance, bia } = await ownerAndBia();
    const { tab, state } = await openList(bia);
    const seen = tab.received().length;

    tab.send({ type: "log", request: batch("test.from-list") });
    await tab.heartbeat();

    expect(tab.received()).toHaveLength(seen);
    expect((await openList(bia)).state).toEqual(state);
    const [line] = linesOf(instance, "test.from-list");
    expect(line).toMatchObject({ source: "tab", page: "page-1", member: expect.any(String), device: expect.any(String) });
    expect(line?.member).not.toBe("someone-else");
    expect(line?.device).not.toBe("another-device");
    expect(line).not.toHaveProperty("room");
  });

  it("posted from a remembered device are written as that device's", async () => {
    const { instance, bia } = await ownerAndBia();

    const answer = await bia.fetch("/api/log", { method: "POST", body: JSON.stringify(batch("test.posted")) });

    expect(answer.status).toBe(204);
    const [line] = linesOf(instance, "test.posted");
    expect(line).toMatchObject({ source: "tab", member: expect.any(String), device: expect.any(String) });
    expect(line?.member).not.toBe("someone-else");
    expect(line).not.toHaveProperty("tab");
    expect(line).not.toHaveProperty("room");
  });

  it("posted by a stranger get the one answer every refused address gets, and are not written", async () => {
    const { instance } = await ownerAndBia();
    const stranger = instance.browser();

    const posted = await stranger.fetch("/api/log", { method: "POST", body: JSON.stringify(batch("test.stranger")) });
    const refused = await stranger.fetch("/a/b/c");

    expect(await describeAnswer(posted)).toEqual(await describeAnswer(refused));
    expect(linesOf(instance, "test.stranger")).toEqual([]);
  });
});

describe("the instance's own lines", () => {
  it("record a setup, an invite, a share and a watch, and carry no secret", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = addressOf(await setUpOwner(owner));
    const pending = await invite(owner, "Bia", [room]);
    const bia = instance.browser();
    await pressJoin(bia, pending.code);
    const { tab: ownerTab, state } = await openRoom(owner, room);
    const { tab: biaTab } = await openRoom(bia, room);
    await ownerTab.next(); // Bia arrived
    await shareWebcam(ownerTab);
    await biaTab.next(); // the owner's webcam started
    const iceServers = await connectMedia(biaTab);
    await watch(biaTab, { member: state.people.you.id, kind: "webcam" });
    await ownerTab.close();

    const events = new Set(instance.logs().map((line) => line.event));
    for (const event of ["http", "owner.setup", "invite.made", "invite.used", "ws.open", "share.live", "watch.started", "share.ended", "media-server"]) {
      expect(events, event).toContain(event);
    }
    const written = JSON.stringify(instance.logs());
    const tokens = [...owner.cookies().matchAll(/=([^;]+)/g), ...bia.cookies().matchAll(/=([^;]+)/g)].map((m) => m[1]!);
    const credentials = iceServers.flatMap((server) => [server.username, server.credential]).filter((value) => value !== undefined);
    for (const secret of [SETUP_SECRET, pending.code, FAKE_OFFER, ...tokens, ...credentials]) {
      expect(written, secret).not.toContain(secret);
    }
  });
});

async function describeAnswer(response: Response) {
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}
