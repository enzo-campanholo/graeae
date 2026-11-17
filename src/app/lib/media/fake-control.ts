// What a Seam 2 journey reads and steers of the fake media client, on
// `window.graeaeFakeMedia`. Types only, so the journeys can import them too.

import type { BrowserFamily, ScreenCaptureRequest } from "./capture.ts";

/**
 * What the browser's picker returns: the surface picked, and whether its audio checkbox
 * gave any sound. "cancel" is the member closing the picker without picking.
 */
export type FakePick = { surface: "tab" | "window" | "screen"; audio: boolean } | "cancel";

export interface FakeMediaControl {
  /** The browser family the page believes it runs in. Set it before the page loads. */
  browser: BrowserFamily;
  /** What the picker returns next. A tab with its sound, unless a journey says otherwise. */
  picker: FakePick;
  /** Every request made of the picker, oldest first. */
  asked: ScreenCaptureRequest[];
  /** Whether the live screen share's audio is on; null when no screen share sends any. */
  screenAudio: boolean | null;
  /** The browser ends the screen capture by itself: its "stop sharing" bar, or the shared tab closing. */
  endScreen(): void;
}
