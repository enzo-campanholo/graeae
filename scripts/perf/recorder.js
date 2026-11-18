// Runs in the page before its own scripts (the probe passes it to `addInitScript`).
// Records, from then on, each time the loading mark or a skeleton placeholder starts or
// stops being painted, polling once a frame: a placeholder still faded out does not count.
/* global window, document, getComputedStyle, performance, requestAnimationFrame */

window.__perf = [];
const state = { loading: false, skeleton: false };
const SELECTORS = {
  loading: '[role="status"][aria-label="Loading"]',
  skeleton: '[aria-hidden="true"].bg-raised, [aria-hidden="true"] .bg-raised',
};

function seen(element) {
  if (!element.checkVisibility({ visibilityProperty: true })) return false;
  for (let e = element; e; e = e.parentElement) if (Number(getComputedStyle(e).opacity) < 0.05) return false;
  return true;
}

function check() {
  for (const kind of ["loading", "skeleton"]) {
    const now = [...document.querySelectorAll(SELECTORS[kind])].some(seen);
    if (now !== state[kind]) {
      state[kind] = now;
      window.__perf.push({ kind, on: now, t: performance.now() });
    }
  }
  requestAnimationFrame(check);
}
requestAnimationFrame(check);
