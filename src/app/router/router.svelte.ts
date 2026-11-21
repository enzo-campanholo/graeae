import type { Component } from "svelte";
import { sample } from "$sample";
import { REFUSED_MARK } from "../../shared/api.ts";

export type Params = Record<string, string>;

/** A page and the address it answers, e.g. `/r/:room`. A page that needs no part of its address takes no props. */
export interface Route {
  path: string;
  component: Component<{ params: Params }> | Component<Record<string, never>>;
  /**
   * Which view of the page an address is. A move to another view swaps the page in whole
   * (see `$lib/swap.svelte.ts`); a move within one gives the same page its new params.
   * Each address is its own view unless this says otherwise.
   */
  view?: (params: Params) => string;
  /**
   * The page shows even where the instance refused its address. Only the setup page: its
   * secret is never in the address, so the instance refuses it to everyone, and the page
   * learns whether it holds the right secret by sending it.
   */
  whenRefused?: boolean;
}

export interface Match {
  route: Route;
  params: Params;
}

// The address this page was loaded at, when the instance refused it (ticket 45). The page
// shows "nothing here" there from its first frame, rather than drawing what belongs at the
// address and then asking the instance, which only says what the load already did. A move
// to another address, the setup page's into the room, is the instance's to answer again.
// A sample under `pnpm dev` draws its page for a browser the instance does not know.
const refusedAt =
  document.documentElement.hasAttribute(REFUSED_MARK) && !sample ? window.location.pathname : null;

/**
 * The first route whose pattern matches `pathname`, with its `:named` segments filled in.
 * At an address the instance refused, only a route shown `whenRefused` matches.
 */
export function match(routes: readonly Route[], pathname: string): Match | null {
  const parts = segments(pathname);
  for (const route of routes) {
    if (pathname === refusedAt && !route.whenRefused) continue;
    const pattern = segments(route.path);
    if (pattern.length !== parts.length) continue;
    const params: Params = {};
    const matched = pattern.every((expected, i) => {
      const part = parts[i] as string;
      if (expected.startsWith(":")) {
        // A malformed escape such as `%E0` matches nothing, so it shows "nothing here".
        const value = decode(part);
        if (value === null) return false;
        params[expected.slice(1)] = value;
        return true;
      }
      return expected === part;
    });
    if (matched) return { route, params };
  }
  return null;
}

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

// PROTOTYPE (prototype/overlay): "You" and the owner page open over the page they were
// opened from, which stays mounted underneath, so a room keeps its shares and watching.
// Each overlay address carries, in its history entry, the address under it and how many
// entries deep into the overlay it is, so a reload keeps both and Close goes back past
// every section moved through. Opened fresh (a link, a bookmark), it goes over the list
// of rooms.
export const isOverlay = (pathname: string) =>
  pathname === "/you" || pathname === "/owner" || pathname.startsWith("/owner/");

interface OverlayState {
  under: string;
  depth: number;
}

function stateOf(value: unknown): OverlayState | null {
  const state = value as Partial<OverlayState> | null;
  return state && typeof state.under === "string" && typeof state.depth === "number"
    ? { under: state.under, depth: state.depth }
    : null;
}

class Location {
  pathname = $state(window.location.pathname);
  /** The address under the overlay (with its search), while one is open. */
  under = $state<string | null>(null);
  /** How many history entries the overlay has added. 0 when it was opened fresh. */
  depth = $state(0);
}

export const location = new Location();

function readState() {
  const overlay = isOverlay(window.location.pathname);
  const state = overlay ? stateOf(history.state) : null;
  location.pathname = window.location.pathname;
  location.under = overlay ? (state?.under ?? "/") : null;
  location.depth = state?.depth ?? 0;
}
readState();

/** Moves to another page of the app without reloading it. `replace` leaves no history entry. */
export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once, not state
  const target = new URL(to, window.location.origin).pathname;
  let state: OverlayState | null = null;
  if (isOverlay(target)) {
    const from = isOverlay(location.pathname)
      ? { under: location.under ?? "/", depth: location.depth }
      : { under: window.location.pathname + window.location.search, depth: 0 };
    state = { under: from.under, depth: replace ? from.depth : from.depth + 1 };
  }
  if (replace) history.replaceState(state, "", to);
  else history.pushState(state, "", to);
  readState();
}

/** Closes the overlay: back past every entry it added, or onto what is under it when opened fresh. */
export function closeOverlay() {
  if (!isOverlay(location.pathname)) return;
  if (location.depth > 0) history.go(-location.depth);
  else navigate(location.under ?? "/", { replace: true });
}

window.addEventListener("popstate", readState);

// Same-origin links move within the app instead of loading the page again.
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest("a");
  if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

/** PROTOTYPE: puts another page under the open overlay, as the list of rooms does for a member with one room. */
export function setUnder(to: string) {
  location.under = to;
  history.replaceState({ under: to, depth: location.depth } satisfies OverlayState, "", window.location.href);
}
