// The encoding plan: how a share goes out, as one pure rule taking the browser family
// and the kind of share (spec, Encoding and quality). Every number is fixed: neither the
// sharer nor the owner gets a setting.
//
// The media client sends by it, and the instance reads it too: whether a share has two
// qualities for a viewer to choose between, and its maximum bitrate for the usage count.

import type { ShareKind } from "./socket/shares.ts";

/**
 * Two qualities for a Chromium screen share, the one place they are switched on or off.
 * Off: every Chromium screen share is one 1080p60 quality at 12 Mbps, and viewers get no
 * quality choice and no "720p" mark.
 *
 * Off since the owner's check on Cloudflare (ticket 17). Both encodes stayed on the
 * hardware encoder, but the media server pads the 720p quality of an H.264 share while
 * probing for bandwidth, and Chromium and Firefox viewers freeze on it, for about half
 * the time. VP8 copes with the padding but is encoded in software. Sending the two
 * qualities as two tracks of one quality each is the way back to a choice (ticket 29).
 *
 * Read by the page only: a sharer tells the instance it sends two qualities when it
 * starts the share, so the instance's two-quality handling stays tested either way.
 */
export const TWO_QUALITIES = false;

/** The browsers whose shares differ: Chromium has screen audio and can send two qualities, Firefox neither. */
export type BrowserFamily = "chromium" | "firefox";

/**
 * A codec a share may go out in, best first. H.264 is only ever baseline profile
 * (`42001f`): Chrome on Windows encodes it in hardware, the media server accepts it on a
 * share sent at two qualities, and Firefox decodes it. Never constrained baseline, which
 * Chrome on Windows encodes in software; never main or high, which the media server
 * answers with VP8 on a share sent at two qualities and Firefox cannot decode; never HEVC.
 */
export type Codec =
  | { mimeType: "video/H264"; profile: "baseline" }
  | { mimeType: "video/VP8" }
  | { mimeType: "video/VP9" };

/** The name a quality goes by for a viewer: what they choose, and the mark they see. */
export type QualityName = "1080p" | "720p";

/**
 * The identifier of each quality's encode on a share with two qualities, which a viewer's
 * preferred quality names at the media server. The media server steps down in
 * alphabetical order, so the better quality has the earlier letter.
 */
export const RIDS: Record<QualityName, string> = { "1080p": "f", "720p": "h" };

/** One quality a share goes out at: one encode of its picture. */
export interface Quality {
  name: QualityName;
  /** The encode's identifier (`RIDS`), on a share with two qualities only. */
  rid?: string;
  /** The picture's height at most: a larger capture is scaled down to it. */
  height: number;
  maxFramerate: number;
  /** In bits per second. */
  maxBitrate: number;
}

export interface EncodingPlan {
  /**
   * The codecs, best first. The browser offers the first it has, alone, since the media
   * server picks its own favourite among several: one codec per share.
   */
  codecs: Codec[];
  /** The qualities sent, best first: two for a viewer to choose between, or one. */
  qualities: Quality[];
  /** What the capture is asked for: a picture up to this size, at this frame rate. */
  capture: { width: number; height: number; frameRate: number };
  /** The most one viewer can receive of it, in bits per second: the usage count's figure for a gap. */
  maxBitrate: number;
}

/**
 * Hardware H.264 in baseline profile, or VP8, which every browser encodes in software
 * and decodes, on a browser without it, so that a share always starts.
 */
const HARDWARE_FIRST: Codec[] = [{ mimeType: "video/H264", profile: "baseline" }, { mimeType: "video/VP8" }];

const SCREEN_CAPTURE = { width: 1920, height: 1080 };

/**
 * How a share of `kind` goes out from a browser of `browser`'s family. `twoQualities`
 * says whether a Chromium screen share goes out at two qualities, and means nothing for
 * any other share: the page takes `TWO_QUALITIES`, and the instance what the sharer said.
 */
export function encodingPlan(
  browser: BrowserFamily,
  kind: ShareKind,
  { twoQualities = TWO_QUALITIES }: { twoQualities?: boolean } = {},
): EncodingPlan {
  if (kind === "webcam") {
    return plan(HARDWARE_FIRST, [{ name: "720p", height: 720, maxFramerate: 30, maxBitrate: 1_500_000 }], {
      width: 1280,
      height: 720,
      frameRate: 30,
    });
  }
  if (browser === "firefox") {
    // Firefox encodes H.264 in software only, where VP9 gives it the better picture: one
    // quality in VP9.
    return plan(
      [{ mimeType: "video/VP9" }, { mimeType: "video/VP8" }],
      [{ name: "1080p", height: 1080, maxFramerate: 30, maxBitrate: 6_000_000 }],
      { ...SCREEN_CAPTURE, frameRate: 30 },
    );
  }
  // Capture follows the monitor's refresh rate on Windows 11 and is polled slower than
  // asked: asking for 120 lets a full 60 through, and the sender is limited to 60.
  const capture = { ...SCREEN_CAPTURE, frameRate: 120 };
  const full: Quality = { name: "1080p", height: 1080, maxFramerate: 60, maxBitrate: 12_000_000 };
  if (!twoQualities) return plan(HARDWARE_FIRST, [full], capture);
  return plan(
    HARDWARE_FIRST,
    [
      { ...full, rid: RIDS["1080p"] },
      { name: "720p", rid: RIDS["720p"], height: 720, maxFramerate: 60, maxBitrate: 4_000_000 },
    ],
    capture,
  );
}

function plan(codecs: Codec[], qualities: Quality[], capture: EncodingPlan["capture"]): EncodingPlan {
  // A viewer receives one quality at a time, the best at most.
  return { codecs, qualities, capture, maxBitrate: Math.max(...qualities.map((quality) => quality.maxBitrate)) };
}
