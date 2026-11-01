/**
 * persist.ts — where the data lives.
 *
 * Two layers, deliberately:
 *   1. localStorage — instant, always available, invisible to git.
 *   2. a real JSON file on disk — written through a tiny dev/preview-server
 *      endpoint. Gitignored, because it holds real asks: the register's own
 *      snapshots are what revert it, not git. Falls back to the File System
 *      Access API (Chromium) when there is no server, and to nothing after that.
 *
 * No database. See openspec/changes for the reasoning.
 */

import { type Store, freshStore, readStore } from "../domain/store";

const ENDPOINT = "/__data";

// ---------------------------------------------------------------- browser storage

/**
 * The browser storage key. DO NOT RENAME it with the product.
 *
 * It identifies every existing save. Changing it makes load() find nothing, seed
 * a fresh register, and silently orphan whatever the user had — a rename is a
 * cosmetic change and this would be a data-loss event wearing one.
 */
export const STORAGE_KEY = "revel-priority-tracker-v1";

/** The register this browser last held, or a fresh one. Read through readStore,
 *  like every other load path. */
export function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return (raw && readStore(raw)) || freshStore();
  } catch {
    return freshStore();
  }
}

export function save(s: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — state stays in memory */
  }
}

// ---------------------------------------------------------------- the register file


export interface SaveResult {
  /** "stale" means another tab or machine changed the file since this copy was
   *  based on it; "refused" is any other refusal (an empty write, say). */
  where: "file" | "browser" | "none" | "refused" | "stale";
  message: string;
  /** The file's new version after a successful write to the endpoint. */
  etag?: string;
}

/** The register file as served, with the version a later save must send back. */
export interface Loaded {
  text: string;
  etag: string | null;
}

/** Minimal shapes for the File System Access API, which not every lib.dom
 *  version declares and not every browser implements. */
interface FileHandleLike {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
interface OpenHandleLike {
  getFile(): Promise<File>;
}
interface PickerWindow {
  showSaveFilePicker?: (opts?: unknown) => Promise<FileHandleLike>;
  showOpenFilePicker?: (opts?: unknown) => Promise<OpenHandleLike[]>;
}

const picker = () => window as unknown as PickerWindow;

/** Is the local file endpoint there? (dev and preview servers only) */
export async function fileEndpointAvailable(): Promise<boolean> {
  try {
    const r = await fetch(ENDPOINT, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Read the register file from the server, with its version.
 * `undefined` when the server could not be reached; null when there is no file.
 */
export async function loadFromEndpoint(): Promise<Loaded | null | undefined> {
  try {
    const r = await fetch(ENDPOINT);
    if (r.status === 204) return null;
    if (!r.ok) return undefined;
    return { text: await r.text(), etag: r.headers.get("etag") };
  } catch {
    return undefined;
  }
}

/** The file's current version, without its body. null when there is no file. */
export async function currentEtag(): Promise<string | null | undefined> {
  try {
    const r = await fetch(ENDPOINT, { method: "HEAD" });
    if (r.status === 204) return null;
    return r.ok ? r.headers.get("etag") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Save to disk: server endpoint first, then the file picker.
 *
 * `etag` is the version of the file this copy was based on. The server refuses the
 * write if the file has changed since; null means "there was no file", which only
 * establishes one.
 */
export async function saveToFile(json: string, etag: string | null = null): Promise<SaveResult> {
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", ...(etag ? { "if-match": etag } : {}) },
      body: json,
    });
    if (r.ok) {
      // The server says where it wrote: the path is configurable (ASK_TRIAGE_DATA_FILE).
      let file = "the register file";
      let next: string | undefined = r.headers.get("etag") ?? undefined;
      let backup: string | undefined;
      try {
        const body = (await r.json()) as { file?: string; etag?: string; backup?: string };
        file = body.file ?? file;
        next = body.etag ?? next;
        backup = body.backup;
      } catch { /* keep the generic name */ }
      const kept = backup ? `; the previous format was kept at ${backup}` : "";
      return { where: "file", message: `saved to ${file}${kept}`, etag: next };
    }

    // The endpoint answered and said no. Do NOT fall through to the picker: the
    // server is there, the write was rejected, and pretending otherwise is how a
    // refusal turns into a silent loss.
    let why = `not saved (HTTP ${r.status})`;
    let stale = false;
    try {
      const body = (await r.json()) as { reason?: string; stale?: boolean };
      if (body?.reason) why = body.reason;
      stale = body?.stale === true;
    } catch {
      /* keep the status code */
    }
    return { where: stale ? "stale" : "refused", message: why };
  } catch {
    /* no server — try the picker */
  }

  const save = picker().showSaveFilePicker;
  if (save) {
    try {
      const handle = await save({
        suggestedName: "register.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return { where: "file", message: "saved to the file you chose" };
    } catch {
      /* user cancelled */
    }
  }
  return { where: "browser", message: "kept in this browser only" };
}

/**
 * Send a last save as the page goes away. `keepalive` lets the request outlive the
 * page and, unlike sendBeacon, still carries If-Match, so a stale tab is refused
 * here too. Nobody is left to read the answer; a refusal leaves the file as it was.
 * Browsers cap keepalive bodies (64KB in Chromium); a larger register is skipped
 * and the change stays in browser storage.
 */
export function saveOnExit(json: string, etag: string | null): void {
  if (json.length > 60_000) return;
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", ...(etag ? { "if-match": etag } : {}) },
      body: json,
    }).catch(() => { /* the page is gone; nothing to tell */ });
  } catch {
    /* no fetch, or the browser refused: browser storage still has the change */
  }
}

export async function loadFromPicker(): Promise<string | null> {
  const open = picker().showOpenFilePicker;
  if (!open) return null;
  try {
    const [handle] = await open({
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    });
    if (!handle) return null;
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}
