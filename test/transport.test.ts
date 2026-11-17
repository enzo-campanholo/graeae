// What a tab reads from its media connection's statistics for the usage count: the
// running total received, and whether the path in use is the relay. The entries below
// are trimmed from what Chromium and Firefox give.

import { describe, expect, it } from "vitest";
import { transportTotals, type StatsEntry } from "../src/app/lib/media/transport.ts";

const relayCandidate: StatsEntry = { id: "L1", type: "local-candidate", candidateType: "relay" };
const hostCandidate: StatsEntry = { id: "L2", type: "local-candidate", candidateType: "host" };

describe("a Chromium connection", () => {
  it("is read from its transport entry, on a direct path", () => {
    const entries: StatsEntry[] = [
      { id: "T01", type: "transport", bytesReceived: 4_321_000, bytesSent: 90_000_000, selectedCandidatePairId: "CP2" },
      { id: "CP1", type: "candidate-pair", localCandidateId: "L1", bytesReceived: 1_000 },
      { id: "CP2", type: "candidate-pair", localCandidateId: "L2", bytesReceived: 4_320_000 },
      relayCandidate,
      hostCandidate,
      { id: "IT1", type: "inbound-rtp", kind: "video", bytesReceived: 4_000_000 },
    ];

    expect(transportTotals(entries)).toEqual({ received: 4_321_000, relayed: false });
  });

  it("is on the relay when the pair in use has a relay candidate on this side", () => {
    const entries: StatsEntry[] = [
      { id: "T01", type: "transport", bytesReceived: 500, selectedCandidatePairId: "CP1" },
      { id: "CP1", type: "candidate-pair", localCandidateId: "L1", bytesReceived: 500 },
      relayCandidate,
    ];

    expect(transportTotals(entries)).toEqual({ received: 500, relayed: true });
  });
});

describe("a Firefox connection", () => {
  it("sums every candidate pair, and finds the relay by the selected pair", () => {
    const entries: StatsEntry[] = [
      { id: "CP1", type: "candidate-pair", localCandidateId: "L2", bytesReceived: 2_000, state: "failed" },
      { id: "CP2", type: "candidate-pair", localCandidateId: "L1", bytesReceived: 3_000_000, selected: true, nominated: true },
      relayCandidate,
      hostCandidate,
    ];

    expect(transportTotals(entries)).toEqual({ received: 3_002_000, relayed: true });
  });
});

describe("a connection with nothing yet", () => {
  it("has received nothing, and is not on the relay", () => {
    expect(transportTotals([])).toEqual({ received: 0, relayed: false });
  });
});
