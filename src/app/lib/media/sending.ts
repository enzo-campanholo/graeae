// What a live share sends on a weak upload, and what its sharer is told: one pure rule,
// fed readings of the share's statistics every couple of seconds (spec, Encoding and
// quality, and The room's screen).
//
// On a weak upload the share steps down by itself, since the browser has no setting for
// a resolution floor: the 1080p quality stops first, so every viewer gets 720p60; if that
// does not fit, frame rate drops to 30; below 720p30 the browser degrades as it sees fit.
// It steps back up when the upload recovers. It never ends a share. The step-down is
// switched off (`STEP_DOWN`): the browser's estimate of the upload could not tell a
// weak upload from a healthy one.
//
// The sharer's notes are driven by the same readings: capture stuck near 48 fps, software
// encoding, and an upload that cannot carry 1080p.
//
// Both media clients run every share they send through `follow`: the real one feeds it
// the browser's `getStats()`, the fake whatever a Seam 2 journey says.

import type { EncodingPlan } from "../../../shared/encoding.ts";
import { sendEncodings } from "./encodings.ts";

/**
 * The step-down, the one place it is switched on or off. Off: a share always goes out at
 * its full plan, the browser alone gives up what it must on a weak upload (resolution
 * first), and its sharer gets no note on the upload. The notes on 48 fps and on software
 * encoding stay.
 *
 * Off since the owner's check on Cloudflare (ticket 18). On a 288 Mbps upload, with
 * nothing lost and a round trip of a few milliseconds, the browser's estimate of the
 * upload sat at 5 to 10 Mbps by itself for minutes, saying "bandwidth" for up to a minute
 * at a time; under a 10 Mbps cap it read the same. Nothing in a sender's statistics told
 * the two apart, so every step down and every note on the upload was false.
 */
export const STEP_DOWN = false;

// The spec gives no thresholds for stepping down or up. These are graeae's, all here.

/** How often a live share's statistics are read. */
export const READ_EVERY_MS = 2_000;
/**
 * How long after a share starts, or changes step, its upload's limit is not counted: the
 * browser's estimate of the upload starts low and climbs, and says "limited" meanwhile.
 */
export const SETTLE_MS = 10_000;
/**
 * How far back a step down looks. The browser's estimate of the upload drops by itself on
 * a healthy upload and takes 15 seconds or more to climb back, saying "bandwidth" for 7
 * to 15 seconds meanwhile (the owner's check of ticket 17): a weak upload holds a share
 * back for longer than that.
 */
export const STEP_DOWN_WINDOW_MS = 30_000;
/** Held back by the upload at this many readings within the window (most of its 15): one step down. */
export const STEP_DOWN_READINGS = 12;
/**
 * The browser aiming at this fraction of the step's own bitrate limit, or more, is held
 * back by that limit and not by the upload, whatever it says.
 */
export const OWN_LIMIT_FRACTION = 0.9;
/**
 * A share sending less than this fraction of what the browser estimates the upload carries
 * is held back by its own calm picture, not by the upload, whatever the browser says. The
 * estimate is the whole media connection's, which a webcam or screen audio sent alongside
 * shares, hence the margin.
 */
export const SENDING_FRACTION = 0.5;
/** Not held back by the upload at any reading for this long: one step back up. */
export const STEP_UP_AFTER_MS = 30_000;
/** A step up that is stepped down again sooner than this did not hold: the next wait doubles. */
export const HELD_MS = 60_000;
/** The longest wait before trying a step up again. */
export const STEP_UP_LONGEST_MS = 480_000;
/** The capture frame rates read as "near 48": Windows' capture on a 144 Hz monitor. */
export const NEAR_48_FPS = { from: 46, to: 50 } as const;
/** A capture at this frame rate or more is not held back by the monitor. */
export const FULL_RATE_FPS = 55;
/** How long the capture keeps near 48, or at a full rate, before the note comes or goes. */
export const SETTLED_AFTER_MS = 8_000;
/**
 * The one quality left on a stepped-down share: its height, and its frame rate at the
 * last step. A step keeps the quality's bitrate limit: the browser's estimate of the
 * upload already holds the share under what the upload carries, and a lower cap only
 * starves the encoder, which then scales the picture on down below 720 lines.
 */
export const STEPPED = { height: 720, lastFramerate: 30 } as const;

/**
 * How far a share has stepped down: its full plan, 720p (the 1080p quality stopped, or
 * the one quality scaled down), or 720p at 30 fps.
 */
export type Step = "full" | "720p" | "720p30";

/** What the browser gives up first when the upload is short: `RTCRtpSendParameters.degradationPreference`. */
export type Degradation = "maintain-framerate" | "balanced";

