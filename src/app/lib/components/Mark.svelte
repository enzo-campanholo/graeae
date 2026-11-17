<script lang="ts">
  // The three sisters' mark: three grey dots, the middle one lit with the eye. As the
  // small loader the lit dot is passed along from sister to sister.
  import { cn } from "$lib/utils.js";

  let {
    size = "md",
    loading = false,
    class: className,
  }: { size?: "sm" | "md" | "lg"; loading?: boolean; class?: string } = $props();
</script>

<span class={cn("mark", size, loading && "loading", className)} aria-hidden="true">
  <i></i><i></i><i></i>
</span>

<style>
  .mark {
    display: inline-flex;
    align-items: center;
    flex: none;
    --dot: 6px;
    gap: 4px;
  }
  .sm {
    --dot: 4px;
    gap: 3px;
  }
  .lg {
    --dot: 12px;
    gap: 10px;
  }
  i {
    width: var(--dot);
    height: var(--dot);
    border-radius: 50%;
    background: var(--mark-dot);
  }
  i:nth-child(2) {
    background: var(--eye);
  }
  .loading i {
    animation: pass 1.2s var(--ease-out) infinite;
  }
  .loading i:nth-child(1) {
    animation-delay: -0.8s;
  }
  .loading i:nth-child(2) {
    animation-delay: -0.4s;
  }
  .loading i:nth-child(3) {
    animation-delay: 0s;
  }
  /* Each dot holds the eye for a third of the loop, then hands it on. */
  @keyframes pass {
    0%,
    100% {
      background: var(--mark-dot);
    }
    8%,
    30% {
      background: var(--eye);
    }
    42% {
      background: var(--mark-dot);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading i {
      animation: none;
    }
  }
</style>
