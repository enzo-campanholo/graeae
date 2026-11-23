// What each loopback scenario (`page/scenarios.ts`) reports back to its check
// (`loopback.spec.ts`): plain data, so it crosses from the page to Node.

/** One share, from its offer to its stop. */
export interface ShareSeen {
  /** The mid the offer gave its video, or null when the browser gave none. */
  mid: string | null;
  /** The error the offer, the answer or the stop threw, if any. */
  error: string | null;
  /** Media sections of the offer not rejected (port 0): each is a transceiver the browser keeps. */
  liveSections: number;
  /** Whether the stand-in decoded the share's picture. */
  arrived: boolean;
}

/** A tab's run of shares and watches against the stand-in media server. */
export interface RunSeen {
  shares: ShareSeen[];
  /** Every ICE ufrag the tab's descriptions carried, offers and answers, in order, repeats kept. */
  ufrags: string[];
}

/** A run that ends in a watch. */
export interface WatchSeen extends RunSeen {
  /** The mid the stand-in put the watch on. */
  mid: string;
  /** The direction the tab answered for that section. */
  answered: string | null;
  /** The quality the tab's client heard the watch arrive at, or null when nothing arrived. */
  quality: string | null;
}
