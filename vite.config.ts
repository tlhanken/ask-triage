import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { promises as fs } from "node:fs";
import nodePath from "node:path";

/**
 * Local-file persistence. Dev and preview servers only: a static build has no
 * server, and the client falls back to the File System Access API there.
 * Deliberately a file, not a database — see openspec/ for the reasoning.
 */
const FILE = nodePath.resolve(process.cwd(), "data/register.json");

interface Req {
  url?: string;
  method?: string;
  on(event: string, cb: (chunk?: unknown) => void): void;
}
interface Res {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body?: string): void;
}
type Next = () => void;

function localDataFile() {
  const handler = (req: Req, res: Res, next: Next) => {
    if (!req.url || !req.url.startsWith("/__data")) return next();
    if (req.method === "GET" || req.method === "HEAD") {
      fs.readFile(FILE, "utf8")
        .then((text) => {
          res.setHeader("content-type", "application/json");
          res.end(text);
        })
        .catch(() => {
          res.statusCode = 204;
          res.end();
        });
      return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk ?? ""); });
      req.on("end", () => {
        fs.mkdir(nodePath.dirname(FILE), { recursive: true })
          .then(() => fs.writeFile(FILE, body, "utf8"))
          .then(() => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, file: FILE }));
          })
          .catch((err: unknown) => {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          });
      });
      return;
    }
    next();
  };
  return {
    name: "revel-local-data",
    configureServer(server: { middlewares: { use(fn: unknown): void } }) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: { middlewares: { use(fn: unknown): void } }) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), localDataFile()],
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
