// How `pnpm capture` takes a shot: the page as it stands, at each size and in each theme.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/** A maximised Chrome on a 1080p monitor (DESIGN.md's 1080p promise), and a small laptop. */
export const SIZES = [
  { width: 1920, height: 953 },
  { width: 1366, height: 768 },
] as const;

export const THEMES = ["dark", "light"] as const;

export const ROOT = join(import.meta.dirname, "../../.impeccable/review/captures");
export const LABEL = process.env.GRAEAE_CAPTURE || "current";
const DIR = join(ROOT, LABEL);

export interface ShootOptions {
  /** Puts back a state that resizing loses, such as the pointer over a tile. */
  redo?: (page: Page) => Promise<void>;
}

/**
 * Saves `page` as `<name>.<theme>.<width>x<height>.png` for every size and theme, then
 * leaves it at the first size, dark. `name` is `<surface>--<state>`, as the contact sheet
 * groups by surface.
 */
export async function shoot(page: Page, name: string, { redo }: ShootOptions = {}) {
  mkdirSync(DIR, { recursive: true });
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const theme of THEMES) {
      // index.html reads the same class before first paint; toggling it keeps the page's state.
      await page.evaluate(`document.documentElement.classList.toggle("dark", ${theme === "dark"})`);
      if (redo) await redo(page);
      await page.evaluate("document.fonts.ready");
      // Past the colours' 150ms transitions and any 180–240ms arrival.
      await page.waitForTimeout(350);
      await page.screenshot({
        path: join(DIR, `${name}.${theme}.${size.width}x${size.height}.png`),
        animations: "disabled",
        caret: "hide",
      });
    }
  }
  await page.setViewportSize(SIZES[0]);
  await page.evaluate(`document.documentElement.classList.toggle("dark", true)`);
  if (redo) await redo(page);
}
