<script lang="ts">
  // The owner page's Usage section: the month so far against the usage budget, projected
  // to its end at the same daily rate, and the day of the month usage resets on. The
  // figures are the owner page's, shared with the meter in its navigation.
  import Loading from "$lib/components/Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import { budgetCost, INCLUDED_GIGABYTES, type OwnerUsage } from "$lib/owner-usage.svelte.js";
  import { dollars, gigabytes } from "$lib/words.js";
  import { holdUntil } from "$lib/swap.svelte.js";
  import RaiseConfirm from "./RaiseConfirm.svelte";

  let { usage }: { usage: OwnerUsage } = $props();

  const current = $derived(usage.current);
  const figures = $derived(usage.figures);
  holdUntil(() => figures !== null);

  const fraction = (value: number) => (figures && figures.budget > 0 ? Math.min(value / figures.budget, 1) : 1);
  const usedShare = $derived(figures ? fraction(figures.used) : 0);
  const projectedShare = $derived(figures ? fraction(figures.projected) : 0);
  const level = $derived(usedShare >= 0.95 ? "stop" : usedShare >= 0.8 ? "warn" : "ok");
  const runsOut = $derived(!!figures && figures.projected > figures.budget);

  /** A day as the owner reads it, in UTC, with no day of the week: "15 December". */
  function day(ms: number): string {
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  }

  // The reset day, as typed until it is saved.
  let draft = $state<string | null>(null);
  let saving = $state(false);
  let problem = $state<string | null>(null);
  const shown = $derived(draft ?? String(current?.resetDay ?? ""));

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (draft === null || saving) return;
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      problem = "Pick a day from 1 to 31.";
      return;
    }
    saving = true;
    problem = null;
    const saved = await usage.setResetDay(value);
    saving = false;
    if (saved) draft = null;
    else problem = "Not saved. Try again.";
  }

  // The usage budget, in whole GB, as typed until it is saved. Raising it asks first, in
  // a confirm that names the most it can add to the bill; lowering it saves at once.
  const BUDGET_PROBLEM = "Pick a whole number of GB from 1.";
  let budgetDraft = $state<string | null>(null);
  let budgetSaving = $state(false);
  let budgetProblem = $state<string | null>(null);
  let confirming = $state(false);
  const budgetNow = $derived(figures ? Math.round(figures.budget) : 0);
  const budgetShown = $derived(budgetDraft ?? String(budgetNow || ""));
  const budgetTyped = $derived.by(() => {
    const value = Number(budgetShown);
    return budgetShown.trim() !== "" && Number.isSafeInteger(value) && value >= 1 ? value : null;
  });
  // Below what is used already, a new budget stops watching the moment it is saved.
  const stopsWatching = $derived(
    budgetDraft !== null && budgetTyped !== null && !!figures && budgetTyped <= figures.used && budgetTyped !== budgetNow,
  );

  function saveBudget(event: SubmitEvent) {
    event.preventDefault();
    if (budgetDraft === null || budgetSaving) return;
    if (budgetTyped === null) {
      budgetProblem = BUDGET_PROBLEM;
      return;
    }
    budgetProblem = null;
    if (budgetTyped > budgetNow) confirming = true;
    else void storeBudget(budgetTyped);
  }

  async function storeBudget(value: number) {
    budgetSaving = true;
    const saved = await usage.setBudget(value);
    budgetSaving = false;
    confirming = false;
    if (saved) budgetDraft = null;
    else budgetProblem = "Not saved. Try again.";
  }
</script>

