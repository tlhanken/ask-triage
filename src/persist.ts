/**
 * persist.ts — where the data lives.
 *
 * Two layers, deliberately:
 *   1. localStorage — instant, always available, invisible to git.
 *   2. a real JSON file on disk — written through a tiny dev/preview-server
 *      endpoint so git can diff and revert it. Falls back to the File System
 *      Access API (Chromium) when there is no server, and to nothing after that.
 *
 * No database. See openspec/changes for the reasoning.
 */

const ENDPOINT = "/__data";

export interface SaveResult {
  where: "file" | "browser" | "none" | "refused";
  message: string;
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

export async function loadFromEndpoint(): Promise<string | null> {
  try {
    const r = await fetch(ENDPOINT);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** Save to disk: server endpoint first, then the file picker. */
export async function saveToFile(json: string): Promise<SaveResult> {
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json,
    });
    if (r.ok) return { where: "file", message: "saved to data/register.json" };

    // The endpoint answered and said no. Do NOT fall through to the picker: the
    // server is there, the write was rejected, and pretending otherwise is how a
    // refusal turns into a silent loss.
    let why = `not saved (HTTP ${r.status})`;
    try {
      const body = (await r.json()) as { reason?: string };
      if (body?.reason) why = body.reason;
    } catch {
      /* keep the status code */
    }
    return { where: "refused", message: why };
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

/** Plain download — works in every browser, no permissions needed. */
export function downloadJson(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
