import { describe, expect, it } from "vitest";
import { startInstance } from "./harness.ts";
import { answer, setUpOwner, useSetupSecret } from "./steps.ts";

const DAY = 24 * 60 * 60 * 1000;
const DEVICE_LIFE = 400 * DAY;

const FIREFOX_ON_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

// 400 days in seconds, and 256 random bits in base64url.
const COOKIE_FOR_400_DAYS =
  /^__Host-device=[A-Za-z0-9_-]{43}; Max-Age=34560000; Path=\/; Secure; HttpOnly; SameSite=Lax$/;

describe("a remembered device", () => {
  it("is remembered by a cookie for 400 days", async () => {
    const instance = await startInstance();

    const setup = await useSetupSecret(instance.browser());

    expect(deviceCookies(setup)).toEqual([expect.stringMatching(COOKIE_FOR_400_DAYS)]);
  });

  it("has its cookie renewed for another 400 days by every visit", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    const cookie = owner.cookies();

    for (const address of ["/", room, "/api/me", "/a-refused-address"]) {
      const visit = await owner.fetch(address);
      expect(deviceCookies(visit), address).toEqual([expect.stringMatching(COOKIE_FOR_400_DAYS)]);
    }
    expect(owner.cookies()).toBe(cookie);
  });

  it("stays remembered while each visit comes within 400 days of the last", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);

    for (let visit = 0; visit < 3; visit++) {
      await instance.clock.advance(DEVICE_LIFE - 1);
      expect((await owner.fetch(room)).status).toBe(200);
    }
  });

  it("is forgotten 400 days after its last visit, even if the browser kept the cookie", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);
    await instance.clock.advance(DAY);
    expect((await owner.fetch(room)).status).toBe(200);

    await instance.clock.advance(DEVICE_LIFE);

    expect((await owner.fetch(room)).status).toBe(404);
    expect((await owner.fetch("/")).status).toBe(404);
  });

  it("is recorded with its browser, operating system and last use", async () => {
    const instance = await startInstance();
    const laptop = instance.browser({ userAgent: FIREFOX_ON_LINUX });
    const room = await setUpOwner(laptop);

    await instance.clock.advance(3 * DAY);
    const lastVisit = instance.clock.now();
    await laptop.fetch("/");
    await instance.clock.advance(DAY);

    const me = await laptop.fetch("/api/me");
    expect(await me.json()).toEqual({
      name: "Owner",
      owner: true,
      devices: [
        { id: expect.any(String), browser: "Firefox", os: "Linux", lastUsed: lastVisit + DAY, current: true },
      ],
      home: room,
    });
  });

  it("is recorded by the brand and platform a Chromium browser names itself", async () => {
    const instance = await startInstance();
    const brave = instance.browser();

    await useSetupSecret(brave, undefined, {
      "Sec-CH-UA": '"Brave";v="146", "Chromium";v="146", "Not.A/Brand";v="24"',
      "Sec-CH-UA-Platform": '"Windows"',
    });

    const { devices } = await (await brave.fetch("/api/me")).json<{ devices: unknown[] }>();
    expect(devices).toEqual([expect.objectContaining({ browser: "Brave", os: "Windows" })]);
  });
});

describe("the root address", () => {
  it("takes a remembered device with one room straight into it", async () => {
    const instance = await startInstance();
    const owner = instance.browser();
    const room = await setUpOwner(owner);

    const root = await owner.fetch("/");

    expect(root.status).toBe(302);
    expect(root.headers.get("Location")).toBe(room);
  });

  it("gives a browser it does not remember the same page as any refused address", async () => {
    const instance = await startInstance();
    await setUpOwner(instance.browser());
    const refused = await answer(await instance.fetch("/a-refused-address"));

    const strangers = [instance.browser(), instance.browser({ cookies: "__Host-device=made-up" })];
    for (const stranger of strangers) {
      expect(await answer(await stranger.fetch("/"))).toEqual(refused);
    }
  });
});

function deviceCookies(response: Response): string[] {
  return response.headers.getSetCookie().filter((cookie) => cookie.startsWith("__Host-device="));
}