/** One reading of a share's statistics. What the browser did not report is left out. */
export interface Reading {
  /** When it was read, in milliseconds on the same clock as the share's start. */
  at: number;
  /**
   * Whether the browser says a quality being sent is held back by the upload: it lowered
   * the picture because the encoder struggled at the bitrate it aims at.
   */
  limited?: boolean;
  /** The bitrate the browser aims at, over the qualities being sent, in bits per second. */
  target?: number;
  /** The bytes of picture sent so far, over every quality. */
  bytesSent?: number;
  /** What the browser estimates the upload carries, in bits per second. */
  estimate?: number;
  /** The frame rate the capture delivers. */
  captureFps?: number;
  /** Whether the picture is encoded in software. */
  software?: boolean;
}

/** What a live share is sending and what its sharer is told, from the readings so far. */
export interface Sending {
  readonly plan: EncodingPlan;
  /** Whether this share steps down on a weak upload (`STEP_DOWN`). */
  readonly stepDown: boolean;
  /** The steps this share can take, from its full plan down. */
  readonly steps: readonly Step[];
  readonly step: Step;
  /** When the share started or last changed step. */
  readonly changedAt: number;
  /** When the last step up was, while it has not yet held. */
  readonly steppedUpAt: number | null;
  /** How long the upload must stay calm before the next step up. */
  readonly upWait: number;
  /** The last reading's bytes of picture sent so far, to tell the rate it sends at. */
  readonly lastBytesSent: { at: number; bytes: number } | null;
  /** When each reading held back by the upload was, once settled, within the window. */
  readonly heldBackAt: readonly number[];
  /** The first reading of the run not limited by the upload; null outside one. */
  readonly calmSince: number | null;
  /** The first reading of the run with the capture near 48 fps. */
  readonly near48Since: number | null;
  /** The first reading of the run with the capture at a full rate. */
  readonly fullRateSince: number | null;
  readonly at48: boolean;
  readonly software: boolean;
}

/** The notes a sharer sees on their own share. */
export interface SharerNotes {
  /** The capture has settled near 48 fps: a 144 Hz monitor on Windows. */
  at48: boolean;
  /** The share is encoded in software. */
  software: boolean;
  /** How far the share has stepped down for its upload; null at its full plan. */
  upload: Exclude<Step, "full"> | null;
}

/**
 * A share of `plan` that starts sending at `at`, stepping down on a weak upload if
 * `stepDown` says so: the media clients take `STEP_DOWN`, and the tests say.
 */
export function startSending(
  plan: EncodingPlan,
  at: number,
  { stepDown = STEP_DOWN }: { stepDown?: boolean } = {},
): Sending {
  const top = plan.qualities[0]!;
  const fps = Math.max(...plan.qualities.map((quality) => quality.maxFramerate));
  const steps: Step[] = ["full"];
  if (top.height > STEPPED.height) steps.push("720p");
  if (fps > STEPPED.lastFramerate) steps.push("720p30");
  return {
    plan,
    stepDown,
    steps,
    step: "full",
    changedAt: at,
    steppedUpAt: null,
    upWait: STEP_UP_AFTER_MS,
    lastBytesSent: null,
    heldBackAt: [],
    calmSince: null,
    near48Since: null,
    fullRateSince: null,
    at48: false,
    software: false,
  };
}

/** `sending` once `reading` is taken into account. */
export function nextSending(sending: Sending, reading: Reading): Sending {
  const { at } = reading;
  let next: Sending = { ...sending, ...capture(sending, reading) };
  if (reading.software !== undefined) next = { ...next, software: reading.software };
  if (reading.bytesSent !== undefined) next = { ...next, lastBytesSent: { at, bytes: reading.bytesSent } };

  const settled = at >= sending.changedAt + SETTLE_MS;
  const byUpload = heldByUpload(sending, reading);
  const heldBackAt = sending.heldBackAt.filter((when) => when > at - STEP_DOWN_WINDOW_MS);
  if (byUpload === true && settled) heldBackAt.push(at);
  const calmSince = byUpload === false ? (sending.calmSince ?? at) : null;
  next = { ...next, heldBackAt, calmSince };

  // A step up that held for a minute: the next one waits the shortest time again.
  if (next.steppedUpAt !== null && at - next.steppedUpAt >= HELD_MS)
    next = { ...next, steppedUpAt: null, upWait: STEP_UP_AFTER_MS };

  const index = next.steps.indexOf(next.step);
  if (!next.stepDown) return next;
  if (heldBackAt.length >= STEP_DOWN_READINGS && index < next.steps.length - 1) {
    const failed = next.steppedUpAt !== null;
    return {
      ...next,
      step: next.steps[index + 1]!,
      changedAt: at,
      steppedUpAt: null,
      upWait: failed ? Math.min(next.upWait * 2, STEP_UP_LONGEST_MS) : STEP_UP_AFTER_MS,
      heldBackAt: [],
      calmSince: null,
    };
  }
  if (calmSince !== null && at - calmSince >= next.upWait && index > 0) {
    return { ...next, step: next.steps[index - 1]!, changedAt: at, steppedUpAt: at, heldBackAt: [], calmSince: null };
  }
  return next;
}

