// A steady tick that keeps going in a hidden tab. Chromium throttles the timers of a tab
// hidden for five minutes to one wake-up a minute, but not a dedicated worker's, so the
// tick comes from one. Without workers it falls back to an ordinary timer.

/** Calls `tick` every `ms` milliseconds until the returned function is called. */
export function every(ms: number, tick: () => void): () => void {
  try {
    const worker = new Worker(new URL("./ticker.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", () => tick());
    worker.postMessage(ms);
    return () => worker.terminate();
  } catch {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  }
}
