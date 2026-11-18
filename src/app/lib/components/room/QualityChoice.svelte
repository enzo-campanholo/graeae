<script lang="ts">
  // The quality a viewer watches a two-quality share at: "Auto", "1080p" or "720p", as
  // a small segmented control in the watched share's pill of controls. One stop in the
  // tab order; the arrow keys move the choice, as in any group of radio buttons.
  import type { QualityChoice } from "../../../../shared/socket/index.ts";

  let {
    share,
    value,
    onchoose,
  }: {
    /** Whose share and what kind, as "Kai's screen". */
    share: string;
    value: QualityChoice;
    onchoose: (quality: QualityChoice) => void;
  } = $props();

  const options: { value: QualityChoice; label: string }[] = [
    { value: "auto", label: "Auto" },
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
  ];

  let group = $state<HTMLDivElement | null>(null);

  const keys: Record<string, (at: number) => number> = {
    ArrowRight: (at) => (at + 1) % options.length,
    ArrowDown: (at) => (at + 1) % options.length,
    ArrowLeft: (at) => (at - 1 + options.length) % options.length,
    ArrowUp: (at) => (at - 1 + options.length) % options.length,
    Home: () => 0,
    End: () => options.length - 1,
  };

  function onkeydown(event: KeyboardEvent) {
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    const at = move(options.findIndex((option) => option.value === value));
    onchoose(options[at]!.value);
    group?.querySelectorAll<HTMLButtonElement>("[role=radio]")[at]?.focus();
  }
</script>

<div bind:this={group} class="flex gap-0.5" role="radiogroup" aria-label="Quality of {share}" tabindex="-1" {onkeydown}>
  {#each options as option (option.value)}
    {@const checked = option.value === value}
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabindex={checked ? 0 : -1}
      class={[
        "h-control-sm rounded-sm px-2 text-xs font-medium tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-raised-2 text-fg" : "text-muted-foreground hover:text-fg",
      ]}
      onclick={() => onchoose(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
