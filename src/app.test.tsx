// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { derive, PROJECTS, revisitInWeeks } from "./schema";
import { freshStore, undecided } from "./store";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const cols = () => Array.from(document.querySelectorAll(".col"));
/** Release columns title themselves with a button; the backlog uses a <b>. */
const colTitle = (c: Element) =>
  (c.querySelector(".col-name") ?? c.querySelector(".col-head b"))?.textContent;
const colByTitle = (title: string) => cols().find((c) => colTitle(c) === title);

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

  it("deferring captures a reason and a weekly revisit date", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /defer/i }));
    fireEvent.change(screen.getByPlaceholderText(/one line/), { target: { value: "behind SSO work" } });
    // revisits are chosen in weeks and always land on the weekly revisit day
    fireEvent.click(screen.getByRole("button", { name: /^next week/ }));
    fireEvent.click(screen.getByRole("button", { name: /record defer/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Decisions$/ }));
    expect(screen.getAllByText(/behind SSO work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`revisit ${revisitInWeeks(1)}`)).length).toBeGreaterThan(0);
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
    expect(cols().map(colTitle)).toEqual(["Backlog", "v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
  });

  it("sprint columns can be reordered with the arrows", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.click(screen.getByRole("button", { name: "move v0.23 left" }));
    expect(cols().map(colTitle)).toEqual(["Backlog", "v0.25", "v0.23", "v0.24", "v0.22", "v0.21"]);
    fireEvent.click(screen.getByRole("button", { name: "move v0.23 right" }));
    expect(cols().map(colTitle)).toEqual(["Backlog", "v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
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
    fireEvent.change(screen.getByPlaceholderText(/add release/i), { target: { value: "v0.26" } });
    fireEvent.submit(screen.getByPlaceholderText(/add release/i).closest("form")!);
    expect(colByTitle("v0.26")).toBeTruthy();
  });
});

describe("review sweep", () => {
  it("steps through the tickets and reports what to look at", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Review$/ }));
    expect(screen.getByText(/with something to look at/)).toBeTruthy();
    expect(screen.getByText(/^1 of \d+$/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /next →/ }));
    expect(screen.getByText(/^2 of \d+$/)).toBeTruthy();
  });

  it("can jump to the next ticket with something wrong, and edit it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Review$/ }));
    fireEvent.click(screen.getByRole("button", { name: /next flagged/i }));
    // the worst ticket is shown first, so it has at least one alert explained
    expect(screen.getByRole("button", { name: /Edit ticket/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Edit ticket/ }));
    expect(screen.getByRole("dialog", { name: /Edit ticket/ })).toBeTruthy();
  });
});

describe("project picker", () => {
  const openNewTicket = () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /New ticket/ }));
    return screen.getByRole("combobox", { name: "Relevant projects" });
  };

  /** Scoped to the picker: a <select> also exposes role "option" for its entries. */
  const pickerOption = () => within(screen.getByRole("listbox")).getAllByRole("option");

  it("offers a dropdown only when asked, and no chips for what is not chosen", () => {
    const input = openNewTicket();
    expect(screen.queryByRole("listbox")).toBeNull();          // closed until asked for
    fireEvent.focus(input);
    expect(pickerOption().length).toBe(PROJECTS.length);
  });

  it("filters as you type and attaches the one you pick", () => {
    const input = openNewTicket();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cind" } });
    expect(pickerOption().map((o) => o.textContent)).toEqual(["Cinder"]);

    fireEvent.click(pickerOption()[0]);
    expect(screen.getByRole("button", { name: /Cinder ✕/ })).toBeTruthy();   // now a chip
    expect(screen.queryByRole("listbox")).toBeNull();                       // and closed again
  });

  it("drops an attached project from the offers", () => {
    const input = openNewTicket();
    fireEvent.focus(input);
    fireEvent.click(pickerOption()[0]);                        // Atlas
    fireEvent.focus(input);
    expect(pickerOption().map((o) => o.textContent)).not.toContain("Atlas");
  });

  it("picks with the keyboard", () => {
    const input = openNewTicket();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });           // first offer, Atlas
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: /Atlas ✕/ })).toBeTruthy();
  });

  it("removes an attached project when its chip is clicked", () => {
    const input = openNewTicket();
    fireEvent.focus(input);
    fireEvent.click(pickerOption()[0]);
    fireEvent.click(screen.getByRole("button", { name: /Atlas ✕/ }));
    expect(screen.queryByRole("button", { name: /Atlas ✕/ })).toBeNull();
  });

  it("says the list is fixed when nothing matches", () => {
    const input = openNewTicket();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText(/No project matches/)).toBeTruthy();
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
    const picker = screen.getByRole("combobox", { name: "Relevant projects" });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: "cind" } });
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option"));
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

describe("release dates and freeze", () => {
  it("shows each release's freeze and ship dates on the board", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    const col = colByTitle("v0.23")!.textContent ?? "";
    expect(col).toMatch(/freeze \d{4}-\d{2}-\d{2}/);
    expect(col).toMatch(/ships \d{4}-\d{2}-\d{2}/);
  });

  it("edits a release's dates from the column", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.click(screen.getByRole("button", { name: "v0.24" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Release date"), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save dates/i }));
    expect(colByTitle("v0.24")!.textContent).toContain("2027-03-01");
  });

  it("warns about scope after freeze but still allows it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));

    // freeze v0.24 by hand, then drag something into it
    fireEvent.click(screen.getByRole("button", { name: "v0.24" }));
    fireEvent.change(screen.getByLabelText("Feature freeze"), { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save dates/i }));
    expect(colByTitle("v0.24")!.textContent).toContain("frozen");

    const card = colByTitle("Backlog")!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.dragStart(card);
    fireEvent.drop(colByTitle("v0.24")!.querySelector(".col-body")!);

    expect(screen.getByRole("status").textContent).toMatch(/scope after freeze/i);
    expect(colByTitle("v0.24")!.textContent).toContain(name);            // it went in
    expect(colByTitle("v0.24")!.textContent).toMatch(/1 after freeze/);  // and is reported
  });

  it("refuses a freeze date that lands after the release date", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprints$/ }));
    fireEvent.click(screen.getByRole("button", { name: "v0.24" }));
    fireEvent.change(screen.getByLabelText("Feature freeze"), { target: { value: "2030-01-01" } });
    expect(screen.getByText(/freeze is after the release date/i)).toBeTruthy();
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
