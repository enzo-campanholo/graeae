// A screen share's capture, as pure rules (spec, Screen audio): what graeae asks the
// browser for, taking the browser family, which both media clients use (the real one
// hands it to `getDisplayMedia`, the fake records it); which audio the picker gives is
// screen audio, which the real client keeps and drops by; and the description that
// sends that audio in stereo.
//
// The app never checks the operating system and never blocks a browser. Every browser
// that is not Firefox is asked as Chromium is, and takes what it understands of the
// request: a hint it does not know is ignored. Audio its picker gives is sent only when
// `isScreenAudio` keeps it.

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

/**
 * The labels Chromium gives a tab's audio and one application's
 * (`GetAudioMediaStreamDeviceName`), read on Windows 11 with Chrome 158 and Helium.
 */
const SCREEN_AUDIO_LABELS = new Set(["Tab audio", "Application Audio"]);

/**
 * Whether a captured audio track with this label is screen audio: a tab's or one
 * application's, exactly as Chromium names them. Anything else (`System Audio`, which a
 * window share falls back to on Windows 10 and on some Windows 11 builds and which holds
 * every voice in the call, a track with no label, or a name not yet seen) is not.
 */
export function isScreenAudio(label: string): boolean {
  return SCREEN_AUDIO_LABELS.has(label);
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
