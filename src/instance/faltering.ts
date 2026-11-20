// The tabs whose media connection has faltered while their socket is fine, each with when
// it said so. Their shares stay live for 30 seconds from then, while the browser tries to
// recover, and end once that time is up unless it recovers first. Kept in the instance's
// key-value storage under one key, like retries: few, and briefly.

import { log } from "./log.ts";

/** Where the faltering tabs are kept. */
const FALTERING_KEY = "shares:faltering";

/** How long a tab's shares stay live while its media connection falters, before they end. */
export const FALTERING_MS = 30_000;

export class Falterings {
  /** `schedule` is called whenever the next end (`next`) may have changed, so the instance can set its alarm. */
  constructor(
    private readonly kv: SyncKvStorage,
    private readonly schedule: () => void,
  ) {}

  /** The tab `tabId` says its media connection falters. Only the first time it says so counts. */
  falters(tabId: string) {
    const faltering = this.all();
    if (faltering[tabId] !== undefined) return;
    log.warn("falter.start", { tab: tabId });
    this.save({ ...faltering, [tabId]: Date.now() });
    this.schedule();
  }

  /** The tab `tabId`'s media connection has recovered, or the tab is gone. */
  recovered(tabId: string) {
    const faltering = this.all();
    if (faltering[tabId] === undefined) return;
    log.info("falter.end", { tab: tabId, after: Date.now() - faltering[tabId] });
    delete faltering[tabId];
    this.save(faltering);
    this.schedule();
  }

  /** The tabs that have faltered for 30 seconds, forgotten here as they are given out. */
  takeDue(): string[] {
    const now = Date.now();
    const faltering = this.all();
    const due = Object.keys(faltering).filter((tabId) => faltering[tabId]! + FALTERING_MS <= now);
    if (due.length === 0) return [];
    for (const tabId of due) delete faltering[tabId];
    this.save(faltering);
    return due;
  }

  /** When the shares of a faltering tab are next due to end, or null when none are. */
  next(): number | null {
    const moments = Object.values(this.all()).map((since) => since + FALTERING_MS);
    return moments.length > 0 ? Math.min(...moments) : null;
  }

  private all(): Record<string, number> {
    return this.kv.get<Record<string, number>>(FALTERING_KEY) ?? {};
  }

  private save(faltering: Record<string, number>) {
    if (Object.keys(faltering).length > 0) this.kv.put(FALTERING_KEY, faltering);
    else this.kv.delete(FALTERING_KEY);
  }
}
