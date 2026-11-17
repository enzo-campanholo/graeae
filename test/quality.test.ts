// A viewer's choice of quality: "Auto", "1080p" or "720p" on each watched screen share
// that goes out at two qualities, as its sharer says when it starts. The choice goes
// through the instance, which sets the preferred quality on the media server mid-watch.
// Tabs are driven only through their sockets and the instance's HTTP routes; the fake
// media server shows what it was asked.

import { describe, expect, it } from "vitest";
import type { LiveShare, QualityChoice } from "../src/shared/socket/index.ts";
import { startInstance } from "./harness.ts";
import { addMember, connectMedia, setUpOwner, shareScreen, shareWebcam, watch } from "./steps.ts";
import { openRoom, type Tab } from "./sockets.ts";

/** An owner watching nothing yet, and Bia, a member, each with a tab open on the first room. */
async function twoPresent() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const { browser: bia } = await addMember(instance, owner, "Bia");
  const { tab: ownerTab, state: ownerState } = await openRoom(owner, room);
  const { tab: biaTab, state: biaState } = await openRoom(bia, room);
  await ownerTab.next(); // Bia arrived
  return { instance, owner, bia, room, ownerTab, biaTab, ownerId: ownerState.people.you.id, biaId: biaState.people.you.id };
}

/**
 * The owner watching Bia's screen share, sent from a browser of `browser`'s family, at
 * two qualities unless `twoQualities` says otherwise.
 */
async function watchingBiasScreen({ browser = "chromium" as "chromium" | "firefox", twoQualities = true } = {}) {
  const present = await twoPresent();
  await shareScreen(present.biaTab, { browser, twoQualities });
  const started = await present.ownerTab.next();
  if (started.type !== "shares" || started.change.type !== "started") throw new Error("expected Bia's screen share");
  const screen: LiveShare = { member: present.biaId, kind: "screen" };
  await connectMedia(present.ownerTab);
  const mid = await watch(present.ownerTab, screen);
  return { ...present, screen, listed: started.change.share, mid };
}

function choose(tab: Tab, share: LiveShare, quality: unknown) {
  tab.send({ type: "watching", request: { type: "quality", share, quality: quality as QualityChoice } });
}

describe("a Chromium screen share sent at two qualities", () => {
  it("is listed as having two qualities, and a viewer's pull asks the media server for Auto", async () => {
    const { instance, listed, biaId, mid } = await watchingBiasScreen();

    expect(listed).toEqual({ member: biaId, kind: "screen", audio: true, twoQualities: true });
    expect(instance.media.preferred()).toEqual([{ mid, quality: "auto" }]);
  });

  it("can be received at 720p by one viewer while the others keep Auto", async () => {
    const { instance, owner, room, ownerTab, screen, mid } = await watchingBiasScreen();
    const { tab: second } = await openRoom(owner, room);
    await connectMedia(second);
    const secondMid = await watch(second, screen);

    choose(ownerTab, screen, "720p");

    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: screen, quality: "720p" } });
    expect(instance.media.preferred()).toEqual([
      { mid, quality: "720p" },
      { mid: secondMid, quality: "auto" },
    ]);
    await second.heartbeat();
    expect(second.queued()).toEqual([]);
  });

  it("can be set to 1080p, and back to Auto, mid-watch", async () => {
    const { instance, ownerTab, screen, mid } = await watchingBiasScreen();

    choose(ownerTab, screen, "1080p");
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: screen, quality: "1080p" } });
    expect(instance.media.preferred()).toEqual([{ mid, quality: "1080p" }]);

    choose(ownerTab, screen, "auto");
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: screen, quality: "auto" } });
    expect(instance.media.preferred()).toEqual([{ mid, quality: "auto" }]);
  });

  it("tells nobody but the viewer's own tab of the choice", async () => {
    const { ownerTab, biaTab, screen } = await watchingBiasScreen();
    await biaTab.next(); // the owner is watching
    choose(ownerTab, screen, "720p");
    await ownerTab.next();

    await biaTab.heartbeat();
    expect(biaTab.queued()).toEqual([]);
  });

  it("keeps its viewer's choice through a restart", async () => {
    const { instance, owner, room, ownerTab, screen } = await watchingBiasScreen();
    choose(ownerTab, screen, "720p");
    await ownerTab.next();

    await instance.restart();
    const { state } = await openRoom(owner, room, { tab: ownerTab.id });

    expect(state.watching.stage).toEqual([screen]);
    expect(state.watching.qualities).toEqual([{ share: screen, quality: "720p" }]);
  });

  it("starts at Auto again when watched again", async () => {
    const { instance, ownerTab, screen } = await watchingBiasScreen();
    choose(ownerTab, screen, "720p");
    await ownerTab.next();
    ownerTab.send({ type: "watching", request: { type: "unwatch", share: screen } });
    await ownerTab.next();

    const mid = await watch(ownerTab, screen);

    expect(instance.media.preferred()).toEqual([{ mid, quality: "auto" }]);
  });
});

