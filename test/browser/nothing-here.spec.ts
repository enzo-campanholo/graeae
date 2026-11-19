// A refused address shows "nothing here" from its first frame (ticket 45): never a glimpse
// of the app's own pages first, which would show that the address is an app with rooms.

import { expect, test, type Page } from "@playwright/test";
import { SETUP_SECRET } from "./app.ts";

// Longer than the app's hold-back (300ms, `src/app/lib/hold-back.ts`), so a page that waits
// on the instance shows what it draws meanwhile, as it does on a real network.
const SLOW_ANSWER_MS = 600;

/**
 * A browser the instance does not know, on a slow network. Returns everything the page
 * has said, each time its text changed, and its loading mark: what the stranger could
 * have seen.
 */
async function slowStranger(page: Page): Promise<() => Promise<string[]>> {
  await page.route("**/api/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS));
    await route.continue();
  });
  // Run in the page before its own scripts. A string, since these files know no DOM.
  await page.addInitScript(`
    const seen = (window.seen = []);
    const note = () => {
      const loading = document.querySelector('[role="status"][aria-label="Loading"]') ? "(loading) " : "";
      const text = (loading + (document.body?.innerText ?? "")).replace(/\\s+/g, " ").trim();
      if (text !== "" && seen.at(-1) !== text) seen.push(text);
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, characterData: true });
  `);
  return () => page.evaluate<string[]>("window.seen");
}

const NOTHING_HERE = "Nothing here If someone sent you a link, ask them for a fresh one.";

// A used, expired or cancelled invite answers exactly as one that never existed does
// (`test/invites.test.ts`), so the made-up one stands for them all.
for (const address of ["/", "/r/a-room", "/you", "/owner", "/owner/people", "/invite/not-a-real-invite"]) {
  test(`a browser the instance does not know sees only nothing here at ${address}`, async ({ page }) => {
    const seen = await slowStranger(page);

    await page.goto(address);

    await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
    await expect(page).toHaveTitle("Nothing here · graeae");
    expect(await seen()).toEqual([NOTHING_HERE]);
  });
}

// The one exception: the instance refuses the setup address to everyone, since the secret
// never reaches it in the address, so only sending the secret tells the page. Meanwhile it
// shows the loading mark at most, never a page of the app's.
test("a wrong setup secret shows the loading mark at most before nothing here", async ({ page }) => {
  const seen = await slowStranger(page);

  await page.goto(`/setup#${SETUP_SECRET}x`);

  await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  expect((await seen()).filter((said) => said !== "(loading)")).toEqual([NOTHING_HERE]);
});