{#if !current || !figures}
  <div class="grid h-40 place-items-center"><Loading /></div>
{:else}
  <div class="owner-columns">
    <section class="grid gap-4" aria-labelledby="usage-month">
      <h2 class="text-muted-foreground flex h-control-sm items-center justify-between text-xs font-normal">
        <span id="usage-month">This month</span>
        <span class="text-dim tabular-nums">Since {day(current.since)}</span>
      </h2>

      <dl class="grid grid-cols-3 gap-6">
        <div class="grid gap-1">
          <dt id="usage-used" class="text-muted-foreground text-xs">Used</dt>
          <dd aria-labelledby="usage-used" class="text-2xl font-medium tracking-[-0.01em] tabular-nums">
            {gigabytes(figures.used)}
          </dd>
        </div>
        <div class="grid gap-1">
          <dt id="usage-budget" class="text-muted-foreground text-xs">Usage budget</dt>
          <dd aria-labelledby="usage-budget" class="text-soft text-2xl font-medium tracking-[-0.01em] tabular-nums">
            {gigabytes(figures.budget)}
          </dd>
        </div>
        <div class="grid gap-1">
          <dt id="usage-projected" class="text-muted-foreground text-xs">Projected by the month's end</dt>
          <dd
            aria-labelledby="usage-projected"
            class={["text-2xl font-medium tracking-[-0.01em] tabular-nums", runsOut ? "text-warn" : "text-soft"]}
          >
            {gigabytes(figures.projected)}
          </dd>
        </div>
      </dl>

      <!-- The fill is the month so far; the faint stretch beyond it, where the month is heading. -->
      <div
        class="bg-raised-2 relative h-1 overflow-hidden rounded-full"
        role="meter"
        aria-label="Usage this month"
        aria-valuemin={0}
        aria-valuemax={figures.budget}
        aria-valuenow={figures.used}
        aria-valuetext="{gigabytes(figures.used)} of {gigabytes(figures.budget)}"
      >
        <div
          class={["absolute inset-y-0 left-0 rounded-full opacity-30", runsOut ? "bg-warn" : "bg-soft"]}
          style:width="{projectedShare * 100}%"
        ></div>
        <div
          class={[
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
            { ok: "bg-soft", warn: "bg-warn", stop: "bg-stop" }[level],
          ]}
          style:width="{usedShare * 100}%"
        ></div>
      </div>

      <div class="text-dim grid gap-1 text-xs">
        {#if runsOut}
          <p class="text-muted-foreground">At this rate the usage budget runs out before the month ends.</p>
        {/if}
        <p>
          The usage budget bounds what members watch, not the whole Cloudflare bill. Usage here reads a little above
          Cloudflare's own figure, and well above it for watching through the relay.
        </p>
      </div>
    </section>

    <div class="grid gap-12">
      <form class="grid gap-3" aria-label="Usage budget" onsubmit={saveBudget} novalidate>
        <h2 class="flex h-control-sm items-center text-sm font-medium">Usage budget</h2>
        <div class="grid gap-1.5">
          <label for="usage-budget-gb" class="text-muted-foreground text-xs">GB a month</label>
          <div class="flex items-center gap-1.5">
            <Input
              id="usage-budget-gb"
              type="number"
              inputmode="numeric"
              min={1}
              step={1}
              value={budgetShown}
              aria-invalid={budgetProblem === BUDGET_PROBLEM ? true : undefined}
              aria-describedby="usage-budget-cost"
              class="w-28 [appearance:textfield] text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              oninput={(event) => {
                budgetDraft = event.currentTarget.value;
                budgetProblem = null;
              }}
            />
            <Button type="submit" variant="secondary" disabled={budgetDraft === null || budgetSaving}>Save</Button>
            <!-- The dollar equivalent of what is typed, beside it. -->
            <p id="usage-budget-cost" class="text-soft ml-3 text-xs tabular-nums" aria-live="polite">
              {#if budgetTyped === null}
                &nbsp;
              {:else if budgetCost(budgetTyped) === 0}
                {dollars(0)} a month
              {:else}
                Up to {dollars(budgetCost(budgetTyped))} a month
              {/if}
            </p>
          </div>
        </div>
        <div class="grid gap-1 text-xs">
          {#if budgetProblem}
            <p class="text-muted-foreground" role="alert">{budgetProblem}</p>
          {:else if stopsWatching}
            <p class="text-warn flex items-center gap-2" role="status">
              <CircleAlert class="size-icon-sm shrink-0" aria-hidden="true" />That is no more than is used already: watching stops
              for everyone once it is saved.
            </p>
          {/if}
          <p class="text-dim">
            Cloudflare includes {INCLUDED_GIGABYTES.toLocaleString("en")} GB a month; watched media past that costs $0.05 per GB.
            When the month reaches the budget, watching stops and shares stay live.
          </p>
        </div>
      </form>

      <RaiseConfirm
        bind:open={confirming}
        from={budgetNow}
        to={budgetTyped ?? budgetNow}
        saving={budgetSaving}
        onconfirm={() => budgetTyped !== null && storeBudget(budgetTyped)}
      />

      <form class="grid gap-3" aria-label="Reset day" onsubmit={save} novalidate>
        <h2 class="flex h-control-sm items-center text-sm font-medium">Reset day</h2>
        <div class="grid gap-1.5">
          <label for="usage-reset-day" class="text-muted-foreground text-xs">Day of the month</label>
          <div class="flex items-center gap-1.5">
            <Input
              id="usage-reset-day"
              type="number"
              inputmode="numeric"
              min={1}
              max={31}
              step={1}
              value={shown}
              aria-invalid={problem === "Pick a day from 1 to 31." ? true : undefined}
              class="w-16 [appearance:textfield] text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              oninput={(event) => {
                draft = event.currentTarget.value;
                problem = null;
              }}
            />
            <Button type="submit" variant="secondary" disabled={draft === null || saving}>Save</Button>
          </div>
        </div>
        <div class="grid gap-1 text-xs">
          {#if problem}
            <p class="text-muted-foreground" role="alert">{problem}</p>
          {:else}
            <p class="text-soft tabular-nums">Next reset {day(current.until)}, at midnight UTC.</p>
          {/if}
          <p class="text-dim">
            Match it to your Cloudflare billing date. A month without that day resets on its last day.
          </p>
        </div>
      </form>
    </div>
  </div>
{/if}
