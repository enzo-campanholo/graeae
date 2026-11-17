// The month's usage as the owner page holds it: asked for as the page opens, again every
// 15 seconds while it is in view, and changed by the owner's reset day. The meter in the
// navigation and the Usage section read the same figures.

import { GIGABYTE, type UsageAnswer } from "../../shared/api.ts";
import { getJson, putJson } from "./api.ts";

/** How often the figures are asked for again while the owner page is in view. */
const ASK_EVERY_MS = 15_000;

/** The figures in gigabytes, as the page shows them. */
export interface UsageFigures {
  used: number;
  budget: number;
  projected: number;
}

export class OwnerUsage {
  /** The figures as the instance last gave them; null until the first answer. */
  current = $state<UsageAnswer | null>(null);

  /** The figures in gigabytes; null until the first answer. */
  get figures(): UsageFigures | null {
    const current = this.current;
    if (!current) return null;
    return {
      used: current.used / GIGABYTE,
      budget: current.budget / GIGABYTE,
      projected: current.projected / GIGABYTE,
    };
  }

  /** Asks for the figures now, and keeps them fresh while the page is in view. Returns the way to stop. */
  watch(): () => void {
    void this.refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh();
    }, ASK_EVERY_MS);
    const shown = () => {
      if (document.visibilityState === "visible") void this.refresh();
    };
    document.addEventListener("visibilitychange", shown);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", shown);
    };
  }

  async refresh() {
    const answer = await getJson<UsageAnswer>("/api/owner/usage").catch(() => null);
    if (answer) this.current = answer;
  }

  /** Sets the day of the month usage resets on. False if the instance refused it, or did not answer. */
  async setResetDay(day: number): Promise<boolean> {
    const answer = await putJson<UsageAnswer>("/api/owner/usage/reset-day", { day }).catch(() => null);
    if (!answer) return false;
    this.current = answer;
    return true;
  }
}
