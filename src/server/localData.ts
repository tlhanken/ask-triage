import { promises as fs } from "node:fs";
import nodePath from "node:path";

/**
 * Local-file persistence for the dev and preview servers. A static build has no
 * server; the client falls back to the File System Access API there.
 *
 * Deliberately a file, not a database — see openspec/ for the reasoning. That
 * file is gitignored, and the app rewrites it automatically on every change, so
 * one write that empties it destroys the record outright — there is no commit to
 * fall back on. The guard below exists for exactly that, and lives at the
 * filesystem boundary rather than only in the interface, because the interface
 * is not the only thing that can POST.
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
    return { allow: false, reason: "refused: that is not a register for this app", existingTickets, incomingTickets: 0 };
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
  headers?: Record<string, string | string[] | undefined>;
  on(event: string, cb: (chunk?: unknown) => void): void;
}
interface Res {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body?: string): void;
}
type Next = () => void;

const header = (req: Req, name: string): string => {
  const v = req.headers?.[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

/**
 * Why a write must be refused before it is even read, or null when it may go on.
 *
 * Any page in the browser can POST here: a form, or a text/plain fetch, is a
 * "simple" request that needs no preflight, so the browser sends it cross-origin
 * without asking. The app always sends JSON from its own origin, so anything else
 * is refused. Origin is absent on some same-origin requests, and that is allowed.
 */
export function refuseRequest(req: Req): { status: number; reason: string } | null {
  if (!header(req, "content-type").toLowerCase().startsWith("application/json")) {
    return { status: 415, reason: "refused: a register is sent as application/json" };
  }
  const origin = header(req, "origin");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch { /* unparseable: refused below */ }
    if (host !== header(req, "host")) {
      return { status: 403, reason: "refused: that write came from another site" };
    }
  }
  return null;
}

/**
 * Replace the file in one step: write a sibling temp file, then rename it over
 * the original. A crash mid-write then leaves the old register whole instead of
 * a truncated one — and this file is the only copy, with no commit behind it.
 */
async function writeAtomically(file: string, body: string): Promise<void> {
  await fs.mkdir(nodePath.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/** The middleware, exported so it can be driven directly in tests. */
export function localDataFile(file = nodePath.resolve(process.cwd(), "data/register.json")) {
  const handler = (req: Req, res: Res, next: Next): void => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== ENDPOINT) return next();

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

    const refused = refuseRequest(req);
    if (refused) {
      res.statusCode = refused.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, reason: refused.reason }));
      return;
    }

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
          await writeAtomically(file, body);
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
    name: "priority-tracker-local-data",
    configureServer(server: { middlewares: { use(fn: unknown): void } }) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: { middlewares: { use(fn: unknown): void } }) {
      server.middlewares.use(handler);
    },
  };
}
