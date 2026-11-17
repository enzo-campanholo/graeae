import { expect, test } from "@playwright/test";
import { SETUP_SECRET } from "./app.ts";

test("the setup secret makes this browser the owner's, landing in the first room", async ({ page }) => {
  const addresses: string[] = [];
  const bodies: string[] = [];
  page.on("request", (request) => {
    // What a request's address carries to the instance: never the part after `#`.
    const { pathname, search } = new URL(request.url());
    addresses.push(pathname + search);
    bodies.push(request.postData() ?? "");
  });

  await page.goto(`/setup#${SETUP_SECRET}`);

  await expect(page).toHaveURL(/\/r\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "First room" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Owner page" })).toBeVisible();
  await expect(page.getByText("No one is sharing yet.")).toBeVisible();
  expect(addresses.filter((address) => address.includes(SETUP_SECRET))).toEqual([]);
  expect(bodies.filter((body) => body.includes(SETUP_SECRET))).toHaveLength(1);

  // From now on the browser is remembered: the root address goes straight into the room.
  const room = page.url();
  await page.goto("/");
  await expect(page).toHaveURL(room);
  await expect(page.getByRole("heading", { name: "First room" })).toBeVisible();
});

test("a wrong setup secret shows nothing here", async ({ page }) => {
  await page.goto(`/setup#${SETUP_SECRET}x`);

  await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
});

test("a browser the instance does not remember gets nothing here at the root address", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});
