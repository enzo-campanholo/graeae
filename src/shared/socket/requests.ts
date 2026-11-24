// What the instance makes of a tab's request. A tab's message is only shaped like a
// `ClientMessage` (see `index.ts`): before the instance acts on one, the check for its
// area and type here reads every field it needs and gives it typed, or null for a
// request the instance does not understand, which it ignores.
//
// A start whose kind is known but whose other fields are not is understood, and refused:
// the tab hears `refused` for that kind, as for any start the instance turns down.

import type { BrowserFamily } from "../encoding.ts";
import { isMediaPurpose, type MediaPurpose } from "./media.ts";
import { isShareKind, type LiveShare, type ShareKind } from "./shares.ts";
import { isQualityChoice, type QualityChoice } from "./watching.ts";

/** The transceivers a share goes out on: its video's mid, and its screen audio's when it has any. */
export interface ShareMids {
  video: string;
  audio?: string;
}

/** What a start asks for besides its kind; null in `shares.start` when any of it is malformed. */
export interface StartDetails {
  offer: string;
  mids: ShareMids;
  /** The family of the browser sending it, when it said one graeae knows. */
  browser: BrowserFamily | null;
  /** Whether the sharer says it sends two qualities. The encoding plan holds it to a Chromium screen share. */
  twoQualities: boolean;
  handOver: boolean;
}

/** A request the instance understands, named `<area>.<type>`, with its fields checked. */
export type CheckedRequest =
  | { name: "usage.received"; bytes: number; relayed: boolean }
  | { name: "media.connect"; connection: MediaPurpose }
  | { name: "media.replace" }
  | { name: "media.answer"; answer: string }
  | { name: "media.restart"; offer: string; mid: string }
  | { name: "media.reconnect" }
  | { name: "media.faltering" }
  | { name: "media.recovered" }
  | { name: "watching.watch"; share: LiveShare }
  | { name: "watching.unwatch"; share: LiveShare }
  | { name: "watching.quality"; share: LiveShare; quality: QualityChoice }
  | { name: "shares.start"; kind: ShareKind; details: StartDetails | null }
  | { name: "shares.stop"; kind: ShareKind };

export type RequestName = CheckedRequest["name"];

/** The request named `name`, checked. */
export type Checked<Name extends RequestName> = Extract<CheckedRequest, { name: Name }>;

type Fields = Record<string, unknown>;

/** One check per request the instance understands. */
const CHECKS: { [Name in RequestName]: (request: Fields) => Checked<Name> | null } = {
  "usage.received": ({ bytes, relayed }) =>
    isByteCount(bytes) && typeof relayed === "boolean" ? { name: "usage.received", bytes, relayed } : null,
  "media.connect": ({ connection }) => (isMediaPurpose(connection) ? { name: "media.connect", connection } : null),
  "media.replace": () => ({ name: "media.replace" }),
  "media.answer": ({ answer }) => (isSdp(answer) ? { name: "media.answer", answer } : null),
  "media.restart": ({ offer, mid }) => (isSdp(offer) && isMid(mid) ? { name: "media.restart", offer, mid } : null),
  "media.reconnect": () => ({ name: "media.reconnect" }),
  "media.faltering": () => ({ name: "media.faltering" }),
  "media.recovered": () => ({ name: "media.recovered" }),
  "watching.watch": ({ share }) => {
    const checked = asLiveShare(share);
    return checked && { name: "watching.watch", share: checked };
  },
  "watching.unwatch": ({ share }) => {
    const checked = asLiveShare(share);
    return checked && { name: "watching.unwatch", share: checked };
  },
  "watching.quality": ({ share, quality }) => {
    const checked = asLiveShare(share);
    return checked && isQualityChoice(quality) ? { name: "watching.quality", share: checked, quality } : null;
  },
  "shares.start": ({ kind, offer, video, audio, browser, twoQualities, handOver }) => {
    if (!isShareKind(kind)) return null;
    // A screen share's audio is left out when the browser's picker gave no sound.
    const mids = !isMid(video) ? null : audio === undefined ? { video } : isMid(audio) ? { video, audio } : null;
    const family: BrowserFamily | null = browser === "chromium" || browser === "firefox" ? browser : null;
    const details =
      isSdp(offer) && mids
        ? { offer, mids, browser: family, twoQualities: twoQualities === true, handOver: handOver === true }
        : null;
    return { name: "shares.start", kind, details };
  },
  "shares.stop": ({ kind }) => (isShareKind(kind) ? { name: "shares.stop", kind } : null),
};

/** The request `message` holds, checked; null when the instance does not understand it. */
export function checkRequest(message: unknown): CheckedRequest | null {
  const name = requestNameOf(message);
  if (name === null || !Object.hasOwn(CHECKS, name)) return null;
  return CHECKS[name as RequestName]((message as { request: Fields }).request);
}

/** The name `message` gives its request, `<area>.<type>`, whether the instance knows it or not; null when it gives none. */
export function requestNameOf(message: unknown): string | null {
  if (typeof message !== "object" || message === null) return null;
  const { type: area, request } = message as { type?: unknown; request?: unknown };
  if (typeof area !== "string" || typeof request !== "object" || request === null) return null;
  const { type } = request as { type?: unknown };
  return typeof type === "string" ? `${area}.${type}` : null;
}

/**
 * The longest SDP the instance passes on. A tab's media connection keeps the media
 * sections of every pull it has made, so its answers and restart offers grow some 2,340
 * bytes a share it watches: at 64 KiB a tab hit the limit after 28 shares (ticket 56); at
 * this, after some 390. It is graeae's own bound, on a tab gone wrong: neither the media
 * server nor a Durable Object's socket, which takes 32 MiB in a message, holds an SDP to
 * less.
 */
const SDP_MAX = 900 * 1024;

function isSdp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= SDP_MAX;
}

/** A running total of bytes as a tab reports it: a whole number, not negative, and within what a number holds exactly. */
function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A transceiver's mid: a short token the browser picks. */
function isMid(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,32}$/.test(value);
}

/** A share as a tab names it, by its sharer's member id and its kind. */
function asLiveShare(value: unknown): LiveShare | null {
  if (typeof value !== "object" || value === null) return null;
  const { member, kind } = value as { member?: unknown; kind?: unknown };
  if (typeof member !== "string" || member.length === 0 || member.length > 64) return null;
  if (!isShareKind(kind)) return null;
  return { member, kind };
}
