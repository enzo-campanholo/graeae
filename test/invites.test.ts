import { describe, expect, it } from "vitest";
import { startInstance, type TestBrowser, type TestInstance } from "./harness.ts";
import { addMember, answer, createInvite, invite, pressJoin, setUpOwner } from "./steps.ts";
import { openRoom } from "./sockets.ts";

const DAY = 24 * 60 * 60 * 1000;
const INVITE_LIFE = 7 * DAY;

/** An instance with its owner set up, and the answer it gives any refused address. */
async function withOwner() {
  const instance = await startInstance();
  const owner = instance.browser();
  const room = await setUpOwner(owner);
  const refused = await answer(await instance.fetch("/a-refused-address"));
  return { instance, owner, room, refused };
}

/** Everything a browser can do with an invite's code, each compared whole with a refusal. */
async function expectNothingHere(instance: TestInstance, code: string, refused: Awaited<ReturnType<typeof answer>>) {
  const stranger = instance.browser();
  expect(await answer(await stranger.fetch(`/invite/${code}`))).toEqual(refused);
  expect(await answer(await stranger.fetch(`/api/invites/${code}`))).toEqual(refused);
  expect(await answer(await pressJoin(stranger, code))).toEqual(refused);
  expect((await stranger.fetch("/")).status).toBe(404);
}

async function pending(owner: TestBrowser) {
  return (await (await owner.fetch("/api/owner/invites")).json<{ invites: { code: string }[] }>()).invites;
}

describe("an owner's invite", () => {
  it("lets the invited person join by pressing its button, into the first room", async () => {
    const { instance, owner, room } = await withOwner();
    const { code } = await invite(owner, "Bia");

    const bia = instance.browser();
    expect((await bia.fetch(`/invite/${code}`)).status).toBe(200);
    expect(await (await bia.fetch(`/api/invites/${code}`)).json()).toEqual({ name: "Bia" });

    const joined = await pressJoin(bia, code);
    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ to: room });
    expect((await bia.fetch(room)).status).toBe(200);
    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Bia", owner: false });
  });

  it("makes the person a member with access to the invite's rooms, on a remembered device", async () => {
    const { instance, owner, room } = await withOwner();
    const { code } = await invite(owner, "Bia", [room.slice("/r/".length)]);

    const bia = instance.browser();
    const joined = await pressJoin(bia, code);

    expect(joined.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^__Host-device=[A-Za-z0-9_-]{43}; Max-Age=34560000;/),
    ]);
    expect(await (await bia.fetch("/api/rooms")).json()).toEqual({
      rooms: [{ address: room.slice("/r/".length), name: "First room" }],
      me: { name: "Bia", owner: false },
    });
    const root = await bia.fetch("/");
    expect(root.status).toBe(302);
    expect(root.headers.get("Location")).toBe(room);
    await instance.clock.advance(30 * DAY);
    expect((await bia.fetch(room)).status).toBe(200);
    expect(await (await bia.fetch("/api/me")).json()).toEqual({
      name: "Bia",
      owner: false,
      devices: [expect.objectContaining({ browser: "Chrome", os: "Windows", current: true })],
      home: room,
    });
  });

  it("is used up by the press alone: opening it, as a link preview does, uses nothing", async () => {
    const { instance, owner } = await withOwner();
    const { code } = await invite(owner, "Bia");

    const preview = instance.browser();
    for (let look = 0; look < 3; look++) {
      expect((await preview.fetch(`/invite/${code}`)).status).toBe(200);
      expect((await preview.fetch(`/api/invites/${code}`)).status).toBe(200);
      await preview.fetch(`/invite/${code}`, { method: "HEAD" });
    }
    expect((await preview.fetch("/")).status).toBe(404);
    expect(await pending(owner)).toEqual([expect.objectContaining({ code })]);

    expect((await pressJoin(instance.browser(), code)).status).toBe(200);
  });

  it("works once: after the press it gives nothing here, to the same browser and to any other", async () => {
    const { instance, owner, refused } = await withOwner();
    const { code } = await invite(owner, "Bia");
    const bia = instance.browser();
    expect((await pressJoin(bia, code)).status).toBe(200);

    expect(await answer(await pressJoin(bia, code))).toEqual(
      // The same browser is remembered now, so its refusal renews its cookie.
      expect.objectContaining({ status: refused.status, body: refused.body }),
    );
    await expectNothingHere(instance, code, refused);
    expect(await pending(owner)).toEqual([]);
  });

  it("works once even when pressed in two browsers at the same moment", async () => {
    const { instance, owner } = await withOwner();
    const { code } = await invite(owner, "Bia");

    const presses = await Promise.all([pressJoin(instance.browser(), code), pressJoin(instance.browser(), code)]);

    expect(presses.map((press) => press.status).sort()).toEqual([200, 404]);
  });

  it("lasts 7 days", async () => {
    const { instance, owner, refused } = await withOwner();
    const early = await invite(owner, "Bia");
    const late = await invite(owner, "Caio");

    await instance.clock.advance(INVITE_LIFE - 1);
    expect((await pressJoin(instance.browser(), early.code)).status).toBe(200);
    await instance.clock.advance(1);

    await expectNothingHere(instance, late.code, refused);
    expect(await pending(owner)).toEqual([]);
  });

  it("can be cancelled by the owner before it is used", async () => {
    const { instance, owner, refused } = await withOwner();
    const { code } = await invite(owner, "Bia");
    const kept = await invite(owner, "Caio");

    const cancelled = await owner.fetch(`/api/owner/invites/${code}`, { method: "DELETE" });

    expect(cancelled.status).toBe(204);
    await expectNothingHere(instance, code, refused);
    expect(await pending(owner)).toEqual([expect.objectContaining({ code: kept.code })]);
    expect((await owner.fetch(`/api/owner/invites/${code}`, { method: "DELETE" })).status).toBe(404);
    const used = await addMember(instance, owner, "Duda");
    expect(used.to).toMatch(/^\/r\//);
  });

  it("that was never made gives the same nothing here as a used, expired or cancelled one", async () => {
    const { instance, refused } = await withOwner();

    await expectNothingHere(instance, "AAAAAAAAAAAAAAAAAAAAAA", refused);
    await expectNothingHere(instance, "%E0", refused);
  });

  it("is listed for the owner with its rooms and expiry until it is used, newest first", async () => {
    const { instance, owner, room } = await withOwner();
    const address = room.slice("/r/".length);
    const madeAt = instance.clock.now();
    const bia = await invite(owner, "Bia");
    await instance.clock.advance(DAY);
    const caio = await invite(owner, "  Caio  ", [address]);

    expect(bia).toEqual({
      code: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      name: "Bia",
      rooms: [{ address, name: "First room" }],
      expiresAt: madeAt + INVITE_LIFE,
    });
    expect(await (await owner.fetch("/api/owner/invites")).json()).toEqual({
      rooms: [{ address, name: "First room" }],
      invites: [{ ...caio, name: "Caio" }, bia],
    });

    await pressJoin(instance.browser(), bia.code);
    expect(await pending(owner)).toEqual([caio]);
  });

  it.each([
    { body: { name: "" }, is: "an empty name" },
    { body: { name: "   " }, is: "a blank name" },
    { body: { name: "x".repeat(41) }, is: "a name over 40 characters" },
    { body: { name: 7 }, is: "a name that is not text" },
    { body: {}, is: "no name" },
    { body: { name: "Bia", rooms: [] }, is: "no rooms" },
    { body: { name: "Bia", rooms: ["no-such-room"] }, is: "a room that does not exist" },
    { body: { name: "Bia", rooms: "first" }, is: "rooms that are not a list" },
  ])("is not made with $is", async ({ body }) => {
    const { owner, refused } = await withOwner();

    expect(await answer(await createInvite(owner, body))).toEqual(
      expect.objectContaining({ status: refused.status, body: refused.body }),
    );
    expect(await pending(owner)).toEqual([]);
  });

  it("is made with a name of exactly 40 characters", async () => {
    const { owner } = await withOwner();

    expect((await createInvite(owner, { name: "é".repeat(40) })).status).toBe(200);
  });

  it("pressed on a browser that is already remembered makes it the new member's device, forgetting its old one", async () => {
    const { instance, owner, room } = await withOwner();
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const biaBefore = instance.browser({ cookies: bia.cookies() });
    const { code } = await invite(owner, "Caio");

    expect((await pressJoin(bia, code)).status).toBe(200);

    expect(await (await bia.fetch("/api/me")).json()).toMatchObject({ name: "Caio" });
    expect((await biaBefore.fetch(room)).status).toBe(404);
  });

  it("pressed on a browser that is already remembered cuts off its old device's open tabs", async () => {
    const { instance, owner, room } = await withOwner();
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { tab: ownerTab } = await openRoom(owner, room);
    const { tab: biaTab, state } = await openRoom(bia, room);
    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "arrived", member: state.people.you.id } });
    const { code } = await invite(owner, "Caio");

    expect((await pressJoin(bia, code)).status).toBe(200);

    expect(await ownerTab.next()).toEqual({ type: "presence", change: { type: "left", member: state.people.you.id } });
    expect(await biaTab.next()).toEqual({ type: "gone" });
    await biaTab.closed();
  });
});

