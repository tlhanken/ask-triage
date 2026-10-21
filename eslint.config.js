import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Lint for correctness, not layout. The code is hand-aligned in places and that
 * is deliberate, so nothing here formats; `tsc --noEmit` owns the types.
 */
export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "data/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Only meaningful under the React Compiler, which this app does not run.
      "react-hooks/preserve-manual-memoization": "off",
      // Unused names are already a type error (noUnusedLocals/Parameters).
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
