// The media connection's statistics as the page's log holds them (ticket 48).

import { describe, expect, it } from "vitest";
import { pairSummary, streamSummaries, type Counted } from "../src/app/lib/media/stats.ts";
import type { StatsEntry } from "../src/app/lib/media/transport.ts";

const pair: StatsEntry[] = [
  { id: "T1", type: "transport", selectedCandidatePairId: "CP1" },
  { id: "CP1", type: "candidate-pair", localCandidateId: "L1", remoteCandidateId: "R1", currentRoundTripTime: 0.04 },
  { id: "L1", type: "local-candidate", candidateType: "relay", protocol: "udp", relayProtocol: "tls", address: "203.0.113.7" },
  { id: "R1", type: "remote-candidate", candidateType: "host", protocol: "udp", address: "198.51.100.2" },
];

function reading(at: number, sent: number, received: number): StatsEntry[] {
  return [
    ...pair,
    {
      id: "OUT",
      type: "outbound-rtp",
      kind: "video",
      mid: "0",
      rid: "h",
      timestamp: at,
      bytesSent: sent,
      framesPerSecond: 58,
      frameWidth: 1920,
      frameHeight: 1080,
      qualityLimitationReason: "bandwidth",
    },
    { id: "RIN", type: "remote-inbound-rtp", localId: "OUT", roundTripTime: 0.05, packetsLost: 3, jitter: 0.002 },
    {
      id: "IN",
      type: "inbound-rtp",
      kind: "video",
      mid: "2",
      timestamp: at,
      bytesReceived: received,
      framesPerSecond: 30,
      frameWidth: 1280,
      frameHeight: 720,
      packetsLost: 7,
      jitter: 0.01,
    },
  ];
}

describe("the media connection's statistics", () => {
  it("summarise each stream, with its bitrate from the reading before", () => {
    const counted: Counted = new Map();
    streamSummaries(reading(1_000, 0, 0), counted);

    const [out, inbound] = streamSummaries(reading(11_000, 5_000_000, 2_500_000), counted);

    expect(out).toEqual({
      direction: "out",
      kind: "video",
      mid: "0",
      rid: "h",
      bitrate: 4_000_000,
      fps: 58,
      width: 1920,
      height: 1080,
      packetsLost: 3,
      jitter: 0.002,
      rtt: 0.05,
      limitedBy: "bandwidth",
    });
    expect(inbound).toEqual({
      direction: "in",
      kind: "video",
      mid: "2",
      bitrate: 2_000_000,
      fps: 30,
      width: 1280,
      height: 720,
      packetsLost: 7,
      jitter: 0.01,
      rtt: 0.04,
      layer: "720p",
    });
  });

  it("give the pair in use by its candidates' types and protocols, never their addresses", () => {
    expect(pairSummary(pair)).toEqual({
      local: { type: "relay", protocol: "udp", relayProtocol: "tls" },
      remote: { type: "host", protocol: "udp" },
    });
  });
});
