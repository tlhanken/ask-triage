import { promises as fs } from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideWrite, localDataFile } from "./localData";

const register = (n: number): string =>
  JSON.stringify({ version: 3, tickets: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), decisions: [], history: [] });

describe("decideWrite", () => {
  it("allows an ordinary write", () => {
    expect(decideWrite(register(3), register(4)).allow).toBe(true);
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
  constructor(public url: string, public method: string, private body = "") {}
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

class FakeRes {
  statusCode = 200;
  body = "";
  headers: Record<string, string> = {};
  setHeader(k: string, v: string) { this.headers[k] = v; }
  end(body?: string) { this.body = body ?? ""; }
}

const settle = async () => { await new Promise((r) => setTimeout(r, 25)); };

describe("the data endpoint", () => {
  let dir: string;
  let file: string;
  let handler: (req: FakeReq, res: FakeRes, next: () => void) => void;

  beforeEach(async () => {
    dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "revel-data-"));
    file = nodePath.join(dir, "register.json");
    const plugin = localDataFile(file);
    plugin.configureServer({ middlewares: { use(fn: unknown) { handler = fn as typeof handler; } } });
  });

  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  const post = async (body: string) => {
    const res = new FakeRes();
    const req = new FakeReq("/__data", "POST", body);
    handler(req, res, () => { throw new Error("should not fall through"); });
    req.send();
    await settle();
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
    await settle();
    expect(empty.statusCode).toBe(204);

    await post(register(2));
    const res = new FakeRes();
    handler(new FakeReq("/__data", "GET"), res, () => { throw new Error("fell through"); });
    await settle();
    expect(JSON.parse(res.body).tickets).toHaveLength(2);
  });

  it("passes anything that is not the endpoint along", () => {
    let passed = false;
    handler(new FakeReq("/index.html", "GET"), new FakeRes(), () => { passed = true; });
    expect(passed).toBe(true);
  });
});
