import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const app = (path: string) => new URL(`./src/app/${path}`, import.meta.url).pathname;

/** The Vite mode that builds the app on the fake media server and fake media client, for Seam 2. */
const FAKE_MEDIA_MODE = "fake-media";

export default defineConfig(({ command, mode }) => ({
  // Seam 2 builds with `--mode fake-media`; every other build, the deploy's included, gets
  // the real media layer and media client, and the fakes are left out of it.
  define: { __GRAEAE_FAKE_MEDIA__: JSON.stringify(mode === FAKE_MEDIA_MODE) },
  plugins: [
    svelte(),
    tailwindcss(),
    // The Seam 2 tests start each run on an empty instance held in memory, leaving the
    // instance `pnpm dev` keeps in `.wrangler/` alone.
    cloudflare({ persistState: process.env.GRAEAE_EMPTY_INSTANCE !== "1" }),
  ],
  resolve: {
    alias: {
      $lib: app("lib"),
      // The made-up data the page shells take under `pnpm dev` with `?sample`. A build
      // gets an empty stand-in, so none of it ships.
      $sample: app(command === "serve" ? "sample/index.ts" : "sample/none.ts"),
    },
  },
}));