/**
 * Whether `reading` says the upload holds the share back: the browser says so, aims short
 * of the step's own bitrate limit (`OWN_LIMIT_FRACTION`), and sends enough of what it
 * estimates the upload carries (`SENDING_FRACTION`). A condition the reading cannot tell
 * is passed over; undefined when the reading does not say whether the browser is limited.
 */
function heldByUpload(sending: Sending, reading: Reading): boolean | undefined {
  if (reading.limited === undefined) return undefined;
  if (!reading.limited) return false;
  if (reading.target !== undefined && reading.target >= OWN_LIMIT_FRACTION * stepLimit(sending)) return false;
  const rate = sendingRate(sending, reading);
  return rate === undefined || reading.estimate === undefined || rate >= SENDING_FRACTION * reading.estimate;
}

/**
 * The bits per second sent between `sending`'s last reading and `reading`, if both say
 * and the count did not start again in between.
 */
function sendingRate(sending: Sending, reading: Reading): number | undefined {
  const last = sending.lastBytesSent;
  if (last === null || reading.bytesSent === undefined || reading.at <= last.at || reading.bytesSent < last.bytes)
    return undefined;
  return ((reading.bytesSent - last.bytes) * 8 * 1000) / (reading.at - last.at);
}

/** The bitrate limit of `sending`'s step, over the qualities it sends. */
function stepLimit(sending: Sending): number {
  return stepEncodings(sending.plan, sending.step, undefined)
    .filter((encoding) => encoding.active)
    .reduce((sum, encoding) => sum + encoding.maxBitrate, 0);
}

/** The note on capturing at 48 fps, from the capture's frame rate in `reading`. */
function capture(sending: Sending, reading: Reading): Pick<Sending, "near48Since" | "fullRateSince" | "at48"> {
  const fps = reading.captureFps;
  // A share that asks for 30 fps or less loses nothing to a capture at 48.
  if (sending.plan.qualities.every((quality) => quality.maxFramerate <= 30)) return sending;
  const near48 = fps !== undefined && fps >= NEAR_48_FPS.from && fps <= NEAR_48_FPS.to;
  const fullRate = fps !== undefined && fps >= FULL_RATE_FPS;
  const near48Since = near48 ? (sending.near48Since ?? reading.at) : null;
  const fullRateSince = fullRate ? (sending.fullRateSince ?? reading.at) : null;
  let at48 = sending.at48;
  if (near48Since !== null && reading.at - near48Since >= SETTLED_AFTER_MS) at48 = true;
  if (fullRateSince !== null && reading.at - fullRateSince >= SETTLED_AFTER_MS) at48 = false;
  return { near48Since, fullRateSince, at48 };
}

/** The notes the sharer of `sending` sees. */
export function sharerNotes(sending: Sending): SharerNotes {
  return { at48: sending.at48, software: sending.software, upload: sending.step === "full" ? null : sending.step };
}

