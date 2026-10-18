// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { derive } from "./schema";
import { freshStore, undecided } from "./store";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const cols = () => Array.from(document.querySelectorAll(".col"));
const colByTitle = (title: string) =>
  cols().find((c) => c.querySelector(".col-head b")?.textContent === title);

describe("triage loop", () => {
  it("renders the top ticket with its decision context pre-loaded", () => {
    render(<App />);
    expect(screen.getByText("Revel priority tracker")).toBeTruthy();
    const h2 = screen.getByRole("heading", { level: 2 }).textContent ?? "";
    expect(h2).toMatch(/^TKT-\d\d · /);
    expect(screen.getByText(/Committed this sprint/)).toBeTruthy();
    expect(screen.getByText(/Summary/)).toBeTruthy();
    expect(screen.getByText(/Who's waiting/)).toBeTruthy();
  });

  it("orders the queue by draft score, highest first", () => {
    const store = freshStore();
    const queue = undecided(store);
    const top = queue[0];
    const scores = queue.map((t) => derive(t, store.settings).score);
    expect(derive(top, store.settings).score).toBe(Math.max(...scores));

    render(<App />);
    expect(screen.getByRole("heading", { level: 2 }).textContent)
      .toContain(`TKT-${String(top.id).padStart(2, "0")}`);
  });

  it("accepting fills the capacity meter and advances the queue", () => {
    render(<App />);
    expect(screen.getByText(/Committed this sprint/).textContent).toContain("0 of 8");
    fireEvent.click(screen.getByRole("button", { name: /accept into/i }));
    expect(screen.getByText(/Committed this sprint/).textContent).toContain("1 of 8");
  });

  it("deferring captures a reason and a revisit date", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /defer/i }));
    fireEvent.change(screen.getByPlaceholderText(/one line/), { target: { value: "behind SSO work" } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2027-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: /record defer/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Decisions$/ }));
    expect(screen.getAllByText(/behind SSO work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/revisit 2027-01-15/).length).toBeGreaterThan(0);
  });

  it("undo rolls the last decision back out of the queue", () => {
    render(<App />);
    const first = screen.getByRole("heading", { level: 2 }).textContent;
    fireEvent.click(screen.getByRole("button", { name: /accept into/i }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(first);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(first);
  });
});

describe("sprint board", () => {
  it("shows the backlog, then sprints newest-release first", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    const titles = cols().map((c) => c.querySelector(".col-head b")?.textContent);
    expect(titles).toEqual(["Backlog", "v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
  });

  it("sprint columns can be reordered with the arrows", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.click(screen.getByRole("button", { name: "move v0.23 left" }));
    const titles = cols().map((c) => c.querySelector(".col-head b")?.textContent);
    expect(titles).toEqual(["Backlog", "v0.25", "v0.23", "v0.24", "v0.22", "v0.21"]);
    fireEvent.click(screen.getByRole("button", { name: "move v0.23 right" }));
    expect(cols().map((c) => c.querySelector(".col-head b")?.textContent))
      .toEqual(["Backlog", "v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
  });

  it("moving a ticket with the column selector moves it between sprints", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    const card = colByTitle("Backlog")!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.change(card.querySelector("select")!, { target: { value: "v0.24" } });
    expect(colByTitle("v0.24")!.textContent).toContain(name);
    expect(colByTitle("Backlog")!.textContent).not.toContain(name);
  });

  it("adding a sprint adds its column", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.change(screen.getByPlaceholderText(/add sprint/i), { target: { value: "v0.26" } });
    fireEvent.submit(screen.getByPlaceholderText(/add sprint/i).closest("form")!);
    expect(colByTitle("v0.26")).toBeTruthy();
  });
});

describe("project view", () => {
  it("lists the tickets for a project", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Projects$/ }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Atlas");
    expect(screen.getAllByText(/SSO for the partner portal/).length).toBeGreaterThan(0);
  });

  it("switching project switches the tickets", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Projects$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cinder/ }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Cinder");
    expect(screen.getAllByText(/Webhook retries/).length).toBeGreaterThan(0);
  });
});

