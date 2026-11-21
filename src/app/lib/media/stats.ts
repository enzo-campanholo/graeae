// What the page's log says of the media connection every 15 seconds while it shares or
// watches (ticket 48): one summary per stream it sends or receives, and the candidate
// pair in use, by type and protocol only. Pure, so it is tested against the shapes
// Chromium and Firefox give; `browser.ts` hands it `RTCPeerConnection.getStats()` and
// what each captured picture's track says of itself at that reading.
//
// The fields past the basics answer the share reliability map's questions: which
// encoder a share goes out on and whether it is hardware, how the capture's size moves
// under it, what Chrome estimates the upload to be against what it aims to send, and
// what a watcher's picture and sound actually do. Nothing else goes in: every field is
// on every line of a long evening.

import type { QualityName } from "../../../shared/encoding.ts";
import { receivedQuality } from "./encodings.ts";
import type { StatsEntry } from "./transport.ts";

/** How often the media connection's statistics go in the page's log. */
export const STATS_EVERY_MS = 15_000;

/** One stream's summary, as its `stats` line holds it. */
export interface StreamSummary {
  direction: "out" | "in";
  kind: string;
  mid?: string;
  /** The simulcast layer a stream sent at two qualities goes out on. */
  rid?: string;
  /** Bits per second since the last summary; absent for the first. */
  bitrate?: number;
  fps?: number;
  width?: number;
  height?: number;
  packetsLost?: number;
  /** Seconds. */
  jitter?: number;
  /** Seconds: the far end's report for a stream sent, the candidate pair's for one received. */
  rtt?: number;
  /** The quality a received picture arrives at. */
  layer?: QualityName | null;
  /** What holds the encoder back: "bandwidth", "cpu", "other" or "none". */
  limitedBy?: string;
  framesDropped?: number;
  freezes?: number;
  /** Seconds the received picture has spent frozen, in all. */
  freezeSeconds?: number;
  /** The encoder a stream sent goes out on, as the browser names it: "OpenH264" is software. */
  encoder?: string;
  /** Whether that encoder is the hardware's: Chromium's `powerEfficientEncoder`. */
  hardware?: boolean;
  /** The decoder a stream received is decoded by, where the browser names it. */
  decoder?: string;
  /** The codec a picture sent goes out in, with H.264's profile: "H264 42e01f". */
  codec?: string;
  /** Bits per second the encoder aims for. */
  targetBitrate?: number;
  /** Bits per second the browser estimates its upload to be: the pair in use's `availableOutgoingBitrate`. */
  estimate?: number;
  keyFrames?: number;
  /** How many times the encoder changed the sent picture's size for what held it back. */
  resolutionChanges?: number;
  /** What the receiver asked again: key frames (`pliCount`, `firCount`) and lost packets (`nackCount`). */
  pli?: number;
  fir?: number;
  nack?: number;
  /** A received sound's level, from 0 to 1: screen audio, since a webcam share has none. */
  level?: number;
  /** What the captured picture's track says of itself at this reading. */
  capture?: CaptureNow;
}

/** A captured picture's track at one reading, from its `getSettings()`. */
export interface CaptureNow {
  /** "browser" (a tab), "window" or "monitor"; absent for a webcam. */
  surface?: string;
  width?: number;
  height?: number;
}

/** The candidate pair in use, by how it connects. */
export interface PairSummary {
  local: { type?: string; protocol?: string; relayProtocol?: string };
  remote: { type?: string; protocol?: string };
}

/** The bytes each stream had counted at the last summary, by its stats id, to give its bitrate. */
export type Counted = Map<string, { bytes: number; at: number }>;

/**
 * The summary of every stream in `entries`, updating `counted` for the next one's
 * bitrates. `captures` holds each captured picture's track at this reading, by its id.
 */
