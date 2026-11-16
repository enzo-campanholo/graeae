import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss(), cloudflare()],
  resolve: {
    alias: { $lib: new URL("./src/app/lib", import.meta.url).pathname },
  },
});