describe("a choice of quality", () => {
  it("keeps the quality as it was when the media server fails it", async () => {
    const { instance, ownerTab, screen, mid } = await watchingBiasScreen();
    instance.media.fail("setQuality");

    choose(ownerTab, screen, "720p");

    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: screen, quality: "auto" } });
    expect(instance.media.preferred()).toEqual([{ mid, quality: "auto" }]);
  });

  it("is ignored for a share the tab does not watch", async () => {
    const { instance, owner, room, screen } = await watchingBiasScreen();
    const { tab: other } = await openRoom(owner, room);

    choose(other, screen, "720p");

    await other.heartbeat();
    expect(other.queued()).toEqual([]);
    expect(instance.media.calls("setQuality")).toBe(0);
  });

  it("is ignored when it names no quality graeae has", async () => {
    const { instance, ownerTab, screen } = await watchingBiasScreen();

    for (const quality of ["480p", "1440p", null, 720]) choose(ownerTab, screen, quality);

    await ownerTab.heartbeat();
    expect(ownerTab.queued()).toEqual([]);
    expect(instance.media.calls("setQuality")).toBe(0);
  });
});

describe("a share with one quality", () => {
  it("is a Chromium screen share sent at one quality: listed with no choice, and pulled with no preferred quality", async () => {
    const { instance, listed, biaId, ownerTab, screen } = await watchingBiasScreen({ twoQualities: false });

    expect(listed).toEqual({ member: biaId, kind: "screen", audio: true });
    expect(instance.media.preferred()).toEqual([]);

    choose(ownerTab, screen, "720p");
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: screen, quality: "auto" } });
    expect(instance.media.calls("setQuality")).toBe(0);
  });

  it("is a Firefox screen share, even one whose sharer says it sends two", async () => {
    const { instance, listed, biaId, ownerTab, screen } = await watchingBiasScreen({ browser: "firefox" });

    expect(listed).toEqual({ member: biaId, kind: "screen", audio: true });
    expect(instance.media.preferred()).toEqual([]);

    choose(ownerTab, screen, "720p");
    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: screen, quality: "auto" } });
    expect(instance.media.calls("setQuality")).toBe(0);
  });

  it("is a webcam share, from any browser", async () => {
    const { instance, biaTab, ownerTab, biaId } = await twoPresent();
    await shareWebcam(biaTab);
    expect(await ownerTab.next()).toEqual({
      type: "shares",
      change: { type: "started", share: { member: biaId, kind: "webcam" } },
    });
    const webcam: LiveShare = { member: biaId, kind: "webcam" };
    await connectMedia(ownerTab);
    await watch(ownerTab, webcam);

    choose(ownerTab, webcam, "720p");

    expect(await ownerTab.next()).toEqual({ type: "watching", change: { type: "quality", share: webcam, quality: "auto" } });
    expect(instance.media.preferred()).toEqual([]);
  });
});
