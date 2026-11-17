import { describe, expect, it } from "vitest";
import type { LiveShare, ServerMessage } from "../src/shared/socket/index.ts";
import { SETUP_SECRET, startInstance } from "./harness.ts";
import { openRoom, type Tab } from "./sockets.ts";
import { addMember, answer, setUpOwner, shareWebcam, useSetupSecret, watch } from "./steps.ts";

/** Reads `tab`'s messages until `wanted` arrives, and returns every message read on the way, `wanted` last. */
async function until(tab: Tab, wanted: (message: ServerMessage) => boolean): Promise<ServerMessage[]> {
  const read: ServerMessage[] = [];
  for (;;) {
    const message = await tab.next();
    read.push(message);
    if (wanted(message)) return read;
  }
}

const THIRTY_ONE_CHARACTERS = "0123456789abcdef0123456789abcde";

describe("the setup secret", () => {
  it("on first use makes this browser the owner's device, in the first room", async () => {
    const instance = await startInstance();
    const browser = instance.browser();

    const setup = await useSetupSecret(browser, SETUP_SECRET);

    expect(setup.status).toBe(200);
    const { to } = await setup.json<{ to: string }>();
    expect(to).toMatch(/^\/r\/[a-z0-9]+$/);
    const room = to.slice("/r/".length);
    const opened = await browser.fetch(to);
    expect(opened.status).toBe(200);
    expect(await opened.text()).toContain('<div id="app"></div>');
    expect(await (await browser.fetch(`/api/rooms/${room}`)).json()).toEqual({
      room: { address: room, name: "First room" },
      me: { name: "Owner", owner: true },
    });
    expect(await (await browser.fetch("/api/rooms")).json()).toEqual({
      rooms: [{ address: room, name: "First room" }],
      me: { name: "Owner", owner: true },
    });
  });

  it("used again makes this browser an owner device and forgets every other", async () => {
    const instance = await startInstance();
    const first = instance.browser();
    const to = await setUpOwner(first);
    const copied = instance.browser({ cookies: first.cookies() });
    expect((await copied.fetch(to)).status).toBe(200);

    const second = instance.browser();
    const again = await useSetupSecret(second, SETUP_SECRET);

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ to, missing: [] });
    expect((await second.fetch(to)).status).toBe(200);
    expect((await first.fetch(to)).status).toBe(404);
    expect((await copied.fetch("/")).status).toBe(404);
  });

  it("used again cuts off every other owner device: its tabs close, and its shares and watching end", async () => {
    const instance = await startInstance();
    const stolen = instance.browser();
    const room = await setUpOwner(stolen);
    const { browser: bia } = await addMember(instance, stolen, "Bia");
    const { tab: onStolen, state } = await openRoom(stolen, room);
    const { tab: biaTab, state: biaState } = await openRoom(bia, room);
    const ownersWebcam: LiveShare = { member: state.people.you.id, kind: "webcam" };
    const biasWebcam: LiveShare = { member: biaState.people.you.id, kind: "webcam" };
    await until(onStolen, (message) => message.type === "presence");
    await shareWebcam(onStolen);
    await until(biaTab, (message) => message.type === "shares");
    await shareWebcam(biaTab);
    await until(onStolen, (message) => message.type === "shares");
    await watch(biaTab, ownersWebcam);
    await until(onStolen, (message) => message.type === "watching" && message.change.type === "watchers");
    await watch(onStolen, biasWebcam);
    await until(biaTab, (message) => message.type === "watching" && message.change.type === "watchers");

    expect((await useSetupSecret(instance.browser(), SETUP_SECRET)).status).toBe(200);

    expect(await onStolen.next()).toEqual({ type: "gone" });
    await onStolen.closed();
    const heard = await until(biaTab, (message) => message.type === "shares");
    expect(heard).toEqual(
      expect.arrayContaining([
        { type: "presence", change: { type: "left", member: ownersWebcam.member } },
        { type: "watching", change: { type: "unwatched", share: ownersWebcam } },
        { type: "watching", change: { type: "watchers", share: biasWebcam, members: [] } },
        { type: "shares", change: { type: "ended", share: ownersWebcam } },
      ]),
    );
    // Bia's own webcam is all that is left on the media server.
    expect(instance.media.connections().flat()).toHaveLength(1);
  });

  it("is taken only from the setup page's own request, never from an address", async () => {
    const instance = await startInstance();
    const refused = await answer(await instance.fetch("/a-refused-address"));

    const browser = instance.browser();
    const tries = [
      browser.fetch(`/setup?secret=${SETUP_SECRET}`),
      browser.fetch(`/setup/${SETUP_SECRET}`),
      browser.fetch(`/api/setup?secret=${SETUP_SECRET}`, { method: "POST" }),
      browser.fetch(`/api/setup/${SETUP_SECRET}`, { method: "POST" }),
      browser.fetch("/api/setup", { method: "GET" }),
    ];
    for (const tried of await Promise.all(tries)) expect(await answer(tried)).toEqual(refused);
    expect((await browser.fetch("/")).status).toBe(404);
  });

  it("refuses a wrong secret with the same page as any other refused address", async () => {
    const instance = await startInstance();
    const refused = await answer(await instance.fetch("/a-refused-address"));

    const wrong = [
      `${SETUP_SECRET}x`,
      SETUP_SECRET.slice(0, -1),
      SETUP_SECRET.toUpperCase(),
      "",
    ];
    for (const secret of wrong) {
      const browser = instance.browser();
      expect(await answer(await useSetupSecret(browser, secret))).toEqual(refused);
      expect((await browser.fetch("/")).status).toBe(404);
    }
    for (const body of ["", "not json", "{}", '{"secret":42}']) {
      const tried = await instance.fetch("/api/setup", { method: "POST", body });
      expect(await answer(tried)).toEqual(refused);
    }
  });

  it.each([
    { setupSecret: undefined, is: "missing" },
    { setupSecret: "", is: "empty" },
    { setupSecret: THIRTY_ONE_CHARACTERS, is: "31 characters long" },
  ])("refuses setup entirely when the instance's secret is $is", async ({ setupSecret }) => {
    const instance = await startInstance({ secrets: { SETUP_SECRET: setupSecret } });
    const refused = await answer(await instance.fetch("/a-refused-address"));
    const browser = instance.browser();

    expect(await answer(await useSetupSecret(browser, setupSecret ?? ""))).toEqual(refused);
    expect((await browser.fetch("/")).status).toBe(404);
  });

  it("allows setup with a secret of exactly 32 characters", async () => {
    const secret = `${THIRTY_ONE_CHARACTERS}f`;
    const instance = await startInstance({ secrets: { SETUP_SECRET: secret } });

    expect((await useSetupSecret(instance.browser(), secret)).status).toBe(200);
  });

  it("names any other secret the deploy left unset, to someone holding the setup secret", async () => {
    const instance = await startInstance({ secrets: { SFU_APP_SECRET: undefined, TURN_KEY_ID: "" } });

    const setup = await useSetupSecret(instance.browser(), SETUP_SECRET);

    expect(await setup.json()).toEqual({
      to: expect.stringMatching(/^\/r\//),
      missing: ["SFU_APP_SECRET", "TURN_KEY_ID"],
    });
  });
});
