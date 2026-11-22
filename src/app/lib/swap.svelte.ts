// A page appears whole (ticket 33). A move does not show the next page frame first and
// contents later: the page on screen stays until the next one has what it waits for, then
// the two swap in one frame. `Swap.svelte` does the swapping, for the router's pages and
// the owner page's sections; a page says what it waits for with `holdUntil`.
//
// A wait that outlasts the hold-back (`hold-back.ts`) shows the next page anyway, with its
// loading states fading in, so a slow answer is never a page that does not respond.

import { getContext, setContext, tick } from "svelte";

const GATE = Symbol("swap gate");

/** What a view on its way waits for: the holds its components took while they mounted. */
export class Gate {
  #holds = 0;
  #mounted = false;
  #open = false;
  readonly #onopen: () => void;

  constructor(onopen: () => void) {
    this.#onopen = onopen;
  }

  /** Takes a hold. The returned function lets it go, once. */
  hold(): () => void {
    this.#holds++;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.#holds--;
      this.#check();
    };
  }

  /** The view has mounted, so every hold its components take at mount is in. */
  mounted() {
    this.#mounted = true;
    this.#check();
  }

  #check() {
    if (!this.#mounted || this.#open) return;
    // After the DOM settles: what a released hold lets in, such as the owner page's
    // sections once it knows the owner, may take holds of its own.
    void tick().then(() => {
      if (this.#holds > 0 || this.#open) return;
      this.#open = true;
      this.#onopen();
    });
  }
}

interface ViewContext {
  gate: Gate;
  shown: () => boolean;
}

/** For `SwapLayer.svelte`: its view's gate, and whether the view is on screen. */
export function provideView(gate: Gate, shown: () => boolean) {
  setContext<ViewContext>(GATE, { gate, shown });
}

/** Takes a hold on the view this component is part of, for a `Swap` of its own. A no-op outside any. */
export function holdView(): () => void {
  return getContext<ViewContext | undefined>(GATE)?.gate.hold() ?? (() => {});
}

/**
 * Whether the view this component is part of is on screen, not on its way, and not under
 * an overlay. A view on its way is out of sight but mounted, and one under an overlay is
 * out of reach, so what reaches past it, such as the tab's title or keys pressed anywhere,
 * waits for this. Always true outside any `Swap`.
 */
export function viewShown(): () => boolean {
  return getContext<ViewContext | undefined>(GATE)?.shown ?? (() => true);
}

/**
 * Keeps the view this component is part of from appearing until `ready()` is true. Call it
 * while the component mounts. A view already on screen is not held back again.
 */
export function holdUntil(ready: () => boolean) {
  const release = holdView();
  $effect(() => {
    if (ready()) release();
  });
  // A component that goes before it is ready does not hold its view forever.
  $effect(() => release);
}
