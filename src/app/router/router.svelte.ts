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
  /**
   * The page draws over the page it was opened from, which stays as it was under it: its
   * name for the overlay's dialog, and how wide it opens. See `Overlay.svelte`.
   */
  overlay?: { name: string; size: "wide" | "column" };
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

// An overlay's address keeps, in its history entry, the address of the page under it and
// how many steps the overlay has taken since it opened: one for the move that opened it,
// and one more for each move within it. A reload keeps the entry, and so both. An overlay
// opened fresh (a link from outside, a typed address, an entry from an older build) has
// taken no steps, and has `/` under it.
interface Overlaid {
  under: string;
  steps: number;
}

let table: readonly Route[] = [];

/** Whether the page at `pathname` draws over another. */
function isOverlay(pathname: string): boolean {
  return !!match(table, pathname)?.route.overlay;
}

function overlaidIn(state: unknown): Overlaid {
  const value = state as Partial<Overlaid> | null;
  if (!value || typeof value.under !== "string" || typeof value.steps !== "number") return { under: "/", steps: 0 };
  const under = new URL(value.under, window.location.origin);
  if (under.origin !== window.location.origin || isOverlay(under.pathname)) return { under: "/", steps: 0 };
  return { under: value.under, steps: Math.max(0, Math.floor(value.steps)) };
}

class Location {
  pathname = $state(window.location.pathname);
  /** The address of the page under the overlay at `pathname`, search included; null when that is a page of its own. */
  under = $state<string | null>(null);
  /** The history entries the overlay has added since it opened. */
  steps = $state(0);
}

export const location = new Location();

// A close on its way back through history, until it lands. A second press before then
// (a double click, a held Escape) would go back as far again, past the page under.
let closing = false;

function read() {
  location.pathname = window.location.pathname;
  const overlaid = isOverlay(location.pathname) ? overlaidIn(history.state) : null;
  location.under = overlaid?.under ?? null;
  location.steps = overlaid?.steps ?? 0;
  if (!closing) return;
  closing = false;
  // Back at an overlay opened fresh, the first entry it had: it gives way to the page under it.
  if (location.under !== null) navigate(location.under, { replace: true });
}

/** For `Router.svelte`, as it starts: the app's routes, which say which pages are overlays. */
export function useRoutes(routes: readonly Route[]) {
  table = routes;
  read();
}

/**
 * Moves to another page of the app without reloading it. `replace` leaves no history entry.
 * A move to an overlay keeps the page under it: the page it is opened from, or the one
 * under the overlay it moves within.
 */
export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  let state: Overlaid | null = null;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once, never kept
  if (isOverlay(new URL(to, window.location.origin).pathname)) {
    const from: Overlaid =
      location.under !== null
        ? { under: location.under, steps: location.steps }
        : { under: window.location.pathname + window.location.search, steps: 0 };
    state = { under: from.under, steps: replace ? from.steps : from.steps + 1 };
  }
  if (replace) history.replaceState(state, "", to);
  else history.pushState(state, "", to);
  read();
}

/**
 * Closes the overlay: back past every step it took, at once, so Forward opens it again and
 * Back never does. One opened fresh has no entry of the page under it to go back to: back
 * past its moves, it gives way to that page in place.
 */
export function closeOverlay() {
  if (location.under === null || closing) return;
  if (location.steps > 0) {
    closing = true;
    history.go(-location.steps);
  } else navigate(location.under, { replace: true });
}

/**
 * Moves the page at `/` on to `to`, as the list of rooms does for a member with one room:
 * in its place, or, while an overlay is open over it, under the overlay, whose address stays.
 */
export function redirect(to: string) {
  if (location.under === null) {
    navigate(to, { replace: true });
    return;
  }
  location.under = to;
  history.replaceState({ under: to, steps: location.steps } satisfies Overlaid, "", window.location.href);
}

window.addEventListener("popstate", read);

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
