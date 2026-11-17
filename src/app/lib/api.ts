// The page's requests to its instance. The instance answers anything it refuses with
// "nothing here", so a page only learns that it was refused, never why.

/** What the instance answers, or null when it refused. */
export async function getJson<T>(path: string): Promise<T | null> {
  return answer<T>(await fetch(path, { headers: { Accept: "application/json" } }));
}

/** Sends `body` as JSON. What the instance answers, or null when it refused. */
export async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return answer<T>(response);
}

async function answer<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
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

/** Sends `body` as JSON to change something. What the instance answers, or null when it refused. */
export async function patchJson<T>(path: string, body: unknown): Promise<T | null> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return answer<T>(response);
}
