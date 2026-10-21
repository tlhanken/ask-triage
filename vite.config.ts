import nodePath from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { localDataFile } from "./src/server/localData";

/**
 * Local-file persistence, dev and preview servers only. A static build has no
 * server, and the client falls back to the File System Access API there.
 *
 * The middleware lives in src/server/localData.ts rather than inline here, so it
 * can be tested directly: it guards the untracked register file, which is the
 * only copy and is rewritten on every change.
 *
 * Server settings come from ASK_TRIAGE_* variables, read from the environment or
 * from .env.local (copy .env.example). The prefix keeps them server-side: Vite
 * only hands VITE_* variables to the browser.
 */
export default defineConfig(({ mode }) => {
  // loadEnv also reads the real environment, which wins over .env files.
  const env = loadEnv(mode, process.cwd(), "ASK_TRIAGE_");
  const port = env.ASK_TRIAGE_PORT ? Number(env.ASK_TRIAGE_PORT) : undefined;
  if (port !== undefined && !Number.isInteger(port)) {
    throw new Error(`ASK_TRIAGE_PORT must be a port number, not "${env.ASK_TRIAGE_PORT}"`);
  }
  const server = {
    host: env.ASK_TRIAGE_HOST || undefined,   // unset: localhost only
    port,                                     // unset: Vite's 5173 (dev) / 4173 (preview)
    strictPort: port !== undefined,           // a chosen port is not silently swapped
  };
  const dataFile = env.ASK_TRIAGE_DATA_FILE
    ? nodePath.resolve(process.cwd(), env.ASK_TRIAGE_DATA_FILE)
    : undefined;                              // unset: data/register.json

  return {
    plugins: [react(), localDataFile(dataFile)],
    server,
    preview: server,
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      // Pinned to a negative UTC offset, where an evening timestamp is already the
      // next day in UTC. CI runs in UTC, which hides that whole class of bug.
      env: { TZ: "America/Los_Angeles" },
    },
  };
});

