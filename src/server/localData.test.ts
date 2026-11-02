import { promises as fs } from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupPath, decideVersion, decideWrite, etagOf, localDataFile } from "./localData";

const register = (n: number): string =>
  JSON.stringify({ version: 3, tickets: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), decisions: [], history: [] });

describe("decideWrite", () => {
  it("allows an ordinary write", () => {
    expect(decideWrite(register(3), register(4)).allow).toBe(true);
  });

  it("is not fooled by indentation", () => {
    const pretty = JSON.stringify({ version: 3, tickets: [{ id: 1 }], decisions: [], history: [] }, null, 2) + "\n";
    expect(decideWrite(pretty, register(2)).allow).toBe(true);
    expect(decideWrite(register(2), JSON.stringify({ tickets: [] }, null, 2)).allow).toBe(false);
  });

  it("refuses to replace a register that has tickets with one that does not", () => {
    const v = decideWrite(register(14), register(0));
    expect(v.allow).toBe(false);
    expect(v.reason).toMatch(/replace 14 tickets with none/);
  });

  it("allows an empty write when there is nothing to lose", () => {
    expect(decideWrite(null, register(0)).allow).toBe(true);   // establishing the file
    expect(decideWrite(register(0), register(0)).allow).toBe(true);
  });

  it("refuses anything that is not a register", () => {
    expect(decideWrite(register(3), "not json").allow).toBe(false);
    expect(decideWrite(register(3), JSON.stringify({ tickets: "nope" })).allow).toBe(false);
    expect(decideWrite(register(3), JSON.stringify({})).allow).toBe(false);
  });
});

// ------------------------------------------------------------------ the wiring

class FakeReq {
  private handlers: Record<string, ((chunk?: unknown) => void)[]> = {};
  constructor(
    public url: string,
    public method: string,
    private body = "",
    public headers: Record<string, string> = { "content-type": "application/json", host: "localhost:5173" },
  ) {}
  on(event: string, cb: (chunk?: unknown) => void) {
    (this.handlers[event] ??= []).push(cb);
    return this;
  }
  /** Fire the body, then end — after the handler has registered its listeners. */
  send() {
    if (this.body) for (const h of this.handlers.data ?? []) h(this.body);
    for (const h of this.handlers.end ?? []) h();
  }
}

/** A response that can be awaited until the handler has answered. Waiting on the
 *  answer, not on a timer, keeps these tests reliable on a slow or busy machine:
 *  the handler finishes its file writes before it calls end(). */
class FakeRes {
  statusCode = 200;
  body = "";
  headers: Record<string, string> = {};
  private finish: () => void = () => {};
  readonly done = new Promise<void>((r) => { this.finish = r; });
  setHeader(k: string, v: string) { this.headers[k] = v; }
  end(body?: string) { this.body = body ?? ""; this.finish(); }
}

