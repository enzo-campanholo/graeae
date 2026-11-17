import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import type { CreateInviteAnswer } from "../../src/shared/api.ts";
import { SETUP_SECRET } from "./app.ts";

// A member's connection goes dead without closing, as on a dropped network: their tab's
// socket is routed through the test, which stops passing anything either way. This one
// names its member Hana, whom no other journey uses. It runs in real time, about 15 s.

const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function newBrowser(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  opened.push(context);
  return context;
}

test("a member whose connection dies shows as reconnecting after about 10 seconds, and is back once it returns", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const ownerContext = await newBrowser(browser, baseURL);
  const owner = await ownerContext.newPage();
  await owner.goto(`/setup#${SETUP_SECRET}`);
  await expect(owner.getByRole("heading", { name: "First room" })).toBeVisible();
  const room = owner.url();
  const ownerHere = owner.getByRole("region", { name: "Here" });

  const made = await ownerContext.request.post("/api/owner/invites", { data: { name: "Hana" } });
  expect(made.status(), "the invite was refused").toBe(200);
  const { invite } = (await made.json()) as CreateInviteAnswer;
  const hanaContext = await newBrowser(browser, baseURL);
  const hana = await hanaContext.newPage();

  // While `online` is false, nothing passes between Hana's tab and the instance, and a
  // socket the tab opens meanwhile reaches nothing.
  let online = true;
  await hana.routeWebSocket(/\/api\/socket/, (page) => {
    if (!online) return;
    const instance = page.connectToServer();
    page.onMessage((message) => {
      if (online) instance.send(message);
    });
    instance.onMessage((message) => {
      if (online) page.send(message);
    });
    page.onClose((code, reason) => {
      if (online) void instance.close({ code, reason });
    });
  });

  await hana.goto(`/invite/${invite.code}`);
  await hana.getByRole("button", { name: "Join as Hana" }).click();
  await expect(hana).toHaveURL(room);
  const hanaRow = ownerHere.getByRole("button", { name: /^Hana/ });
  await expect(hanaRow).not.toContainText("reconnecting");

  online = false;
  // Still present and unmarked for the first few seconds; marked about 10 seconds after
  // the last heartbeat heard, which came up to 5 seconds before the drop.
  await hana.waitForTimeout(6_000);
  await expect(hanaRow).not.toContainText("reconnecting");
  await expect(hanaRow).toContainText("· reconnecting", { timeout: 15_000 });

  // The browser keeps trying by itself; once the network is back, the mark goes.
  online = true;
  await expect(hanaRow).not.toContainText("reconnecting", { timeout: 10_000 });
  await expect(hana.getByRole("region", { name: "Here" }).getByRole("button", { name: "Owner" })).toBeVisible();

  // The folded bar shows the mark too, in the avatar's name.
  online = false;
  await owner.getByRole("button", { name: "Hide the bar" }).click();
  await expect(owner.getByRole("button", { name: "Follow Hana, reconnecting" })).toBeVisible({ timeout: 20_000 });
  online = true;
  await expect(owner.getByRole("button", { name: "Follow Hana", exact: true })).toBeVisible({ timeout: 10_000 });
});
