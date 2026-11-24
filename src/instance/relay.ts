// Relay credentials (spec, Relay): one is minted each time a tab makes one of its media
// connections, sending or receiving, lasts 12 hours, and is renewed for that connection
// 11 hours after it was minted. The instance keeps no record of a credential itself,
// only when each connection next needs a fresh one. Revocation is never called: expiry
// is the only end of a credential, and the forced close the only cut-off.
//
// A tab on a direct path takes the fresh credential silently. One on the relay restarts
// its sending connection with it, or replaces its receiving connection. That choice is
// the tab's (`src/app/lib/media/renewal.ts`).
//
// The two lives below are the one place to shorten them, for a test deploy: the renewal
// must come before the credential runs out.

import type { IceServer, MediaPurpose } from "../shared/socket/media.ts";
import { isMediaPurpose } from "../shared/socket/media.ts";
import type { MediaLayer } from "./media/index.ts";
import { log } from "./log.ts";

/** How long a relay credential lasts: 12 hours. */
export const RELAY_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

/** How long after a credential was minted its connection is handed a fresh one: 11 hours. */
export const RELAY_RENEWAL_AFTER_MS = 11 * 60 * 60 * 1000;

/** A credential's life and when it is renewed. */
export interface RelayLives {
  credentialSeconds: number;
  renewalAfterMs: number;
}

/** The lives the instance runs with: the two above. */
export const RELAY_LIVES: RelayLives = {
  credentialSeconds: RELAY_CREDENTIAL_TTL_SECONDS,
  renewalAfterMs: RELAY_RENEWAL_AFTER_MS,
};

/** How soon a renewal the relay refused is tried again. */
const RENEWAL_RETRY_MS = 60 * 1000;

/** When each tab's connections are next due a fresh credential, by `<tab> <purpose>`. Few, and small. */
const RENEWALS_KEY = "relay:renewals";

/** What the relay needs to know of the tabs. */
export interface RelayTabs {
  /** Whether `tab` still has its `connection`. A renewal for one without is forgotten. */
  connected(tab: string, connection: MediaPurpose): boolean;
  /** Whether `tab`'s socket is open, so it can hear a fresh credential. One that is lost gets it on coming back. */
  reachable(tab: string): boolean;
}

/** One connection's renewal, as kept. */
interface Due {
  tab: string;
  connection: MediaPurpose;
  at: number;
}

export class Relay {
  constructor(
    private readonly kv: SyncKvStorage,
    private readonly media: MediaLayer,
    private readonly tabs: RelayTabs,
    private readonly lives: RelayLives = RELAY_LIVES,
  ) {}

  /** Mints a credential lasting 12 hours. Throws if the relay refuses. */
  mint(): Promise<IceServer[]> {
    return this.media.relayCredential(this.lives.credentialSeconds);
  }

  /** `tab`'s `connection` was handed a credential just now: it is due a fresh one in 11 hours. */
  minted(tab: string, connection: MediaPurpose) {
    log.info("relay.minted", { tab, connection });
    this.due(tab, connection, Date.now() + this.lives.renewalAfterMs);
  }

  /** The earliest moment a connection whose tab can hear it is due a fresh credential, or null. */
  next(): number | null {
    const moments = this.current()
      .filter(({ tab }) => this.tabs.reachable(tab))
      .map(({ at }) => at);
    return moments.length > 0 ? Math.min(...moments) : null;
  }

  /**
   * Mints a fresh credential for each connection that is due one and whose tab can hear
   * it, and hands each to `renewed`. A renewal the relay refused is tried again a minute later.
   */
  async renew(renewed: (tab: string, connection: MediaPurpose, iceServers: IceServer[]) => void) {
    const now = Date.now();
    const due = this.current().filter(({ tab, at }) => at <= now && this.tabs.reachable(tab));
    for (const { tab, connection } of due) {
      let iceServers: IceServer[];
      try {
        iceServers = await this.mint();
      } catch {
        log.warn("relay.failed", { tab, connection, next: Date.now() + RENEWAL_RETRY_MS });
        this.due(tab, connection, Date.now() + RENEWAL_RETRY_MS);
        continue;
      }
      // The tab may have let go of its connection while the relay answered.
      if (!this.tabs.connected(tab, connection)) continue;
      this.minted(tab, connection);
      log.info("relay.renewed", { tab, connection });
      renewed(tab, connection, iceServers);
    }
  }

  private due(tab: string, connection: MediaPurpose, at: number) {
    this.save({ ...this.renewals(), [`${tab} ${connection}`]: at });
  }

  /** The renewals of connections their tabs still have; the others are forgotten. */
  private current(): Due[] {
    const renewals = this.renewals();
    const all = Object.entries(renewals).flatMap(([key, at]): Due[] => {
      const [tab, connection] = key.split(" ");
      return tab && isMediaPurpose(connection) ? [{ tab, connection, at }] : [];
    });
    const kept = all.filter(({ tab, connection }) => this.tabs.connected(tab, connection));
    if (kept.length !== Object.keys(renewals).length) {
      this.save(Object.fromEntries(kept.map(({ tab, connection, at }) => [`${tab} ${connection}`, at])));
    }
    return kept;
  }

  private renewals(): Record<string, number> {
    return this.kv.get<Record<string, number>>(RENEWALS_KEY) ?? {};
  }

  private save(renewals: Record<string, number>) {
    if (Object.keys(renewals).length > 0) this.kv.put(RENEWALS_KEY, renewals);
    else this.kv.delete(RENEWALS_KEY);
  }
}
