<script lang="ts">
  // The one place the app shows that it is loading. The full loading animation (a hand
  // passing the eye to the next) is being made by a friend of the owner and goes here
  // when it exists; until then the mark passes its lit dot along.
  import Mark from "./Mark.svelte";
</script>

<div class="grid place-items-center" role="status" aria-label="Loading">
  <Mark size="lg" loading />
</div>
