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
  {
    // The layer rule (see ARCHITECTURE.md): domain logic is pure. It never reaches
    // React, the screens, browser I/O or the server, so it can be tested and changed
    // without any of them.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom", "react-dom/*"], message: "src/domain is pure logic: no React." },
          { group: ["../ui", "../ui/*", "../server", "../server/*"], message: "src/domain must not import the UI or the server." },
        ],
      }],
      "no-restricted-globals": ["error",
        { name: "document", message: "src/domain is pure logic: no DOM." },
        { name: "localStorage", message: "Browser storage belongs in src/ui/persist.ts." },
        { name: "fetch", message: "Network I/O belongs in src/ui/persist.ts." },
      ],
    },
  },
);
