// A tab's usage reports: once its receiving connection is made, once a minute the running
// total that connection's transport has received since it opened, for the usage count.
// The sending connection reports nothing: a sharer's upload is not counted (ADR 0005).
// The totals are read at once, so a final one is the connection's own even if it is let
// go of or replaced straight after; reports go out in the order they were read. One due
// while the socket is lost, or before a new socket has brought the room, is dropped, and
// the next makes up for it.
//
// The receiving connection is never restarted, only replaced by a new one, whose
// transport counts from zero as the instance's count of it does.

import type { UsageRequest } from "../../shared/socket/index.ts";
import type { TransportTotals } from "./media/transport.ts";
import { every } from "./ticker.ts";

export class UsageReports {
  /** Stops the reports once a minute, while they run. */
  private stopTicking: (() => void) | null = null;
  /** The reports read but not yet sent, which the next one waits for. */
  private sending: Promise<void> = Promise.resolve();

  /**
   * `read` reads the receiving connection's totals; `send` sends a report; `synced` says
   * whether the socket has brought the room's state, without which a report is dropped;
   * `reportEvery` is how often reports go, in milliseconds (`MediaClient.reportEvery`).
   */
  constructor(
    private readonly read: () => Promise<TransportTotals | null>,
    private readonly send: (request: UsageRequest) => void,
    private readonly synced: () => boolean,
    private readonly reportEvery: () => number,
  ) {}

  /** The receiving connection is made: reports go out once a minute. */
  start() {
    this.stop();
    this.stopTicking = every(this.reportEvery(), () => this.report());
  }

  /** No more reports once a minute; one asked for still goes. */
  stop() {
    this.stopTicking?.();
    this.stopTicking = null;
  }

  /** Reports what the receiving connection has received: `final` before it is let go of or replaced. */
  report({ final = false } = {}) {
    const read = this.read();
    this.sending = this.sending.then(async () => {
      const totals = await read.catch(() => null);
      if (!totals || !this.synced()) return;
      const request: UsageRequest = { type: "received", bytes: Math.max(0, Math.round(totals.received)), relayed: totals.relayed };
      this.send(final ? { ...request, final: true } : request);
    });
  }

  /** Resolves once every report asked for so far has gone. */
  sent(): Promise<void> {
    return this.sending;
  }
}
