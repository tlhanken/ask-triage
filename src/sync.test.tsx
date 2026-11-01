// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { etagOf } from "./server/localData";
import { freshStore, serialize } from "./store";

/**
 * A stand-in for the dev server's file endpoint, with the same rules: ETag on read,
 * If-Match on write, 409 for a stale write. It records the order of requests so a
 * test can say what happened before what.
 */
class FakeServer {
  file: string | null = null;
  log: string[] = [];
  /** Hold GETs until released, to widen the startup window on purpose. */
  private gate: Promise<void> = Promise.resolve();
  private release: () => void = () => {};

  holdReads() {
    this.gate = new Promise((r) => { this.release = r; });
  }
  releaseReads() { this.release(); }

  fetch = async (_url: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? "GET";
    this.log.push(method);
    const tag = this.file === null ? null : etagOf(this.file);
    if (method === "HEAD" || method === "GET") {
      if (method === "GET") await this.gate;
      if (this.file === null) return new Response(null, { status: 204 });
      return new Response(method === "HEAD" ? null : this.file, { status: 200, headers: { etag: tag! } });
    }
    const headers = (init.headers ?? {}) as Record<string, string>;
    const ifMatch = headers["if-match"] ?? "";
    const stale = this.file === null ? ifMatch !== "" : ifMatch !== tag;
    if (stale) {
      return new Response(JSON.stringify({ ok: false, stale: true, reason: "stale: another tab or machine changed the register file since this copy was loaded" }), { status: 409 });
    }
    this.file = String(init.body);
    const next = etagOf(this.file);
    return new Response(JSON.stringify({ ok: true, file: "data/register.json", etag: next }), { status: 200, headers: { etag: next } });
  };
}

let server: FakeServer;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") });
  server = new FakeServer();
  vi.stubGlobal("fetch", server.fetch);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A register on disk that differs from the seed in one visible way. */
const fileWith = (name: string) => {
  const s = freshStore();
  s.tickets[0] = { ...s.tickets[0], name };
  return serialize(s);
};

const historyStatus = async (text: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
  await waitFor(() => expect(document.body.textContent).toMatch(text), { timeout: 3000 });
};

describe("the file is the source of truth", () => {
  it("loads the file on startup, whatever browser storage holds", async () => {
    server.file = fileWith("From the file");
    localStorage.setItem("revel-priority-tracker-v1", fileWith("From the browser"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    await waitFor(() => expect(screen.getByText("From the file")).toBeTruthy());
    expect(screen.queryByText("From the browser")).toBeNull();
  });

  it("writes nothing to the file until the read has finished", async () => {
    server.file = fileWith("Real work");
    server.holdReads();
    render(<App />);
    await new Promise((r) => setTimeout(r, 900));              // longer than the autosave delay
    expect(server.log).not.toContain("POST");
    server.releaseReads();
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    await waitFor(() => expect(screen.getByText("Real work")).toBeTruthy());
    expect(server.file).toContain("Real work");
  });

  it("establishes the file from the browser when there is none", async () => {
    render(<App />);
    await waitFor(() => expect(server.file).not.toBeNull(), { timeout: 3000 });
    expect(JSON.parse(server.file!).tickets.length).toBeGreaterThan(0);
  });

  it("never writes over a file this version cannot read", async () => {
    server.file = JSON.stringify({ version: 1, tickets: [{ id: 1 }] });
    render(<App />);
    await historyStatus(/not one this version can read/);
    await new Promise((r) => setTimeout(r, 900));
    expect(server.log).not.toContain("POST");
  });

  it("keeps saving as long as it is the only writer", async () => {
    render(<App />);
    await waitFor(() => expect(server.file).not.toBeNull(), { timeout: 3000 });
    for (const name of ["first", "second"]) {
      fireEvent.click(screen.getByRole("button", { name: "+ New ticket" }));
      fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(server.file).toContain(`"${name}"`), { timeout: 3000 });
    }
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a stale write is refused", () => {
  it("stops a second tab from overwriting the first, and says why", async () => {
    server.file = fileWith("Shared");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    await waitFor(() => expect(screen.getByText("Shared")).toBeTruthy());

    // Another tab saves in the meantime.
    server.file = fileWith("Changed elsewhere");

    // This tab makes a change, and its write is refused.
    fireEvent.click(screen.getByRole("button", { name: "+ New ticket" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert.textContent).toMatch(/Another tab or machine changed the register file/);
    expect(server.file).toContain("Changed elsewhere");          // the other tab's work stands
    expect(server.file).not.toContain('"Mine"');

    // No further writes are attempted while the conflict stands.
    const posts = server.log.filter((m) => m === "POST").length;
    fireEvent.click(screen.getByRole("button", { name: "+ New ticket" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Also mine" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await new Promise((r) => setTimeout(r, 900));
    expect(server.log.filter((m) => m === "POST").length).toBe(posts);
  });

  it("offers this tab's copy as a download, holding every change made in it", async () => {
    server.file = fileWith("Shared");
    const saved: string[] = [];
    const createObjectURL = vi.fn((b: Blob) => { void b.text().then((t) => saved.push(t)); return "blob:x"; });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    await waitFor(() => expect(screen.getByText("Shared")).toBeTruthy());
    server.file = fileWith("Changed elsewhere");

    fireEvent.click(screen.getByRole("button", { name: "+ New ticket" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await screen.findByRole("alert", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Download my copy" }));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0]).toContain('"Mine"');
  });

  it("reloads the file on request, and resumes saving", async () => {
    server.file = fileWith("Shared");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    await waitFor(() => expect(screen.getByText("Shared")).toBeTruthy());
    server.file = fileWith("Changed elsewhere");

    fireEvent.click(screen.getByRole("button", { name: "+ New ticket" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await screen.findByRole("alert", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Reload from file" }));
    await waitFor(() => expect(screen.getByText("Changed elsewhere")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Mine")).toBeNull();

    // Saving resumes against the reloaded version.
    fireEvent.click(screen.getByRole("button", { name: "+ New ticket" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "After reload" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(server.file).toContain('"After reload"'), { timeout: 3000 });
  });
});
