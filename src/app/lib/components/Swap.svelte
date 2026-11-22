<script lang="ts" generics="K, V">
  // Shows one view at a time, keyed by `key`, and moves to the next whole (see
  // `$lib/swap.svelte.ts`). A new key mounts its view out of sight while the current one
  // stays; the new one swaps in once nothing in it holds it back, or once the move's
  // hold-back is over. The same key keeps its view, which gets the new `value`. While
  // `covered`, an overlay is drawn over the view on screen: it stays in sight, out of reach.
  import { untrack, type Snippet } from "svelte";
  import { msLeftInHold } from "../hold-back.js";
  import { Gate, holdView } from "../swap.svelte.js";
  import SwapLayer from "./SwapLayer.svelte";

  let {
    key,
    value,
    children,
    onshow,
    covered = false,
  }: {
    key: K;
    value: V;
    children: Snippet<[V]>;
    /** Called with each key as its view swaps in. */
    onshow?: (key: K) => void;
    /** An overlay is open over the view on screen. */
    covered?: boolean;
  } = $props();

  class View {
    readonly id: number;
    readonly key: K;
    value = $state() as V;
    shown = $state(false);
    readonly gate: Gate;
    timer: ReturnType<typeof setTimeout> | undefined;

    constructor(id: number, key: K, value: V) {
      this.id = id;
      this.key = key;
      this.value = value;
      this.gate = new Gate(() => show(this));
    }
  }

  let views = $state<View[]>([]);
  let made = 0;

  // A Swap inside a view on its way holds that view until its own first view is in.
  const releaseOuter = holdView();

  function show(view: View) {
    if (!views.includes(view) || view.shown) return;
    clearTimeout(view.timer);
    view.shown = true;
    views = [view];
    releaseOuter();
    onshow?.(view.key);
  }

  function arrive(key: K, value: V) {
    const current = views.find((view) => view.shown);
    const coming = views.find((view) => !view.shown);
    if (coming && coming.key !== key) {
      clearTimeout(coming.timer);
      views = views.filter((view) => view !== coming);
    }
    if (current?.key === key) {
      current.value = value;
      return;
    }
    if (coming?.key === key) {
      coming.value = value;
      return;
    }
    const view = new View(++made, key, value);
    view.timer = setTimeout(() => show(view), msLeftInHold());
    views = [...views, view];
  }

  $effect.pre(() => {
    const [k, v] = [key, value];
    untrack(() => arrive(k, v));
  });

  $effect(() => () => {
    for (const view of views) clearTimeout(view.timer);
  });
</script>

{#each views as view (view.id)}
  <SwapLayer gate={view.gate} shown={view.shown} {covered}>{@render children(view.value)}</SwapLayer>
{/each}
