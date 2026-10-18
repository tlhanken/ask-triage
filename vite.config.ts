import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { localDataFile } from "./src/server/localData";

/**
 * Local-file persistence, dev and preview servers only. A static build has no
 * server, and the client falls back to the File System Access API there.
 *
 * The middleware lives in src/server/localData.ts rather than inline here, so it
 * can be tested directly: it guards a git-tracked file that the app rewrites on
 * every change.
 */
export default defineConfig({
  plugins: [react(), localDataFile()],
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
