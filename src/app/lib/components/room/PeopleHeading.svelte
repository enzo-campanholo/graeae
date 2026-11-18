<script lang="ts">
  let { label, count }: { label: string; count: number } = $props();
</script>

<h2 class="text-muted-foreground flex h-control-sm items-center justify-between px-2 text-xs font-normal">
  <span>{label}</span>
  <span class="text-dim tabular-nums">{count}</span>
</h2>
