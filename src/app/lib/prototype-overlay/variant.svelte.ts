// PROTOTYPE (prototype/overlay), throwaway: three ways for the owner page and "You" to
// open over the room instead of in a new tab, switchable with `?variant=A|B|C` and the
// floating bar at the bottom. Never merged: the winner is rebuilt properly from its ticket.

import { getContext, setContext } from "svelte";

export const VARIANTS = [
  { key: "A", name: "Sheet over the stage" },
  { key: "B", name: "Centred panel, room dimmed" },
  { key: "C", name: "Side panel, stage makes room" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

const KEY = "graeae:prototype-overlay";
const isKey = (value: unknown): value is VariantKey => VARIANTS.some((variant) => variant.key === value);

function initial(): VariantKey {
  const fromAddress = new URLSearchParams(window.location.search).get("variant");
  if (isKey(fromAddress)) {
    // Kept for the tab, since the overlay's own address leaves `?variant` out.
    try {
      sessionStorage.setItem(KEY, fromAddress);
    } catch {
      // No storage: this page only.
    }
    return fromAddress;
  }
  try {
    const stored = sessionStorage.getItem(KEY);
    if (isKey(stored)) return stored;
  } catch {
    // No storage: the default.
  }
  return "A";
}

class Variant {
  current = $state<VariantKey>(initial());
  /** Whether an overlay is open, for the room underneath (its keys, and variant C's room). */
  open = $state<"you" | "owner" | null>(null);
}

export const variant = new Variant();

export function setVariant(key: VariantKey) {
  variant.current = key;
  try {
    sessionStorage.setItem(KEY, key);
  } catch {
    // Kept for this page only.
  }
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once, not state
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  history.replaceState(history.state, "", url);
}

/** The side panel's width in variant C, which the room's stage makes room for. */
export const SIDE_WIDTH = { owner: 720, you: 480 } as const;

const FRAME = Symbol("prototype overlay frame");

export interface Frame {
  variant: () => VariantKey;
  close: () => void;
}

export function provideFrame(frame: Frame) {
  setContext(FRAME, frame);
}

/** The overlay this page is drawn in, or null when it is a page of its own. */
export function getFrame(): Frame | null {
  return getContext<Frame | undefined>(FRAME) ?? null;
}
