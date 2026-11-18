<script lang="ts">
  // The owner page's confirm: a modal with a title, what the action means, and Cancel
  // beside the action's own button, with no countdown and no undo. Cancel holds the focus
  // when it opens, so Enter alone never confirms.
  import type { Snippet } from "svelte";
  import { AlertDialog } from "bits-ui";
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    open = $bindable(false),
    title,
    action,
    destructive = false,
    busy = false,
    onconfirm,
    children,
  }: {
    open?: boolean;
    title: string;
    /** The action's button. */
    action: string;
    /** The action takes something away: its button is red. */
    destructive?: boolean;
    /** The action is under way: its button waits, and the modal stays until it is done. */
    busy?: boolean;
    onconfirm: () => void;
    /** What the action means, as the modal's description. */
    children: Snippet;
  } = $props();
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="bg-letterbox/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50" />
    <AlertDialog.Content
      class="bg-raised data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985] fixed top-1/2 left-1/2 z-50 grid w-[min(400px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl p-5 shadow-lift outline-none motion-reduce:animate-none"
    >
      <div class="grid gap-2">
        <AlertDialog.Title class="text-fg text-base font-medium text-balance">{title}</AlertDialog.Title>
        <AlertDialog.Description class="text-soft grid gap-1.5">
          {@render children()}
        </AlertDialog.Description>
      </div>
      <div class="flex justify-end gap-1.5">
        <AlertDialog.Cancel>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" disabled={busy}>Cancel</Button>
          {/snippet}
        </AlertDialog.Cancel>
        {#if destructive}
          <Button
            variant="destructive"
            class="bg-stop/14 text-stop hover:bg-stop/22 min-w-20"
            disabled={busy}
            onclick={onconfirm}
          >
            {action}
          </Button>
        {:else}
          <Button class="min-w-20" disabled={busy} onclick={onconfirm}>{action}</Button>
        {/if}
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
