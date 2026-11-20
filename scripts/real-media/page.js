// Runs in graeae's page before its own scripts (`member.ts` passes it to `addInitScript`).
// Keeps every media connection and capture the page makes, so the driver can read their
// statistics and see a capture end, without graeae's code knowing. Nothing here changes
// what the page does.
/* global window, console */

const kept = { connections: [], captures: [] };
window.__realMedia = kept;

// Every RTCPeerConnection the page makes, kept as it is made.
const Native = window.RTCPeerConnection;
window.RTCPeerConnection = new Proxy(Native, {
  construct(target, args, newTarget) {
    const connection = Reflect.construct(target, args, newTarget);
    kept.connections.push(connection);
    return connection;
  },
});

// Every capture, with a line in the console when the browser ends one of its tracks.
const devices = window.navigator.mediaDevices;
for (const method of ["getDisplayMedia", "getUserMedia"]) {
  const original = devices?.[method]?.bind(devices);
  if (!original) continue;
  devices[method] = async (...args) => {
    const stream = await original(...args);
    for (const track of stream.getTracks()) {
      const { width, height, frameRate, displaySurface } = track.getSettings();
      kept.captures.push({ method, track });
      console.info(`[real-media] captured ${track.kind}: ${displaySurface ?? "camera"} ${width ?? ""}x${height ?? ""} ${frameRate ? `${Math.round(frameRate)}fps` : ""}`.trim());
      track.addEventListener("ended", () => console.info(`[real-media] the browser ended the ${track.kind} track of a ${method === "getDisplayMedia" ? "screen" : "webcam"} capture`));
    }
    return stream;
  };
}

/** One line's worth of each stream the page sends or receives, from every connection still open. */
kept.report = async () => {
  const lines = [];
  for (const connection of kept.connections) {
    if (connection.connectionState === "closed") continue;
    const stats = await connection.getStats().catch(() => null);
    if (!stats) continue;
    const all = [...stats.values()];
    const byId = new Map(all.map((entry) => [entry.id, entry]));
    const pairId = all.find((entry) => entry.type === "transport")?.selectedCandidatePairId;
    const pair = byId.get(pairId);
    const local = pair && byId.get(pair.localCandidateId);
    for (const entry of all) {
      if (entry.type !== "outbound-rtp" && entry.type !== "inbound-rtp") continue;
      const source = entry.mediaSourceId && byId.get(entry.mediaSourceId);
      const codec = entry.codecId && byId.get(entry.codecId);
      lines.push({
        id: entry.id,
        direction: entry.type === "outbound-rtp" ? "out" : "in",
        kind: entry.kind,
        mid: entry.mid,
        rid: entry.rid,
        active: entry.active,
        width: entry.frameWidth,
        height: entry.frameHeight,
        fps: entry.framesPerSecond,
        captureFps: source?.framesPerSecond,
        captureWidth: source?.width,
        captureHeight: source?.height,
        frames: entry.type === "outbound-rtp" ? entry.framesEncoded : entry.framesDecoded,
        dropped: entry.framesDropped,
        freezes: entry.freezeCount,
        codec: codec?.mimeType,
        implementation: entry.encoderImplementation ?? entry.decoderImplementation,
        powerEfficient: entry.powerEfficientEncoder ?? entry.powerEfficientDecoder,
        limitedBy: entry.qualityLimitationReason,
        bytes: entry.type === "outbound-rtp" ? entry.bytesSent : entry.bytesReceived,
        at: entry.timestamp,
        audioLevel: entry.audioLevel ?? source?.audioLevel,
        audioEnergy: entry.totalAudioEnergy ?? source?.totalAudioEnergy,
        packetsLost: entry.packetsLost,
        path: local ? `${local.candidateType}/${local.relayProtocol ?? local.protocol}` : undefined,
      });
    }
  }
  return lines;
};
