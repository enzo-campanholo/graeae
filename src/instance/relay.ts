// Relay credentials (spec, Relay): one is minted each time a tab makes its media
// connection, lasts 12 hours, and is renewed for that tab 11 hours after it was minted.
// The instance keeps no record of a credential itself, only when each tab's connection
// next needs a fresh one. Revocation is never called: expiry is the only end of a
// credential, and the forced close the only cut-off.
//
// A tab on a direct path takes the fresh credential silently; one on the relay restarts
// its media connection with it. That choice is the tab's (`src/app/lib/media/renewal.ts`).
//
// The two lives below are the one place to shorten them, for a test deploy: the renewal
// must come before the credential runs out.

import type { IceServer } from "../shared/socket/media.ts";
import type { MediaLayer } from "./media/index.ts";

/** How long a relay credential lasts: 12 hours. */
export const RELAY_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

/** How long after a credential was minted its tab is handed a fresh one: 11 hours. */
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

/** When each tab's media connection is next due a fresh credential. Few, and small. */
const RENEWALS_KEY = "relay:renewals";

/** What the relay needs to know of the tabs. */
export interface RelayTabs {
  /** Whether `tab` still has its media connection. A renewal for one without is forgotten. */
  connected(tab: string): boolean;
  /** Whether `tab`'s socket is open, so it can hear a fresh credential. One that is lost gets it on coming back. */
  reachable(tab: string): boolean;
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

  /** `tab` was handed a credential just now: it is due a fresh one in 11 hours. */
  minted(tab: string) {
    this.save({ ...this.renewals(), [tab]: Date.now() + this.lives.renewalAfterMs });
  }

  /** The earliest moment a tab that can hear it is due a fresh credential, or null. */
  next(): number | null {
    const moments = Object.entries(this.current())
      .filter(([tab]) => this.tabs.reachable(tab))
      .map(([, due]) => due);
    return moments.length > 0 ? Math.min(...moments) : null;
  }

  /**
   * Mints a fresh credential for each tab that is due one and can hear it, and hands each
   * to `renewed`. A tab whose renewal the relay refused is tried again a minute later.
   */
  async renew(renewed: (tab: string, iceServers: IceServer[]) => void) {
    const now = Date.now();
    const due = Object.entries(this.current())
      .filter(([tab, at]) => at <= now && this.tabs.reachable(tab))
      .map(([tab]) => tab);
    for (const tab of due) {
      let iceServers: IceServer[];
      try {
        iceServers = await this.mint();
      } catch {
        this.save({ ...this.renewals(), [tab]: Date.now() + RENEWAL_RETRY_MS });
        continue;
      }
      // The tab may have let go of its connection while the relay answered.
      if (!this.tabs.connected(tab)) continue;
      this.minted(tab);
      renewed(tab, iceServers);
    }
  }

  /** The renewals of tabs that still have their media connection; the others are forgotten. */
  private current(): Record<string, number> {
    const renewals = this.renewals();
    const kept = Object.fromEntries(Object.entries(renewals).filter(([tab]) => this.tabs.connected(tab)));
    if (Object.keys(kept).length !== Object.keys(renewals).length) this.save(kept);
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
