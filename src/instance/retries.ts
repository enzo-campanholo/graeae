// The failed forced closes the instance tries again (ADR 0003): each on a backoff of
// 1 s, 2 s, 4 s, up to 30 s between tries, until it succeeds or a sweep shows the track
// gone. The tries to come are kept in the instance's key-value storage, all under one key
// (there are few, and briefly), so they outlast a restart.

import type { Track } from "./media/index.ts";
import { log } from "./log.ts";

/** Where retries are kept. */
const RETRIES_KEY = "shares:retries";

/** How long closes may go on failing before the owner hears a cut-off could not be confirmed. */
export const UNCONFIRMED_AFTER_MS = 60_000;

/** The wait before the next try once `tries` tries have failed: 1 s, then doubling, at most 30 s. */
export function retryDelay(tries: number): number {
  return Math.min(1000 * 2 ** (tries - 1), 30_000);
}

/**
 * The member a cut-off was for, when the owner should hear that it could not be
 * confirmed: a removal, or a forgotten device. `at` is when it began.
 */
export interface Subject {
  member: string;
  name: string;
  at: number;
}

/** A forced close that failed, and when it is tried next. */
export interface Retry {
  /** The share or watch record whose close failed, or a track no record names. */
  kind: "share" | "watch" | "track";
  /** The record's id; for a track, its media connection and mid. */
  id: string;
  /** For a track: where it is and what it is. */
  connection?: string;
  track?: Track;
  /** How many tries have failed so far. */
  tries: number;
  next: number;
  subject?: Subject;
}

export class Retries {
  /** `schedule` is called whenever the next try (`next`) may have changed, so the instance can set its alarm. */
  constructor(
    private readonly kv: SyncKvStorage,
    private readonly schedule: () => void,
  ) {}

  /** A close failed: tries it again after the next wait of the backoff. */
  failed(what: Pick<Retry, "kind" | "id" | "connection" | "track">, subject?: Subject) {
    const retries = this.all();
    const before = retries.find((retry) => retry.id === what.id);
    const tries = (before?.tries ?? 0) + 1;
    const retry: Retry = {
      kind: what.kind,
      id: what.id,
      ...(what.connection ? { connection: what.connection, track: what.track } : {}),
      tries,
      next: Date.now() + retryDelay(tries),
      ...((before?.subject ?? subject) ? { subject: before?.subject ?? subject } : {}),
    };
    this.save([...retries.filter((other) => other.id !== what.id), retry]);
    log.warn("retry.scheduled", { kind: retry.kind, id: retry.id, tries, next: retry.next, ...(retry.subject ? { subject: retry.subject.member } : {}) });
  }

  /** A close succeeded, or a sweep showed its track gone: it is tried no more. */
  confirmed(id: string) {
    const retries = this.all();
    const retry = retries.find((candidate) => candidate.id === id);
    if (!retry) return;
    log.info("retry.confirmed", { kind: retry.kind, id, tries: retry.tries });
    this.save(retries.filter((other) => other.id !== id));
  }

  /** The retries whose time has come. */
  due(): Retry[] {
    const now = Date.now();
    return this.all().filter((retry) => retry.next <= now);
  }

  /** When the next failed close is due to be tried again, or null when none is. */
  next(): number | null {
    const moments = this.all().map((retry) => retry.next);
    return moments.length > 0 ? Math.min(...moments) : null;
  }

  /**
   * The members whose cut-off has had a close failing for a minute or more, each once:
   * the owner hears that it could not be confirmed.
   */
  unconfirmed(): { member: string; name: string }[] {
    const now = Date.now();
    const members = new Map<string, string>();
    for (const { subject } of this.all()) {
      if (subject && now - subject.at >= UNCONFIRMED_AFTER_MS) members.set(subject.member, subject.name);
    }
    return [...members].map(([member, name]) => ({ member, name }));
  }

  private all(): Retry[] {
    return this.kv.get<Retry[]>(RETRIES_KEY) ?? [];
  }

  private save(retries: Retry[]) {
    if (retries.length > 0) this.kv.put(RETRIES_KEY, retries);
    else this.kv.delete(RETRIES_KEY);
    this.schedule();
  }
}
