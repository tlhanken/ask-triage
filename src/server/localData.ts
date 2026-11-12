import { createHash } from "node:crypto";
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

/**
 * The version of a register file: a hash of its bytes, quoted as an HTTP entity tag.
 *
 * A hash rather than a counter stored in the register, so there is nothing to
 * migrate, and so a hand edit or a restored backup changes the version too.
 */
export const etagOf = (raw: string): string => `"${createHash("sha256").update(raw, "utf8").digest("hex")}"`;

/** The stored format version of a register, or null when it has none or is not JSON. */
export const formatVersion = (raw: string): number | null => {
  try {
    const v = (JSON.parse(raw) as { version?: unknown })?.version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
};

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

/**
 * Refuse a write that was based on a version of the file that is no longer current.
 *
 * The client sends back the ETag it last saw as If-Match. Without it a write is
 * accepted only to establish a file that does not exist yet, so a plain POST cannot
 * skip the check. A stale write is how a second tab, or a second machine, would
 * otherwise overwrite the first one's work without anyone being told.
 */
export function decideVersion(existingRaw: string | null, ifMatch: string): { allow: true } | { allow: false; reason: string } {
  if (existingRaw === null) {
    return ifMatch
      ? { allow: false, reason: "stale: the register file was removed since this copy was loaded" }
      : { allow: true };
  }
  if (!ifMatch) {
    return { allow: false, reason: "stale: a register file already exists; load it before writing over it" };
  }
  if (ifMatch !== etagOf(existingRaw)) {
    return { allow: false, reason: "stale: another tab or machine changed the register file since this copy was loaded" };
  }
  return { allow: true };
}

/**
 * Where to keep the old file when a write changes the register's format version.
 *
 * The register is untracked, so a format change that went wrong would have no commit
 * to fall back on. The old file is copied beside the register, named for the format
 * it was in and when it was replaced, and never touched again.
 */
export function backupPath(file: string, version: number | null, now = new Date()): string {
  const dir = nodePath.dirname(file);
  const base = nodePath.basename(file, nodePath.extname(file));
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return nodePath.join(dir, `${base}.v${version ?? "unknown"}.${stamp}.json`);
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
          res.setHeader("etag", etagOf(text));
          res.end(req.method === "HEAD" ? undefined : text);
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
        const refuse = (reason: string, stale: boolean) => {
          res.statusCode = 409;                 // conflict: nothing was written
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, stale, reason }));
        };
        const version = decideVersion(existing, header(req, "if-match"));
        if (!version.allow) return refuse(version.reason, true);
        const verdict = decideWrite(existing, body);
        if (!verdict.allow) return refuse(verdict.reason ?? "refused", false);
        try {
          let backup: string | undefined;
          if (existing !== null && formatVersion(existing) !== formatVersion(body)) {
            backup = backupPath(file, formatVersion(existing));
            await writeAtomically(backup, existing);
          }
          await writeAtomically(file, body);
          const etag = etagOf(body);
          res.setHeader("content-type", "application/json");
          res.setHeader("etag", etag);
          res.end(JSON.stringify({ ok: true, file, etag, tickets: verdict.incomingTickets, ...(backup ? { backup } : {}) }));
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