describe("editing in the browser", () => {
  it("creates a ticket through the form", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /new ticket/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Audit the audit log" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "because compliance" } });
    fireEvent.click(screen.getByRole("button", { name: "Cinder" }));
    fireEvent.click(screen.getByRole("button", { name: /save ticket/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    expect(screen.getAllByText(/Audit the audit log/).length).toBeGreaterThan(0);
  });

  it("opens a ticket from the register and saves the edit", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    const row = screen.getAllByRole("row").find((r) => r.textContent?.includes("Timezone bug"))!;
    fireEvent.click(row);
    expect(screen.getByRole("dialog")).toBeTruthy();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("Timezone bug in scheduled jobs");
    fireEvent.change(name, { target: { value: "Timezone bug in cron jobs" } });
    fireEvent.click(screen.getByRole("button", { name: /save ticket/i }));
    expect(screen.getAllByText(/Timezone bug in cron jobs/).length).toBeGreaterThan(0);
  });

  it("the register shows the fields you asked for", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    const head = screen.getAllByRole("row")[0].textContent ?? "";
    for (const col of ["TKT", "Name", "Projects", "State", "Sprint", "Due", "Score", "Ticket"]) {
      expect(head).toContain(col);
    }
  });
});

describe("export path for updates", () => {
  it("offers summary, project, and file exports", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /accept into/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Decisions$/ }));
    expect(screen.getByRole("button", { name: /copy summary/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /by project/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download \.csv/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save as pdf/i })).toBeTruthy();
    expect(screen.getAllByText(/Accepted this sprint/).length).toBeGreaterThan(0);
  });
});

describe("board interaction", () => {
  it("drags a ticket between release columns", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    const card = colByTitle("Backlog")!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.dragStart(card);
    const target = colByTitle("v0.24")!.querySelector(".col-body")!;
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(colByTitle("v0.24")!.textContent).toContain(name);
    expect(colByTitle("Backlog")!.textContent).not.toContain(name);
  });

  it("drags a ticket back to the backlog", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    const card = colByTitle("Backlog")!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.dragStart(card);
    fireEvent.drop(colByTitle("v0.25")!.querySelector(".col-body")!);
    expect(colByTitle("v0.25")!.textContent).toContain(name);
    const moved = colByTitle("v0.25")!.querySelector(".tcard")!;
    fireEvent.dragStart(moved);
    fireEvent.drop(colByTitle("Backlog")!.querySelector(".col-body")!);
    expect(colByTitle("Backlog")!.textContent).toContain(name);
  });

  it("auto-optimize previews the moves and only applies on Apply", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.click(screen.getByRole("button", { name: /auto-optimize/i }));
    expect(screen.getByText(/Proposed releases/)).toBeTruthy();
    // nothing has moved yet
    expect(colByTitle("v0.23")!.querySelectorAll(".tcard")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/ }));
    expect(screen.queryByText(/Proposed releases/)).toBeNull();
    expect(colByTitle("v0.23")!.querySelectorAll(".tcard").length).toBeGreaterThan(0);
  });

  it("discarding the preview changes nothing", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.click(screen.getByRole("button", { name: /auto-optimize/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Discard$/ }));
    expect(colByTitle("v0.23")!.querySelectorAll(".tcard")).toHaveLength(0);
  });
});

describe("history tab", () => {
  it("records a labelled change and reverts it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    const card = colByTitle("Backlog")!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.change(card.querySelector("select")!, { target: { value: "v0.22" } });
    expect(colByTitle("v0.22")!.textContent).toContain(name);

    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByText(/move \d+ to v0\.22/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /revert to here/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    expect(colByTitle("Backlog")!.textContent).toContain(name);
    expect(colByTitle("v0.22")!.querySelectorAll(".tcard")).toHaveLength(0);
  });

  it("offers a file and download path for version control", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByRole("button", { name: /save to file/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /load from file/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download json/i })).toBeTruthy();
  });
});
