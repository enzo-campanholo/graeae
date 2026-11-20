<script lang="ts">
  // `/setup#<secret>`: the page that makes this browser the owner's device. The secret
  // after the `#` never leaves the browser in an address; the page takes it out of the
  // address bar and history at once and sends it to the instance itself.
  import type { SetupAnswer } from "../../shared/api.ts";
  import Loading from "$lib/components/Loading.svelte";
  import Mark from "$lib/components/Mark.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import { postJson } from "$lib/api.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { navigate } from "../router/router.svelte.ts";
  import NothingHere from "./NothingHere.svelte";

  type State = { state: "working" } | { state: "refused" } | { state: "missing"; answer: SetupAnswer };

  let current = $state<State>({ state: "working" });
  // While it works there is nothing to see: the move goes on into the room.
  holdUntil(() => current.state !== "working");

  const secret = readSecret();
  history.replaceState(null, "", window.location.pathname);

  if (secret === "") {
    current = { state: "refused" };
  } else {
    postJson<SetupAnswer>("/api/setup", { secret })
      .then((answer) => {
        if (answer === null) current = { state: "refused" };
        else if (answer.missing.length > 0) current = { state: "missing", answer };
        else navigate(answer.to, { replace: true });
      })
      .catch(() => (current = { state: "refused" }));
  }

  function readSecret(): string {
    try {
      return decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return "";
    }
  }
</script>

{#if current.state === "missing"}
  <PageTitle title="Missing secrets · graeae" />
{:else if current.state === "working"}
  <PageTitle title="graeae" />
{/if}

{#if current.state === "refused"}
  <NothingHere />
{:else if current.state === "missing"}
  {@const { answer } = current}
  {@const one = answer.missing.length === 1}
  <main class="grid min-h-dvh place-items-center p-6">
    <div class="grid max-w-[380px] justify-items-center gap-6 text-center">
      <Mark size="lg" />
      <div class="grid justify-items-center gap-1.5">
        <h1 class="text-base font-medium text-balance">This browser is yours, but secrets are missing</h1>
        <p class="text-muted-foreground text-balance">
          Sharing and watching need {one ? "this secret" : "these secrets"}. Add {one ? "it" : "them"} to
          <span class="text-soft">.secrets</span> and deploy again.
        </p>
      </div>
      <ul class="grid justify-items-center gap-1" aria-label="Missing secrets">
        {#each answer.missing as name (name)}
          <li class="bg-raised text-fg rounded-md px-2.5 py-1 text-xs font-medium">{name}</li>
        {/each}
      </ul>
      <Button class="min-w-40" onclick={() => navigate(answer.to, { replace: true })}>
        {answer.to === "/" ? "Go to the rooms" : "Go to the room"}
      </Button>
    </div>
  </main>
{:else}
  <main class="grid min-h-dvh place-items-center p-6">
    <Loading />
  </main>
{/if}
