<script lang="ts" module>
  import { getContext, setContext } from "svelte";

  const CLOSE = Symbol("overlay close");

  /** For a page drawn in an overlay: the way to close it, for its close button. */
  export function overlayClose(): () => void {
    return getContext<(() => void) | undefined>(CLOSE) ?? (() => {});
  }
</script>

<script lang="ts">
  // The frame the owner page and "You" open in: a panel centred over the page they were
  // opened from, which stays as it was under it, dimmed, and out of reach while it is open
  // (`Swap`'s `covered`). In a room, shares, watching and sound carry on.
  //
  // It stays out of sight until the page in it is on screen (its `Swap` calls `onshow`),
  // as a move keeps the last page until the next is whole; then the dim fades in and the
  // panel scales in. It closes on Escape (a confirm or a menu open in it closes first), on
  // a click on the dimmed page, and on the page's own close button; Back closes it as any
  // move does.
  import type { Snippet } from "svelte";

  let {
    name,
    size,
    onclose,
    children,
  }: {
    /** The dialog's name. */
    name: string;
    /** "wide" holds the owner page; "column" holds "You", as tall as what it holds. */
    size: "wide" | "column";
    onclose: () => void;
    /** The page in it, given what to call once it is on screen. */
    children: Snippet<[onshow: () => void]>;
  } = $props();

  let shown = $state(false);

  setContext(CLOSE, () => onclose());

  // What had the focus when it opened, which gets it back as it closes. Opened from a
  // menu, that is the menu's button: the item goes with the menu.
  const opener = (() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return null;
    const menu = active.closest<HTMLElement>('[role="menu"]');
    return menu?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) : active;
  })();
  $effect(() => () => {
    // Once the page under it is in reach again, later in this same update.
    queueMicrotask(() => {
      if (opener?.isConnected && !document.querySelector("[role=dialog][aria-modal=true]")) {
        opener.focus({ preventScroll: true });
      }
    });
  });

  let panel = $state<HTMLElement>();

  // As it appears, focus moves in. The dim and the panel come in by their own animations,
  // which start with `shown`.
  $effect(() => {
    if (shown) panel?.focus({ preventScroll: true });
  });

  // Ahead of everything else, so a confirm or a menu open in it is still there to close
  // first, by its own handling.
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (document.querySelector('[role="alertdialog"], [role="menu"], [role="listbox"]')) return;
    event.preventDefault();
    onclose();
  }
  $effect(() => {
    window.addEventListener("keydown", onkeydown, { capture: true });
    return () => window.removeEventListener("keydown", onkeydown, { capture: true });
  });
</script>

<div class={["fixed inset-0 z-40 grid place-items-center p-8", !shown && "invisible"]}>
  <!-- The dimmed page: a click on it closes, as Escape does from the keyboard. -->
  <div class={["bg-letterbox/60 absolute inset-0", shown && "dim-in"]} aria-hidden="true" onclick={() => onclose()}></div>
  <div
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label={name}
    tabindex="-1"
    class={[
      "shadow-lift relative w-full rounded-xl outline-none",
      shown && "panel-in",
      size === "wide" ? "bg-ground max-w-owner-panel h-full max-h-owner-panel-h overflow-hidden" : "bg-stage max-w-you-panel max-h-full overflow-y-auto",
    ]}
  >
    {@render children(() => (shown = true))}
  </div>
</div>

<style>
  /* The dim fades in over 180ms and the panel scales in from 98.5% over 220ms, both at
     once under reduced motion. */
  .dim-in {
    animation: dim-in 180ms var(--ease-out);
  }
  .panel-in {
    animation: panel-in 220ms var(--ease-out);
  }
  @keyframes dim-in {
    from {
      opacity: 0;
    }
  }
  @keyframes panel-in {
    from {
      opacity: 0;
      scale: 0.985;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dim-in,
    .panel-in {
      animation: none;
    }
  }
</style>
