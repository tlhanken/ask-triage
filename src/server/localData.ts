import { promises as fs } from "node:fs";
import nodePath from "node:path";

/**
 * Local-file persistence for the dev and preview servers. A static build has no
 * server; the client falls back to the File System Access API there.
 *
 * Deliberately a file, not a database — see openspec/ for the reasoning. That
 * file is git-tracked and the app rewrites it automatically on every change, so
 * one write that empties it destroys the record between commits. The guard below
 * exists for exactly that, and lives at the filesystem boundary rather than only
 * in the interface, because the interface is not the only thing that can POST.
 */

export interface WriteDecision {
  allow: boolean;
  reason?: string;
  existingTickets: number;
  incomingTickets: number;
}

const ENDPOINT = "/__data";

const ticketCount = (raw: string): number | null => {
  try {
    const parsed = JSON.parse(raw) as { tickets?: unknown };
    return Array.isArray(parsed?.tickets) ? parsed.tickets.length : null;
  } catch {
    return null;
  }
};

/**
 * Refuse a write that would replace a register containing tickets with one
 * containing none, or that is not a register at all.
 *
 * An empty write can never establish anything: the app's own startup ignores an
 * empty file, and its fresh state always carries the seed. So a zero-ticket
 * write is never something the app does on purpose, and the only thing it can do
 * is lose the record.
 */
export function decideWrite(existingRaw: string | null, incomingRaw: string): WriteDecision {
  const incoming = ticketCount(incomingRaw);
  const existing = existingRaw === null ? 0 : ticketCount(existingRaw);
  const existingTickets = existing ?? 0;

  if (incoming === null) {
    return { allow: false, reason: "refused: that is not a Revel register", existingTickets, incomingTickets: 0 };
  }
  if (existing !== null && existing > 0 && incoming === 0) {
    return {
      allow: false,
      reason: `refused: that would replace ${existing} tickets with none`,
      existingTickets,
      incomingTickets: incoming,
    };
  }
  return { allow: true, existingTickets, incomingTickets: incoming };
}

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

/** The middleware, exported so it can be driven directly in tests. */
export function localDataFile(file = nodePath.resolve(process.cwd(), "data/register.json")) {
  const handler = (req: Req, res: Res, next: Next): void => {
    if (!req.url || !req.url.startsWith(ENDPOINT)) return next();

    if (req.method === "GET" || req.method === "HEAD") {
      fs.readFile(file, "utf8")
        .then((text) => {
          res.setHeader("content-type", "application/json");
          res.end(text);
        })
        .catch(() => {
          res.statusCode = 204;                 // no file yet is not an error
          res.end();
        });
      return;
    }

    if (req.method !== "POST") return next();

    let body = "";
    req.on("data", (chunk) => { body += String(chunk ?? ""); });
    req.on("end", () => {
      void (async () => {
        const existing = await fs.readFile(file, "utf8").catch(() => null);
        const verdict = decideWrite(existing, body);
        if (!verdict.allow) {
          res.statusCode = 409;                 // conflict: nothing was written
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, reason: verdict.reason }));
          return;
        }
        try {
          await fs.mkdir(nodePath.dirname(file), { recursive: true });
          await fs.writeFile(file, body, "utf8");
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, file, tickets: verdict.incomingTickets }));
        } catch (err: unknown) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      })();
    });
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
