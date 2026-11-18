// Loading states, the loading mark and the skeleton placeholders, stay out of sight until
// HOLD_MS into the person's move, then fade in. Most waits are shorter than that, so they
// show nothing at all instead of flashing a placeholder for a few frames (ticket 33). The
// same hold-back bounds how long a move keeps the last page on screen (`swap.svelte.ts`).
//
// A move starts when the app first runs, and again on each click, key press, or back and
// forward. A wait the move leads to counts from that start: the join button's answer, a
// redirect, or one page's loading handing over to the next's. Each of these continues the
// one move, so the hold-back never starts over partway through. A new tab's first move
// starts with the app, not with the tab: until the app runs, the tab is blank anyway.
//
// Every placeholder in a move shares one fade: one that arrives partway through it joins
// it where it is, so a page handing its loading mark to the next one shows no dip.

import type { Attachment } from "svelte/attachments";

/** How long into a move its loading states stay out of sight. */
export const HOLD_MS = 300;

let movedAt = performance.now();
const moved = () => (movedAt = performance.now());
for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, moved, { capture: true });
window.addEventListener("popstate", moved);

// Negative once the hold-back is over.
const left = () => HOLD_MS - (performance.now() - movedAt);

/** What is left of the current move's hold-back, in milliseconds. `Swap` shows a page on its way by then. */
export function msLeftInHold(): number {
  return Math.max(0, left());
}

/** On a loading state's element: keeps it out of sight for whatever is left of the hold-back, then fades it in. */
export const heldBack: Attachment<HTMLElement> = (element) => {
  element.classList.add("held-back");
  // Negative once the hold-back is over: the fade starts partway through.
  element.style.animationDelay = `${left()}ms`;
};
