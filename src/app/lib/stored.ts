// Per-device preferences kept in localStorage. Storage can be blocked; then a
// preference holds for the visit and the default comes back next time.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept for this visit only.
  }
}
