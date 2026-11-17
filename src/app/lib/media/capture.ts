// What graeae asks the browser to capture for a screen share: one pure rule, taking the
// browser family (spec, Screen audio). Both media clients use it: the real one hands it
// to `getDisplayMedia`, the fake records it.
//
// The app never checks the operating system and never blocks a browser. Every browser
// that is not Firefox is asked as Chromium is, and takes what it understands of the
// request: a hint it does not know is ignored, and any audio its picker gives is sent.

import { encodingPlan, type BrowserFamily } from "../../../shared/encoding.ts";

export type { BrowserFamily };

/** Screen audio's constraints: stereo, and none of the processing meant for a voice. */
export interface ScreenAudio {
  channelCount: number;
  echoCancellation: false;
  noiseSuppression: false;
  autoGainControl: false;
  /** The sharing page's own audio is always left out of the capture. */
  restrictOwnAudio: true;
}

/**
 * The request to `getDisplayMedia`. The fields past `audio` are Chromium's picker hints,
 * which other browsers ignore.
 */
export interface ScreenCaptureRequest {
  video: {
    width: { max: number };
    height: { max: number };
    frameRate: { ideal: number; max: number };
  };
  audio: ScreenAudio | false;
  /** Pre-ticks the picker's audio checkbox; graeae has no audio toggle of its own. */
  audioSelection?: "preferred";
  /** Never the whole system's sound beside a whole screen. */
  systemAudio?: "exclude";
  /** A window's audio is its own application's, never the whole system's. */
  windowAudio?: "window";
  /** The sharing page's own tab is not offered in the picker. */
  selfBrowserSurface?: "exclude";
}

/**
 * What to ask the browser's picker for when a member shares their screen. The picture is
 * the encoding plan's: a larger monitor is scaled down to 1080p, and a Chromium capture
 * is asked for 120 fps so that a full 60 reaches the sender.
 */
export function screenCapture(browser: BrowserFamily): ScreenCaptureRequest {
  const { width, height, frameRate } = encodingPlan(browser, "screen").capture;
  const video = { width: { max: width }, height: { max: height }, frameRate: { ideal: frameRate, max: frameRate } };
  // Firefox captures no screen audio on any system: its share is video only.
  if (browser === "firefox") return { video, audio: false };
  return {
    video,
    audio: {
      channelCount: 2,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      restrictOwnAudio: true,
    },
    audioSelection: "preferred",
    systemAudio: "exclude",
    windowAudio: "window",
    selfBrowserSurface: "exclude",
  };
}

/** The family of the browser that sent `userAgent`. */
export function browserFamily(userAgent: string): BrowserFamily {
  return /\bFirefox\//.test(userAgent) ? "firefox" : "chromium";
}

/**
 * `sdp` with Opus asked for in stereo, both sent and received. Browsers send Opus in mono
 * unless the description says stereo, so the media client marks every description it
 * applies on a connection that carries screen audio.
 */
export function stereoOpus(sdp: string): string {
  const opus = new Set([...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000\/2\r?$/gim)].map((match) => match[1]));
  return sdp.replace(/^a=fmtp:(\d+) (.*?)(\r?)$/gm, (line, type: string, parameters: string, cr: string) => {
    if (!opus.has(type)) return line;
    const extra = ["stereo=1", "sprop-stereo=1"].filter((parameter) => !parameters.split(";").includes(parameter));
    return `a=fmtp:${type} ${[parameters, ...extra].join(";")}${cr}`;
  });
}
