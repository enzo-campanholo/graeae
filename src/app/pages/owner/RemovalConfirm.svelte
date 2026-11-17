<script lang="ts">
  // The removal confirm: every removal, from one room or from the instance, asks here
  // first. It states the consequences and has Cancel and Remove, with no countdown and no
  // undo. Cancel holds the focus when it opens, so Enter alone never removes anyone.
  import { AlertDialog } from "bits-ui";
  import { Button } from "$lib/components/ui/button/index.js";

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

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="bg-letterbox/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50" />
    <AlertDialog.Content
      class="bg-raised data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985] fixed top-1/2 left-1/2 z-50 grid w-[min(400px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl p-5 shadow-[0_4px_16px_-4px_rgb(0_0_0/0.4)] outline-none motion-reduce:animate-none"
    >
      <div class="grid gap-2">
        <AlertDialog.Title class="text-fg text-[15px] leading-[22px] font-medium text-balance">{title}</AlertDialog.Title>
        <AlertDialog.Description class="text-soft grid gap-1.5">
          {#each lines as line (line)}<span class="block">{line}</span>{/each}
        </AlertDialog.Description>
      </div>
      <div class="flex justify-end gap-1.5">
        <AlertDialog.Cancel>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" disabled={removing}>Cancel</Button>
          {/snippet}
        </AlertDialog.Cancel>
        <Button
          variant="destructive"
          class="bg-stop/14 text-stop hover:bg-stop/22 min-w-20"
          disabled={removing}
          onclick={onconfirm}
        >
          Remove
        </Button>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
