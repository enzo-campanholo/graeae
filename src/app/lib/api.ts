// The page's requests to its instance. The instance answers anything it refuses with
// "nothing here", so a page only learns that it was refused, never why. Each refusal, and
// each request that got no answer at all, goes in the page's log.

import { tabLog } from "./log.ts";

/** What the instance answers, or null when it refused. */
export async function getJson<T>(path: string): Promise<T | null> {
  return answer<T>(path, await logged(path, "GET", fetch(path, { headers: { Accept: "application/json" } })));
}

/** Sends `body` as JSON. What the instance answers, or null when it refused. */
export async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  return send<T>("POST", path, body);
}

async function send<T>(method: string, path: string, body: unknown): Promise<T | null> {
  const response = await logged(
    path,
    method,
    fetch(path, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return answer<T>(path, response);
}

/** `request`, with its failure to get any answer logged. */
async function logged(path: string, method: string, request: Promise<Response>): Promise<Response> {
  try {
    return await request;
  } catch (error) {
    tabLog.warn("http.failed", { ...tabLog.where(new URL(path, window.location.href).pathname), method, error });
    throw error;
  }
}

async function answer<T>(path: string, response: Response): Promise<T | null> {
  if (!response.ok) {
    tabLog.warn("http.refused", { ...tabLog.where(new URL(path, window.location.href).pathname), status: response.status });
    return null;
  }
  return (await response.json()) as T;
}

/** What a page that loads its data from the instance is showing. */
export type Load<T> = { state: "loading" } | { state: "refused" } | { state: "loaded"; data: T };

/** Loads `path` into a `Load`, calling `set` once when the answer arrives. */
export function load<T>(path: string, set: (value: Load<T>) => void) {
  getJson<T>(path)
    .then((data) => set(data === null ? { state: "refused" } : { state: "loaded", data }))
    .catch(() => set({ state: "refused" }));
}

/** Sends `body` as JSON to set something. What the instance answers, or null when it refused. */
export async function putJson<T>(path: string, body: unknown): Promise<T | null> {
  return send<T>("PUT", path, body);
}

/** Sends `body` as JSON to change something. What the instance answers, or null when it refused. */
export async function patchJson<T>(path: string, body: unknown): Promise<T | null> {
  return send<T>("PATCH", path, body);
}
