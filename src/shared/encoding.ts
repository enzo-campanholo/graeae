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
 * A codec a share may go out in, best first. H.264 goes out in one of two profiles, and
 * Chromium and Firefox watchers decode both:
 * - High (`64001f`), on a Chromium screen share at one quality only, and only when the
 *   sharer's browser encodes it in hardware: at the same bitrate it gives the better
 *   picture (share-reliability tickets 09 and 14). The media server answers it with VP8
 *   on a share sent at two qualities (ticket 17).
 * - Baseline (`42001f`) everywhere else: Chrome on Windows encodes it in hardware, and
 *   the media server accepts it on a share sent at two qualities.
 *
 * Never constrained baseline, which Chrome on Windows encodes in software; never main;
 * never HEVC.
 */
export type Codec =
  | { mimeType: "video/H264"; profile: "high" | "baseline" }
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

/**
 * What the browser gives up first when the upload or the encoder is short:
 * `RTCRtpSendParameters.degradationPreference`. "maintain-resolution" gives up frame rate
 * and keeps the picture's size, "maintain-framerate" gives up size, and "balanced" leaves
 * the browser to choose.
 */
export type Degradation = "maintain-resolution" | "maintain-framerate" | "balanced";

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
  /**
   * What the browser gives up first above the share's last step down; at its last step
   * the browser chooses ("balanced"). A share with one step only is always "balanced".
   */
  degradation: Degradation;
}

/**
 * Hardware H.264 in baseline profile, or VP8, which every browser encodes in software
 * and decodes, on a browser without it, so that a share always starts.
 */
const HARDWARE_FIRST: Codec[] = [{ mimeType: "video/H264", profile: "baseline" }, { mimeType: "video/VP8" }];

/**
 * H.264 high profile first, on a Chromium screen share at one quality. The plan lists it
 * whatever the sharer's machine: the browser offers it only when it encodes it in
 * hardware, and goes on to baseline otherwise (`codecPreferences`).
 */
const HIGH_FIRST: Codec[] = [{ mimeType: "video/H264", profile: "high" }, ...HARDWARE_FIRST];

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
    // Nobody has seen a webcam open small: the browser chooses, as it always has.
    return plan(
      HARDWARE_FIRST,
      [{ name: "720p", height: 720, maxFramerate: 30, maxBitrate: 1_500_000 }],
      { width: 1280, height: 720, frameRate: 30 },
      "balanced",
    );
  }
  if (browser === "firefox") {
    // Firefox encodes H.264 in software only, where VP9 gives it the better picture: one
    // quality in VP9. Nobody has seen a Firefox share open small: it gives up size first,
    // as it always has.
    return plan(
      [{ mimeType: "video/VP9" }, { mimeType: "video/VP8" }],
      [{ name: "1080p", height: 1080, maxFramerate: 30, maxBitrate: 6_000_000 }],
      { ...SCREEN_CAPTURE, frameRate: 30 },
      "maintain-framerate",
    );
  }
  // Capture follows the monitor's refresh rate on Windows 11 and is polled slower than
  // asked: asking for 120 lets a full 60 through, and the sender is limited to 60.
  const capture = { ...SCREEN_CAPTURE, frameRate: 120 };
  const full: Quality = { name: "1080p", height: 1080, maxFramerate: 60, maxBitrate: 12_000_000 };
  // A Chromium screen share keeps its size and gives up frame rate. Giving up size first,
  // Chrome shrinks the capture before the first frame and encodes it in software, and only
  // some shares grow back: 13 of 16 on this server stayed at 480x270, and on Windows every
  // one opened under 360 lines in software. Keeping size, every one on Windows opened at
  // about 1080 lines in hardware and stayed there (share-reliability tickets 11 and 09).
  const degradation = "maintain-resolution";
  if (!twoQualities) return plan(HIGH_FIRST, [full], capture, degradation);
  return plan(
    HARDWARE_FIRST,
    [
      { ...full, rid: RIDS["1080p"] },
      { name: "720p", rid: RIDS["720p"], height: 720, maxFramerate: 60, maxBitrate: 4_000_000 },
    ],
    capture,
    degradation,
  );
}

function plan(
  codecs: Codec[],
  qualities: Quality[],
  capture: EncodingPlan["capture"],
  degradation: Degradation,
): EncodingPlan {
  // A viewer receives one quality at a time, the best at most.
  const maxBitrate = Math.max(...qualities.map((quality) => quality.maxBitrate));
  return { codecs, qualities, capture, maxBitrate, degradation };
}
