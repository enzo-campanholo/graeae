// What a tab's media connection has received, read from its statistics for the usage
// count: the running total of bytes its transport has received since it opened, and
// whether the path in use goes through the relay. Pure, so it is tested against the shapes
// Chromium and Firefox give; `browser.ts` hands it `RTCPeerConnection.getStats()`.

/** One entry of an `RTCStatsReport`, as far as this reads it. */
export interface StatsEntry {
  id: string;
  type: string;
  [field: string]: unknown;
}

export interface TransportTotals {
  /** Bytes the transport has received since the connection opened. */
  received: number;
  /** Whether the candidate pair in use has the relay on this side. */
  relayed: boolean;
}

/**
 * The connection's totals from its statistics. Chromium gives a `transport` entry with
 * the total and the pair in use. Firefox gives none, so the total is the sum over every
 * candidate pair (each counts what came over it), and the pair in use is the one marked
 * `selected`.
 */
export function transportTotals(entries: Iterable<StatsEntry>): TransportTotals {
  const all = [...entries];
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const pairs = all.filter((entry) => entry.type === "candidate-pair");
  const transport = all.find((entry) => entry.type === "transport" && typeof entry.bytesReceived === "number");

  const received = transport
    ? (transport.bytesReceived as number)
    : pairs.reduce((sum, pair) => sum + (typeof pair.bytesReceived === "number" ? pair.bytesReceived : 0), 0);

  const selectedId = transport?.selectedCandidatePairId;
  const inUse =
    (typeof selectedId === "string" ? byId.get(selectedId) : undefined) ??
    pairs.find((pair) => pair.selected === true) ??
    pairs.find((pair) => pair.nominated === true && pair.state === "succeeded");
  const local = typeof inUse?.localCandidateId === "string" ? byId.get(inUse.localCandidateId) : undefined;

  return { received, relayed: local?.candidateType === "relay" };
}
