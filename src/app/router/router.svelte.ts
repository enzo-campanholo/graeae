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

class Location {
  pathname = $state(window.location.pathname);
}

export const location = new Location();

/** Moves to another page of the app without reloading it. `replace` leaves no history entry. */
export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  location.pathname = window.location.pathname;
}

window.addEventListener("popstate", () => {
  location.pathname = window.location.pathname;
});

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