describe("the person an invite is for", () => {
  it("is visible to the owner alone until the press, as a pending invite", async () => {
    const { instance, owner, refused } = await withOwner();
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { code } = await invite(owner, "Caio");

    expect(await pending(owner)).toEqual([expect.objectContaining({ code, name: "Caio" })]);
    expect(await answer(await bia.fetch("/api/owner/invites"))).toEqual(
      expect.objectContaining({ status: refused.status, body: refused.body }),
    );
  });
});

describe("the owner's routes and actions", () => {
  it("are open to the owner: the owner page and each of its sections", async () => {
    const { owner } = await withOwner();

    for (const address of ["/owner", "/owner/people", "/owner/invites", "/owner/rooms", "/owner/usage"]) {
      expect((await owner.fetch(address)).status, address).toBe(200);
    }
    expect((await owner.fetch("/owner/elsewhere")).status).toBe(404);
  });

  it("are refused to a member, and to a browser the instance does not know, like any other address", async () => {
    const { instance, owner, refused } = await withOwner();
    const { browser: bia } = await addMember(instance, owner, "Bia");
    const { code } = await invite(owner, "Caio");

    const tries = (browser: TestBrowser) => [
      browser.fetch("/owner"),
      browser.fetch("/owner/people"),
      browser.fetch("/owner/invites"),
      browser.fetch("/owner/rooms"),
      browser.fetch("/owner/usage"),
      browser.fetch("/api/owner/invites"),
      createInvite(browser, { name: "Duda" }),
      browser.fetch(`/api/owner/invites/${code}`, { method: "DELETE" }),
    ];
    for (const browser of [bia, instance.browser()]) {
      for (const tried of await Promise.all(tries(browser))) {
        expect(await answer(tried)).toEqual(expect.objectContaining({ status: refused.status, body: refused.body }));
      }
    }
    expect(await pending(owner)).toEqual([expect.objectContaining({ code })]);
  });
});
