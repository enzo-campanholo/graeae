// A tab's usage reports: once its media connection is made, once a minute the running
// total that connection's transport has received since it opened, for the usage count.
// The totals are read at once, so a final one is the connection's own even if it is let
// go of straight after; reports go out in the order they were read. One due while the
// socket is lost, or before a new socket has brought the room, is dropped, and the next
// makes up for it.
//
// A final total sent before a `restarting` connection is restarted makes its later totals
// count from that one: the instance counts from zero after the restart, while the browser
// may count on. A total below it shows the browser counted from zero too.

import type { UsageRequest } from "../../shared/socket/index.ts";
import type { TransportTotals } from "./media/transport.ts";
import { every } from "./ticker.ts";

export class UsageReports {
  /** Stops the reports once a minute, while they run. */
  private stopTicking: (() => void) | null = null;
  /** The reports read but not yet sent, which the next one waits for. */
  private sending: Promise<void> = Promise.resolve();
  /**
   * What comes off the media connection's totals before they are reported: its total at
   * the last restart, sent as final. One per media connection, so a report read on an old
   * one never meets a new one's.
   */
  private counting = { since: 0 };

  /**
   * `read` reads the media connection's totals; `send` sends a report; `synced` says
   * whether the socket has brought the room's state, without which a report is dropped;
   * `reportEvery` is how often reports go, in milliseconds (`MediaClient.reportEvery`).
   */
  constructor(
    private readonly read: () => Promise<TransportTotals | null>,
    private readonly send: (request: UsageRequest) => void,
    private readonly synced: () => boolean,
    private readonly reportEvery: () => number,
  ) {}

  /** The media connection is made: reports go out once a minute. */
  start() {
    this.stopTicking = every(this.reportEvery(), () => this.report());
  }

  /** No more reports once a minute; one asked for still goes. */
  stop() {
    this.stopTicking?.();
    this.stopTicking = null;
  }

  /** The media connection is let go of: the reports stop, and the next connection counts from its own zero. */
  reset() {
    this.stop();
    this.counting = { since: 0 };
  }

  /**
   * Reports what the media connection has received: `final` before it is let go of or
   * restarted, and `restarting` before a restart. See the top of this file.
   */
  report({ final = false, restarting = false } = {}) {
    const read = this.read();
    const counting = this.counting;
    this.sending = this.sending.then(async () => {
      const totals = await read.catch(() => null);
      if (!totals || !this.synced()) return;
      const received = Math.max(0, Math.round(totals.received));
      if (received < counting.since) counting.since = 0;
      const bytes = received - counting.since;
      if (restarting) counting.since = received;
      const request: UsageRequest = { type: "received", bytes, relayed: totals.relayed };
      this.send(final ? { ...request, final: true } : request);
    });
  }

  /** Resolves once every report asked for so far has gone. */
  sent(): Promise<void> {
    return this.sending;
  }
}
