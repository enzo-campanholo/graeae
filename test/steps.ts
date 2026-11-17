// Steps many tests take, each done only the way a browser would do it.

import { expect } from "vitest";
import { SETUP_SECRET, type TestBrowser } from "./harness.ts";

/** What the setup page sends: the part of `/setup#<secret>` after the `#`. */
export function useSetupSecret(browser: TestBrowser, secret = SETUP_SECRET, headers: HeadersInit = {}) {
  return browser.fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ secret }),
  });
}

/** Makes `browser` the owner's device, and returns the address of the room it lands in. */
export async function setUpOwner(browser: TestBrowser): Promise<string> {
  const response = await useSetupSecret(browser);
  expect(response.status).toBe(200);
  return (await response.json<{ to: string }>()).to;
}

/** Everything a visitor can see of an answer, to compare two answers whole. */
export async function answer(response: Response) {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}
