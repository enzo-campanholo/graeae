// Runs in graeae's page before its own scripts (`member.ts` passes it to `addInitScript`).
// Keeps every media connection and capture the page makes, so the driver can read their
// statistics and see a capture end, without graeae's code knowing. Nothing here changes
// what the page does, but `fail` when the driver asks.
/* global window, document, console, performance, Event, setInterval, clearInterval */

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

// A copy of each "stats" line the page's log sends the instance on its socket, once each:
// a batch the socket loses goes again.
kept.statsLines = [];
const seen = new Set();
const send = window.WebSocket.prototype.send;
window.WebSocket.prototype.send = function (data, ...rest) {
  if (typeof data === "string" && data.includes('"stats"')) {
    try {
      const message = JSON.parse(data);
      for (const event of message.type === "log" ? (message.request?.events ?? []) : []) {
        const key = JSON.stringify(event);
        if (event.event !== "stats" || seen.has(key)) continue;
        seen.add(key);
        kept.statsLines.push(event);
      }
    } catch {
      // Not a batch of the page's log.
    }
  }
  return send.call(this, data, ...rest);
};

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

/** A codec as the readings name it: the mime subtype, with H.264's profile-level-id. */
const codecOf = (codec) =>
  codec && [codec.mimeType.replace(/^(video|audio)\//, ""), /profile-level-id=(\w+)/.exec(codec.sdpFmtpLine ?? "")?.[1]].filter(Boolean).join(" ");

/** The capture a sent stream comes from, as its track's label and getSettings() say at that reading. */
const captureOf = (source) => {
  const track = kept.captures.find((capture) => capture.track.id === source?.trackIdentifier)?.track;
  if (!track) return undefined;
  const { displaySurface, width, height, frameRate } = track.getSettings();
  return { surface: displaySurface, width, height, fps: frameRate && Math.round(frameRate), label: track.label };
};

/**
 * Every `ms`, a reading of each open connection kept in `kept.samples`: the pair's
 * estimate, round trip and bytes (padding and probes included), and each stream's own
 * bytes, target, frames, freezes and limit, its encoder or decoder, codec, key frames,
 * QP and encode time, the capture it comes from at that reading, and a received sound's
 * level. `sampleStop` hands them over and stops.
 */
kept.samples = [];
kept.sampleStart = (ms) => {
  clearInterval(kept.sampler);
  kept.samples = [];
  kept.sampler = setInterval(async () => {
    const at = Date.now();
    for (const [index, connection] of kept.connections.entries()) {
      if (connection.connectionState === "closed") continue;
      const stats = await connection.getStats().catch(() => null);
      if (!stats) continue;
      const all = [...stats.values()];
      const byId = new Map(all.map((entry) => [entry.id, entry]));
      const pair = byId.get(all.find((entry) => entry.type === "transport")?.selectedCandidatePairId);
      const reading = {
        at,
        connection: index,
        estimate: pair?.availableOutgoingBitrate,
        rtt: pair?.currentRoundTripTime,
        pairSent: pair?.bytesSent,
        pairReceived: pair?.bytesReceived,
        out: [],
        in: [],
      };
      for (const entry of all) {
        if (entry.type === "outbound-rtp" && entry.kind === "video" && entry.active !== false) {
          reading.out.push({
            mid: entry.mid,
            bytes: entry.bytesSent,
            header: entry.headerBytesSent,
            retransmitted: entry.retransmittedBytesSent,
            target: entry.targetBitrate,
            frames: entry.framesEncoded,
            width: entry.frameWidth,
            height: entry.frameHeight,
            fps: entry.framesPerSecond,
            limitedBy: entry.qualityLimitationReason,
            resolutionChanges: entry.qualityLimitationResolutionChanges,
            encoder: entry.encoderImplementation,
            hardware: entry.powerEfficientEncoder,
            codec: codecOf(byId.get(entry.codecId)),
            keyFrames: entry.keyFramesEncoded,
            qpSum: entry.qpSum,
            encodeTime: entry.totalEncodeTime,
            capture: captureOf(byId.get(entry.mediaSourceId)),
          });
        } else if (entry.type === "outbound-rtp") {
          reading.out.push({
            mid: entry.mid,
            kind: entry.kind,
            bytes: entry.bytesSent,
            header: entry.headerBytesSent,
            ...(entry.kind === "audio" ? { codec: codecOf(byId.get(entry.codecId)), capture: captureOf(byId.get(entry.mediaSourceId)) } : {}),
          });
        } else if (entry.type === "inbound-rtp") {
          reading.in.push({
            mid: entry.mid,
            kind: entry.kind,
            bytes: entry.bytesReceived,
            header: entry.headerBytesReceived,
            frames: entry.framesDecoded,
            received: entry.framesReceived,
            dropped: entry.framesDropped,
            freezes: entry.freezeCount,
            freezeSeconds: entry.totalFreezesDuration,
            lost: entry.packetsLost,
            width: entry.frameWidth,
            height: entry.frameHeight,
            fps: entry.framesPerSecond,
            keyFrames: entry.keyFramesDecoded,
            pli: entry.pliCount,
            fir: entry.firCount,
            nack: entry.nackCount,
            decoder: entry.decoderImplementation,
            hardware: entry.powerEfficientDecoder,
            codec: codecOf(byId.get(entry.codecId)),
            audioLevel: entry.audioLevel,
            audioEnergy: entry.totalAudioEnergy,
          });
        }
      }
      kept.samples.push(reading);
    }
  }, ms);
  return "sampling";
};
kept.sampleStop = () => {
  clearInterval(kept.sampler);
  const samples = kept.samples;
  kept.samples = [];
  return samples;
};

// Which of the tab's two media connections (ADR 0005) a connection is: the media server
// offers on the receiving one and the tab on the sending one.
const purposeOf = (connection) => {
  if (connection.currentRemoteDescription?.type === "offer") return "receiving";
  if (connection.currentLocalDescription?.type === "offer") return "sending";
  return null;
};

// When each frame of every picture on the page was shown, for the last minute.
const frames = [];
const hooked = new WeakSet();
setInterval(() => {
  for (const video of document.querySelectorAll("video")) {
    if (hooked.has(video)) continue;
    hooked.add(video);
    const shown = (now) => {
      frames.push(now);
      while (frames[0] < now - 60_000) frames.shift();
      video.requestVideoFrameCallback(shown);
    };
    video.requestVideoFrameCallback(shown);
  }
}, 20);

/**
 * Makes the open connection of this purpose report "failed", as Chrome does when its
 * transport fails, so the page restarts it (sending) or replaces it (receiving). Only the
 * page is told; the connection itself goes on.
 */
kept.fail = (purpose) => {
  const connection = kept.connections.filter((c) => c.connectionState !== "closed" && purposeOf(c) === purpose).at(-1);
  if (!connection) return { failed: false };
  kept.failedAt = performance.now();
  kept.madeBefore = kept.connections.length;
  Object.defineProperty(connection, "connectionState", { get: () => "failed" });
  connection.dispatchEvent(new Event("connectionstatechange"));
  return { failed: true };
};

/** The longest time between two frames shown since the last `fail`, with one picture watched. */
kept.gaps = () => {
  const since = kept.failedAt ?? performance.now() - 60_000;
  const shown = frames.filter((at) => at > since - 3000);
  let worst = 0;
  let from = 0;
  for (let i = 1; i < shown.length; i++) {
    if (shown[i] - shown[i - 1] > worst) [worst, from] = [shown[i] - shown[i - 1], shown[i - 1]];
  }
  return {
    worstMs: Math.round(worst),
    startsMsAfterFail: kept.failedAt === undefined ? null : Math.round(from - kept.failedAt),
    framesSince: shown.filter((at) => at > since).length,
    connectionsMade: kept.madeBefore === undefined ? null : kept.connections.length - kept.madeBefore,
  };
};