export function streamSummaries(
  entries: Iterable<StatsEntry>,
  counted: Counted,
  captures: ReadonlyMap<string, CaptureNow> = new Map(),
): StreamSummary[] {
  const all = [...entries];
  const pair = pairInUse(all);
  const pairRtt = number(pair?.currentRoundTripTime);
  const estimate = whole(pair?.availableOutgoingBitrate);
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const remote = new Map(all.filter((entry) => entry.type === "remote-inbound-rtp").map((entry) => [entry.localId, entry]));
  const summaries: StreamSummary[] = [];
  for (const entry of all) {
    const out = entry.type === "outbound-rtp";
    if (!out && entry.type !== "inbound-rtp") continue;
    const bytes = number(out ? entry.bytesSent : entry.bytesReceived);
    const at = number(entry.timestamp);
    const before = counted.get(entry.id);
    if (bytes !== undefined && at !== undefined) counted.set(entry.id, { bytes, at });
    const bitrate =
      before && bytes !== undefined && at !== undefined && at > before.at
        ? Math.round(((bytes - before.bytes) * 8 * 1000) / (at - before.at))
        : undefined;
    const far = out ? remote.get(entry.id) : undefined;
    const height = number(entry.frameHeight);
    const video = entry.kind === "video";
    const source = out && video ? byId.get(String(entry.mediaSourceId)) : undefined;
    const capture = typeof source?.trackIdentifier === "string" ? captures.get(source.trackIdentifier) : undefined;
    summaries.push(
      compact({
        direction: out ? "out" : "in",
        kind: typeof entry.kind === "string" ? entry.kind : "unknown",
        mid: string(entry.mid),
        rid: string(entry.rid),
        bitrate,
        fps: number(entry.framesPerSecond),
        width: number(entry.frameWidth),
        height,
        packetsLost: number(out ? far?.packetsLost : entry.packetsLost),
        jitter: number(out ? far?.jitter : entry.jitter),
        rtt: out ? number(far?.roundTripTime) : pairRtt,
        layer: !out && entry.kind === "video" ? receivedQuality(height) : undefined,
        limitedBy: string(entry.qualityLimitationReason),
        framesDropped: number(entry.framesDropped),
        freezes: number(entry.freezeCount),
        freezeSeconds: rounded(entry.totalFreezesDuration),
        encoder: string(entry.encoderImplementation),
        hardware: boolean(entry.powerEfficientEncoder),
        decoder: string(entry.decoderImplementation),
        codec: out && video ? codecOf(byId.get(String(entry.codecId))) : undefined,
        targetBitrate: whole(entry.targetBitrate),
        estimate: out && video ? estimate : undefined,
        keyFrames: number(entry.keyFramesEncoded),
        resolutionChanges: number(entry.qualityLimitationResolutionChanges),
        pli: out ? undefined : number(entry.pliCount),
        fir: out ? undefined : number(entry.firCount),
        nack: out ? undefined : number(entry.nackCount),
        level: !out && !video ? rounded(entry.audioLevel) : undefined,
        capture: capture && compact(capture),
      }),
    );
  }
  return summaries;
}

/** The candidate pair in use, by its candidates' types and protocols; null before there is one. */
export function pairSummary(entries: Iterable<StatsEntry>): PairSummary | null {
  const all = [...entries];
  const pair = pairInUse(all);
  if (!pair) return null;
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const local = byId.get(String(pair.localCandidateId));
  const remote = byId.get(String(pair.remoteCandidateId));
  return {
    local: compact({ type: string(local?.candidateType), protocol: string(local?.protocol), relayProtocol: string(local?.relayProtocol) }),
    remote: compact({ type: string(remote?.candidateType), protocol: string(remote?.protocol) }),
  };
}

/** As `transport.ts` finds it: Chromium names it on the transport, Firefox marks it selected. */
function pairInUse(all: StatsEntry[]): StatsEntry | undefined {
  const selected = all.find((entry) => entry.type === "transport")?.selectedCandidatePairId;
  const pairs = all.filter((entry) => entry.type === "candidate-pair");
  return (
    (typeof selected === "string" ? pairs.find((pair) => pair.id === selected) : undefined) ??
    pairs.find((pair) => pair.selected === true) ??
    pairs.find((pair) => pair.nominated === true && pair.state === "succeeded")
  );
}

/** A codec entry by its mime type's subtype, with H.264's profile-level-id. */
function codecOf(entry: StatsEntry | undefined): string | undefined {
  const name = string(entry?.mimeType)?.replace(/^video\//i, "");
  if (!name) return undefined;
  const profile = /profile-level-id=([0-9a-f]{6})/i.exec(String(entry?.sdpFmtpLine ?? ""))?.[1];
  return profile ? `${name} ${profile.toLowerCase()}` : name;
}

function whole(value: unknown): number | undefined {
  const it = number(value);
  return it === undefined ? undefined : Math.round(it);
}

/** To three places: a level or a duration needs no more. */
function rounded(value: unknown): number | undefined {
  const it = number(value);
  return it === undefined ? undefined : Math.round(it * 1000) / 1000;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `fields` without those left undefined, so a line holds only what the browser gave. */
function compact<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
}