describe("the data endpoint", () => {
  let dir: string;
  let file: string;
  let handler: (req: FakeReq, res: FakeRes, next: () => void) => void;

  beforeEach(async () => {
    dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "ask-triage-data-"));
    file = nodePath.join(dir, "register.json");
    const plugin = localDataFile(file);
    plugin.configureServer({ middlewares: { use(fn: unknown) { handler = fn as typeof handler; } } });
  });

  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  /** A write from a tab that has read the file it is writing over, as the app does.
   *  `ifMatch` overrides that: null sends none, a string sends that version. */
  const post = async (body: string, headers?: Record<string, string>, ifMatch?: string | null) => {
    const res = new FakeRes();
    const current = await fs.readFile(file, "utf8").catch(() => null);
    const base = ifMatch === undefined ? (current === null ? null : etagOf(current)) : ifMatch;
    const all = { ...(headers ?? { "content-type": "application/json", host: "localhost:5173" }), ...(base ? { "if-match": base } : {}) };
    const req = new FakeReq("/__data", "POST", body, all);
    handler(req, res, () => { throw new Error("should not fall through"); });
    req.send();
    await res.done;
    return res;
  };

  it("writes a register to the file", async () => {
    const res = await post(register(14));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(14);
  });

  it("refuses an empty write over a real register, and leaves the file alone", async () => {
    await post(register(14));
    const res = await post(register(0));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).reason).toMatch(/replace 14 tickets with none/);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(14);   // untouched
  });

  it("serves the file back, and reports 204 when there is none", async () => {
    const empty = new FakeRes();
    handler(new FakeReq("/__data", "GET"), empty, () => { throw new Error("fell through"); });
    await empty.done;
    expect(empty.statusCode).toBe(204);

    await post(register(2));
    const res = new FakeRes();
    handler(new FakeReq("/__data", "GET"), res, () => { throw new Error("fell through"); });
    await res.done;
    expect(JSON.parse(res.body).tickets).toHaveLength(2);
  });

  it("passes anything that is not the endpoint along", () => {
    let passed = false;
    handler(new FakeReq("/index.html", "GET"), new FakeRes(), () => { passed = true; });
    expect(passed).toBe(true);
    passed = false;
    handler(new FakeReq("/__database", "GET"), new FakeRes(), () => { passed = true; });
    expect(passed).toBe(true);                                // a prefix is not the endpoint
  });

  it("leaves no temporary file behind after a write", async () => {
    await post(register(3));
    await post(register(4));
    expect(await fs.readdir(dir)).toEqual(["register.json"]);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(4);
  });

  // A page on any other site can send a "simple" cross-origin POST with no
  // preflight — a form or a text/plain fetch. Neither may reach the file.
  it("refuses a write that is not sent as JSON, and leaves the file alone", async () => {
    await post(register(14));
    const res = await post(register(1), { "content-type": "text/plain", host: "localhost:5173" });
    expect(res.statusCode).toBe(415);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(14);
  });

  it("refuses a write from another origin, and allows one from its own", async () => {
    await post(register(14));
    const foreign = await post(register(1), {
      "content-type": "application/json", host: "localhost:5173", origin: "https://evil.example",
    });
    expect(foreign.statusCode).toBe(403);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(14);

    const own = await post(register(2), {
      "content-type": "application/json", host: "100.64.0.1:5173", origin: "http://100.64.0.1:5173",
    });
    expect(own.statusCode).toBe(200);
  });

  // -------------------------------------------------------------- stale writes

  const get = async (method = "GET") => {
    const res = new FakeRes();
    handler(new FakeReq("/__data", method), res, () => { throw new Error("fell through"); });
    await res.done;
    return res;
  };

  it("serves the file's version as an ETag, and HEAD sends no body", async () => {
    await post(register(2));
    const raw = await fs.readFile(file, "utf8");
    const res = await get();
    expect(res.headers.etag).toBe(etagOf(raw));
    const head = await get("HEAD");
    expect(head.headers.etag).toBe(etagOf(raw));
    expect(head.body).toBe("");
  });

  it("refuses a write based on a version that is no longer current, and leaves the file alone", async () => {
    await post(register(3));
    const tabB = (await get()).headers.etag;             // a second tab loads the file
    const tabA = await post(register(4));                  // the first tab saves
    expect(tabA.statusCode).toBe(200);

    const stale = await post(register(5), undefined, tabB);
    expect(stale.statusCode).toBe(409);
    expect(JSON.parse(stale.body).stale).toBe(true);
    expect(JSON.parse(stale.body).reason).toMatch(/another tab or machine/);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(4);   // A's change kept
  });

  it("accepts a write based on the current version, and returns the next one", async () => {
    await post(register(3));
    const etag = (await get()).headers.etag;
    const res = await post(register(4), undefined, etag);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).etag).toBe(etagOf(await fs.readFile(file, "utf8")));
    expect(res.headers.etag).toBe(JSON.parse(res.body).etag);
  });

  it("refuses a write with no version over an existing file, but establishes a new one", async () => {
    expect((await post(register(3), undefined, null)).statusCode).toBe(200);    // no file yet
    const res = await post(register(4), undefined, null);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).stale).toBe(true);
    expect(JSON.parse(await fs.readFile(file, "utf8")).tickets).toHaveLength(3);
  });

  it("treats a hand edit as a new version", async () => {
    await post(register(3));
    const before = (await get()).headers.etag;
    await fs.writeFile(file, register(3).replace("{", "{ "), "utf8");             // same data, edited by hand
    expect((await get()).headers.etag).not.toBe(before);
    expect((await post(register(4), undefined, before)).statusCode).toBe(409);
  });

  it("marks an empty-write refusal as not stale, so the app can tell the two apart", async () => {
    await post(register(14));
    const res = await post(register(0));
    expect(JSON.parse(res.body).stale).toBe(false);
  });

  // -------------------------------------------------------------- format changes

  it("keeps a copy of the old file when a write changes the format version", async () => {
    await post(register(3));
    const old = await fs.readFile(file, "utf8");
    const next = JSON.stringify({ version: 4, tickets: [{ id: 1 }], decisions: [], history: [] });
    const res = await post(next);
    expect(res.statusCode).toBe(200);
    const backup = JSON.parse(res.body).backup as string;
    expect(nodePath.basename(backup)).toMatch(/^register\.v3\..+\.json$/);
    expect(await fs.readFile(backup, "utf8")).toBe(old);
    expect(await fs.readFile(file, "utf8")).toBe(next);
  });

  it("keeps no copy when the format version is unchanged", async () => {
    await post(register(3));
    const res = await post(register(4));
    expect(JSON.parse(res.body).backup).toBeUndefined();
    expect(await fs.readdir(dir)).toEqual(["register.json"]);
  });
});

describe("decideVersion", () => {
  it("allows establishing a file only without a version", () => {
    expect(decideVersion(null, "").allow).toBe(true);
    expect(decideVersion(null, '"abc"').allow).toBe(false);   // the file was removed under us
  });

  it("requires the current version over an existing file", () => {
    const raw = register(2);
    expect(decideVersion(raw, "").allow).toBe(false);
    expect(decideVersion(raw, '"nope"').allow).toBe(false);
    expect(decideVersion(raw, etagOf(raw)).allow).toBe(true);
  });
});

describe("backupPath", () => {
  it("names the copy for its format and the moment it was replaced, beside the file", () => {
    const p = backupPath("/data/register.json", 3, new Date("2026-11-01T20:15:00.123Z"));
    expect(p).toBe(nodePath.join("/data", "register.v3.2026-11-01T20-15-00-123Z.json"));
    expect(nodePath.basename(backupPath("/d/r.json", null))).toMatch(/^r\.vunknown\./);
  });
});
