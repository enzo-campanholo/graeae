<script lang="ts">
  // The one page for every address a visitor is not let into. It says the same thing
  // whatever the reason, so it reveals nothing.
  import Mark from "$lib/components/Mark.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
</script>

<PageTitle title="Nothing here · graeae" />

<main class="grid min-h-dvh place-items-center p-6">
  <div class="grid justify-items-center gap-5 text-center">
    <Mark size="lg" />
    <div class="grid justify-items-center gap-1.5">
      <h1 class="text-base font-medium">Nothing here</h1>
      <p class="text-muted-foreground max-w-[300px] text-balance">If someone sent you a link, ask them for a fresh one.</p>
    </div>
  </div>
</main>
