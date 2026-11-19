import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

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
    // Only the test build: `pnpm dev`, `pnpm preview` and the deploy's build keep reading
    // the real secrets in `.dev.vars`.
    ...(mode === FAKE_MEDIA_MODE ? [withoutDevVars()] : []),
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

/**
 * Leaves `.dev.vars` out of the build. The Cloudflare plugin copies the root one, which
 * holds the real secrets `pnpm dev` shares with, into `dist/graeae/`, and wrangler reads
 * that file instead of the secrets `vite preview` is started with, so Seam 2's setup secret
 * would be refused (ticket 46). Without the file, the preview takes its secrets from its
 * environment.
 */
function withoutDevVars(): Plugin {
  return {
    name: "graeae:without-dev-vars",
    apply: "build",
    generateBundle: {
      // After the Cloudflare plugin's own `generateBundle`, which adds the file.
      order: "post",
      handler(_, bundle) {
        delete bundle[".dev.vars"];
      },
    },
  };
}
