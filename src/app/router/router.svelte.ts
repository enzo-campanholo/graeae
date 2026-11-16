import type { Component } from "svelte";

export type Params = Record<string, string>;

/** A page and the address it answers, e.g. `/r/:room`. */
export interface Route {
  path: string;
  component: Component<{ params: Params }>;
}

export interface Match {
  route: Route;
  params: Params;
}

/** The first route whose pattern matches `pathname`, with its `:named` segments filled in. */
export function match(routes: readonly Route[], pathname: string): Match | null {
  const parts = segments(pathname);
  for (const route of routes) {
    const pattern = segments(route.path);
    if (pattern.length !== parts.length) continue;
    const params: Params = {};
    const matched = pattern.every((expected, i) => {
      const part = parts[i] as string;
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(part);
        return true;
      }
      return expected === part;
    });
    if (matched) return { route, params };
  }
  return null;
}

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

class Location {
  pathname = $state(window.location.pathname);
}

export const location = new Location();

/** Moves to another page of the app without reloading it. */
export function navigate(to: string) {
  history.pushState(null, "", to);
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
