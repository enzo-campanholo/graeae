// The month's usage as the owner page holds it: read once on opening, asked for again
// every 15 seconds while the page is in view, and changed by the owner's reset day. The
// meter in the navigation and the Usage section read the same figures.

import type { UsageAnswer } from "../../shared/api.ts";
import { getJson } from "./api.ts";

/** How often the figures are asked for again while the owner page is in view. */
const ASK_EVERY_MS = 15_000;

/** A gigabyte, as usage is counted and Cloudflare bills: 10⁹ bytes. */
export const GIGABYTE = 1_000_000_000;

export class OwnerUsage {
  /** The figures as the instance last gave them; null until the first answer. */
  current = $state<UsageAnswer | null>(null);
  /** Whether the first answer failed to come. */
  failed = $state(false);

  constructor() {
    void this.refresh();
  }

  /** Keeps the figures fresh while the page is in view. Returns the way to stop. */
  watch(): () => void {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh();
    }, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }

  async refresh() {
    const answer = await getJson<UsageAnswer>("/api/owner/usage").catch(() => null);
    if (answer) this.current = answer;
    else if (!this.current) this.failed = true;
  }

  /** Sets the day of the month usage resets on. False if the instance refused it. */
  async setResetDay(day: number): Promise<boolean> {
    const response = await fetch("/api/owner/usage/reset-day", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ day }),
    }).catch(() => null);
    if (!response?.ok) return false;
    this.current = (await response.json()) as UsageAnswer;
    return true;
  }
}
