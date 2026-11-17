<script lang="ts">
  // The "You" page, the same for every member and the owner: your display name, your
  // devices with Forget, and Add a device. Dark or light is chosen here too.
  import { sample } from "$sample";
  import PlainPage from "$lib/components/plain/PlainPage.svelte";
  import Section from "$lib/components/plain/Section.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { theme, type Theme } from "$lib/theme.svelte.js";

  const you = sample?.you ?? null;
  let name = $state(you?.name ?? "");

  const themes: { value: Theme; label: string }[] = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "system", label: "Match system" },
  ];
</script>

<PlainPage title="You" you={false} gear={!!sample}>
  <Section title="Display name" description="The name everyone in your rooms sees.">
    <form class="flex gap-2" onsubmit={(event) => event.preventDefault()}>
      <Input class="max-w-72" bind:value={name} aria-label="Display name" maxlength={40} />
      <Button type="submit" variant="secondary" disabled={!you || name.trim() === you.name}>Save</Button>
    </form>
  </Section>

  <Section title="Devices" description="The browsers graeae remembers as yours.">
    <ul class="-mx-3 grid gap-0.5">
      {#each you?.devices ?? [] as device (device.id)}
        <li class="hover:bg-raised flex h-12 items-center gap-4 rounded-md px-3 transition-colors duration-150">
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="truncate font-medium">{device.label}</span>
            <span class="text-muted-foreground text-xs">
              {device.current ? "This device" : `Last used ${device.lastUsed.toLowerCase()}`}
            </span>
          </span>
          <Button variant="destructive" size="sm">Forget</Button>
        </li>
      {/each}
    </ul>
    <div>
      <Button variant="secondary">Add a device</Button>
    </div>
  </Section>

  <Section title="Appearance">
    <div class="bg-raised flex w-fit gap-0.5 rounded-md p-0.5" role="radiogroup" aria-label="Appearance">
      {#each themes as option (option.value)}
        <button
          type="button"
          role="radio"
          aria-checked={theme.current === option.value}
          class={[
            "h-7 rounded-[4px] px-3 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            theme.current === option.value ? "bg-raised-2 text-fg" : "text-muted-foreground hover:text-fg",
          ]}
          onclick={() => theme.set(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </Section>
</PlainPage>
