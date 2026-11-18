import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

export default ts.config(
  { ignores: ["dist/", ".wrangler/", "worker-configuration.d.ts", "src/app/lib/components/ui/"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["src/app/**/*.{ts,svelte}", "src/app/**/*.svelte.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: [".svelte"] } },
  },
  {
    files: ["*.{js,ts}", "scripts/**/*.{mjs,ts}", "test/browser/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
);
