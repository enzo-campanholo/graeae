import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

export default ts.config(
  { ignores: ["dist/", ".wrangler/", ".logs/", "worker-configuration.d.ts", "src/app/lib/components/ui/"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["src/app/**/*.{ts,svelte}", "src/app/**/*.svelte.ts", "test/loopback/page/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: [".svelte"] } },
  },
  {
    files: ["*.{js,ts}", "scripts/**/*.{mjs,ts}", "test/browser/**/*.ts", "test/loopback/*.ts"],
    languageOptions: { globals: globals.node },
  },
);
