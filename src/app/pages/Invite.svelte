<script lang="ts">
  // The invite page: one button. Opening it uses nothing up; only the press does.
  import { sample } from "$sample";
  import Mark from "$lib/components/Mark.svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  const invite = sample?.invite ?? null;
</script>

<svelte:head>
  <title>graeae</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center p-6">
  <div class="grid justify-items-center gap-6 text-center">
    <Mark size="lg" />
    <div class="grid justify-items-center gap-3">
      <Button size="lg" class="min-w-48">{invite ? `Join as ${invite.name}` : "Join"}</Button>
      <p class="text-muted-foreground max-w-72 text-xs">This browser will be remembered as yours.</p>
    </div>
  </div>
</main>