/** One encoding of a live share, as `RTCRtpSender.setParameters` takes it. */
export interface StepEncoding {
  rid?: string;
  active: boolean;
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

/**
 * What a share of `plan`, captured `captureHeight` lines high, sends at `step`. A share
 * with two qualities stops its 1080p quality; a share with one is scaled down to 720p.
 * At 720p30 the 720p quality is limited to 30 fps. No step changes a bitrate limit.
 */
export function stepEncodings(plan: EncodingPlan, step: Step, captureHeight: number | undefined): StepEncoding[] {
  const height = captureHeight ?? plan.capture.height;
  const full = sendEncodings(plan, captureHeight);
  const twoQualities = plan.qualities.some((quality) => quality.height <= STEPPED.height) && plan.qualities.length > 1;
  return full.map((encoding, index) => {
    const quality = plan.qualities[index]!;
    const sent = { ...encoding, active: true };
    if (step === "full") return sent;
    if (quality.height > STEPPED.height && twoQualities) return { ...sent, active: false };
    return {
      ...sent,
      maxFramerate: step === "720p30" ? Math.min(STEPPED.lastFramerate, quality.maxFramerate) : quality.maxFramerate,
      scaleResolutionDownBy: Math.max(1, height / STEPPED.height),
    };
  });
}

/**
 * What the browser gives up first when the upload is short of even the step's limits:
 * resolution, so motion stays smooth, until the share's last step, below which the
 * browser degrades as it sees fit.
 */
export function degradationPreference(sending: Sending): Degradation {
  return sending.step === sending.steps.at(-1) ? "balanced" : "maintain-framerate";
}

/** One entry of a sender's `RTCStatsReport`, as far as a reading reads it. */
export type StatsEntry = Record<string, unknown>;

/** Encoders the browser names that run in software. */
const SOFTWARE_ENCODER = /openh264|libvpx|libaom|software/i;

/**
 * A reading at `at` of a sender's statistics. A quality that was stopped says nothing,
 * and only the upload limits it: a limit from the processor is not the upload's. The
 * bytes sent count every quality, stopped or not, so they only ever grow.
 */
export function readingOf(entries: Iterable<StatsEntry>, at: number): Reading {
  const reading: Reading = { at, limited: false };
  const pairs = new Map<unknown, StatsEntry>();
  let selectedPair: unknown;
  for (const entry of entries) {
    if (entry.type === "candidate-pair") pairs.set(entry.id, entry);
    if (entry.type === "transport") selectedPair = entry.selectedCandidatePairId;
    if (entry.kind !== "video") continue;
    if (entry.type === "outbound-rtp" && typeof entry.bytesSent === "number")
      reading.bytesSent = (reading.bytesSent ?? 0) + entry.bytesSent;
    if (entry.type === "media-source" && typeof entry.framesPerSecond === "number")
      reading.captureFps = entry.framesPerSecond;
    if (entry.type !== "outbound-rtp" || entry.active === false) continue;
    if (entry.qualityLimitationReason === "bandwidth") reading.limited = true;
    if (typeof entry.targetBitrate === "number") reading.target = (reading.target ?? 0) + entry.targetBitrate;
    let software: boolean | undefined;
    if (typeof entry.powerEfficientEncoder === "boolean") software = !entry.powerEfficientEncoder;
    else if (typeof entry.encoderImplementation === "string")
      software = SOFTWARE_ENCODER.test(entry.encoderImplementation);
    if (software !== undefined) reading.software = (reading.software ?? false) || software;
  }
  const estimate = pairs.get(selectedPair)?.availableOutgoingBitrate;
  if (typeof estimate === "number") reading.estimate = estimate;
  return reading;
}

/** What `follow` changes on the live share, and tells its sharer. */
export interface Follower {
  /** Changes what the live share sends, on the share itself and with no new negotiation. */
  apply(encodings: StepEncoding[], degradation: Degradation): void;
  /** The sharer's notes changed. */
  notes(notes: SharerNotes): void;
}

/**
 * Follows a live share of `plan`, captured `captureHeight` lines high, that starts
 * sending at `at`: it goes out at its full plan and with no note at once, and each
 * reading given to the returned function may step it down or up, through
 * `follower.apply`, and change the sharer's notes, through `follower.notes`. It steps
 * only if `stepDown` says so, `STEP_DOWN` unless a journey says otherwise.
 */
export function follow(
  plan: EncodingPlan,
  captureHeight: number | undefined,
  at: number,
  follower: Follower,
  { stepDown = STEP_DOWN }: { stepDown?: boolean } = {},
): (reading: Reading) => void {
  let sending = startSending(plan, at, { stepDown });
  let told = JSON.stringify(sharerNotes(sending));
  follower.apply(stepEncodings(plan, sending.step, captureHeight), degradationPreference(sending));
  follower.notes(sharerNotes(sending));
  return (reading) => {
    const before = sending;
    sending = nextSending(sending, reading);
    if (sending.step !== before.step)
      follower.apply(stepEncodings(plan, sending.step, captureHeight), degradationPreference(sending));
    const notes = sharerNotes(sending);
    if (JSON.stringify(notes) !== told) {
      told = JSON.stringify(notes);
      follower.notes(notes);
    }
  };
}

/** The latest notes on each live share a media client sends, and who hears them. */
export class NotesBoard<Share> {
  private readonly latest = new Map<Share, SharerNotes>();
  private readonly hearing = new Map<Share, (notes: SharerNotes) => void>();

  /** The notes on `share` are now `notes`. */
  tell(share: Share, notes: SharerNotes) {
    this.latest.set(share, notes);
    this.hearing.get(share)?.(notes);
  }

  /** Tells `heard` the notes on `share`, now if it has any and whenever they change. */
  listen(share: Share, heard: (notes: SharerNotes) => void): () => void {
    this.hearing.set(share, heard);
    const notes = this.latest.get(share);
    if (notes) heard(notes);
    return () => {
      if (this.hearing.get(share) === heard) this.hearing.delete(share);
    };
  }

  /** `share` is no longer sent: its notes go, and start afresh if it is sent again. */
  forget(share: Share) {
    this.latest.delete(share);
    this.hearing.delete(share);
  }
}
