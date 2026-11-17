// The encoding plan (`src/shared/encoding.ts`) as the browser's own API takes it: the
// codec order for `setCodecPreferences`, the encodings for `addTransceiver`, and what a
// watched share's statistics say of the quality it arrives at. Pure, so the real media
// client stays thin and these are tested.

import type { Codec, EncodingPlan, QualityName } from "../../../shared/encoding.ts";

/** A codec as `RTCRtpSender.getCapabilities` lists it, cut down to what the order reads. */
export interface CodecCapability {
  mimeType: string;
  clockRate: number;
  sdpFmtpLine?: string;
}

/** Formats that repair a stream rather than carry it, kept after the codecs in the browser's own order. */
const REPAIR = /^video\/(rtx|red|ulpfec|flexfec-03)$/i;

/** The H.264 profile-level-id prefixes of high and main profile. Constrained baseline is 42e0, baseline 4200. */
const H264_PROFILE = { high: "64", main: "4d" } as const;

function matches(codec: Codec, capability: CodecCapability): boolean {
  if (capability.mimeType.toLowerCase() !== codec.mimeType.toLowerCase()) return false;
  const fmtp = capability.sdpFmtpLine ?? "";
  if (codec.mimeType === "video/H264") {
    const profile = /profile-level-id=([0-9a-f]{2})/i.exec(fmtp)?.[1]?.toLowerCase();
    // Packetization mode 1 only: mode 0 cannot carry a 1080p frame in one packet.
    return profile === H264_PROFILE[codec.profile] && /packetization-mode=1/.test(fmtp);
  }
  if (codec.mimeType === "video/VP9") return !/profile-id=[1-9]/.test(fmtp);
  return true;
}

/**
 * The browser's `capabilities` that the plan's `codecs` name, in the plan's order, then
 * the repair formats. Anything the plan does not name, constrained baseline and HEVC
 * among them, is left out, so the media server cannot answer with it.
 */
export function codecPreferences<T extends CodecCapability>(codecs: readonly Codec[], capabilities: readonly T[]): T[] {
  const chosen = codecs.flatMap((codec) => capabilities.filter((capability) => matches(codec, capability)));
  return [...chosen, ...capabilities.filter((capability) => REPAIR.test(capability.mimeType))];
}

/** One encoding of `addTransceiver`'s `sendEncodings`. */
export interface SendEncoding {
  rid?: string;
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

/**
 * The encodings a capture `captureHeight` lines high is sent with, one per quality of the
 * plan, each scaled down to its height and never up. A capture whose size the browser
 * does not say is taken to be the size asked for.
 */
export function sendEncodings(plan: EncodingPlan, captureHeight: number | undefined): SendEncoding[] {
  const height = captureHeight ?? plan.capture.height;
  return plan.qualities.map((quality) => ({
    ...(quality.rid === undefined ? {} : { rid: quality.rid }),
    maxBitrate: quality.maxBitrate,
    maxFramerate: quality.maxFramerate,
    scaleResolutionDownBy: Math.max(1, height / quality.height),
  }));
}

/**
 * The quality a watched share arrives at, from the height of the frames received: 720p
 * at 720 lines or fewer. Null before the first frame. A share smaller than 720p reads as
 * 720p whichever quality it comes at, which is what the viewer sees.
 */
export function receivedQuality(frameHeight: number | undefined): QualityName | null {
  if (frameHeight === undefined || frameHeight <= 0) return null;
  return frameHeight <= 720 ? "720p" : "1080p";
}
