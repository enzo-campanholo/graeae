import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const app = (path: string) => new URL(`./src/app/${path}`, import.meta.url).pathname;

export default defineConfig(({ command }) => ({
  plugins: [svelte(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      $lib: app("lib"),
      // The made-up data the page shells take under `pnpm dev` with `?sample`. A build
      // gets an empty stand-in, so none of it ships.
      $sample: app(command === "serve" ? "sample/index.ts" : "sample/none.ts"),
    },
  },
}));
