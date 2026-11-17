<script lang="ts">
  // The removal confirm: every removal, from one room or from the instance, asks here
  // first. It states the consequences and has Cancel and Remove, with no countdown and no
  // undo. Cancel holds the focus when it opens, so Enter alone never removes anyone.
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let {
    open = $bindable(false),
    title,
    lines,
    removing = false,
    onconfirm,
  }: {
    open?: boolean;
    title: string;
    /** The consequences, one sentence each. */
    lines: string[];
    /** The removal is under way: Remove waits, and the modal stays until it is done. */
    removing?: boolean;
    onconfirm: () => void;
  } = $props();
</script>

<ConfirmDialog bind:open {title} action="Remove" destructive busy={removing} {onconfirm}>
  {#each lines as line (line)}<span class="block">{line}</span>{/each}
</ConfirmDialog>
