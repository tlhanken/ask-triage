// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { derive } from "../domain/assess";
import { revisitInWeeks } from "../domain/dates";
import { DEFAULT_PROJECTS } from "../domain/schema";
import { fillOutQueue } from "../domain/pipeline";
import { freshStore, load, moveTicketToSprint, serialize, type Store } from "../domain/store";
import { readyStore, STORAGE_KEY } from "../domain/test-fixtures";

// Freeze the date so the seed, the release dates and "today" never drift apart.
// Only Date is faked; timers stay real so React and the autosave debounce run.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") }); });
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

const cols = () => Array.from(document.querySelectorAll(".col"));
/** Release columns title themselves with a button; the backlog uses a <b>. */
const colTitle = (c: Element) =>
  (c.querySelector(".col-name") ?? c.querySelector(".col-head b"))?.textContent;
const colByTitle = (title: string) => cols().find((c) => colTitle(c) === title);
const READY = "Ready to schedule";

/** Start the app from a given register, as if it had been saved in this browser. */
const startWith = (s: Store) => { localStorage.setItem(STORAGE_KEY, serialize(s)); render(<App />); };
const toStep = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
/** The Schedule step, starting from a filled-out register. */
const openSchedule = (s: Store = readyStore()) => { startWith(s); toStep(/Schedule/); };

describe("plan: fill out", () => {
  it("opens on Plan, and the header counts the pipeline", () => {
    render(<App />);
    expect(screen.getByText("Priority tracker")).toBeTruthy();
    expect(screen.getAllByRole("button").filter((b) => b.closest("nav.tabs")).map((b) => b.textContent))
      .toEqual(["Plan", "Projects", "Register", "Decisions", "History"]);
    const n = freshStore().tickets.length;
    expect(screen.getByLabelText("Pipeline").textContent).toContain(`${n} to fill out · 0 to schedule`);
  });

  it("shows the top ticket with what it still needs, and why", () => {
    const store = freshStore();
    const top = fillOutQueue(store)[0].ticket;
    expect(derive(top, store.settings).score)
      .toBe(Math.max(...fillOutQueue(store).map((x) => derive(x.ticket, store.settings).score)));
    render(<App />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(`TKT-${String(top.id).padStart(2, "0")}`);
    expect(screen.getByText(/Needed before it can be scheduled/)).toBeTruthy();
    expect(screen.getByLabelText(/Estimate/)).toBeTruthy();
    expect(screen.getByText(/cannot be given a span/)).toBeTruthy();
  });

  it("filling the last field on the card moves the ticket to Schedule", () => {
    const s = freshStore();
    // one ticket missing only its estimate
    const t = { ...s.tickets[0], priority: "Critical" as const, type: "Server" as const, noHardDate: true, dueDate: null };
    startWith({ ...s, tickets: [t] });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(t.name);
    const est = screen.getByLabelText(/Estimate/);
    fireEvent.change(est, { target: { value: "2" } });
    fireEvent.keyDown(est, { key: "Enter" });
    expect(screen.getByText(/Nothing to fill out/)).toBeTruthy();
    expect(screen.getByLabelText("Pipeline").textContent).toContain("0 to fill out · 1 to schedule");
    toStep(/Schedule/);
    expect(colByTitle(READY)!.textContent).toContain(t.name);
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

  it("has no undo key: a decision is undone from History", () => {
    render(<App />);
    const first = screen.getByRole("heading", { level: 2 }).textContent;
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    fireEvent.click(screen.getByRole("button", { name: /record decline/i }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(first);
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /revert to here/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Plan$/ }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(first);
  });

  it("j and k step through the queue without changing anything", () => {
    render(<App />);
    expect(screen.getByText(/^1 of \d+/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "j" });
    expect(screen.getByText(/^2 of \d+/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "k" });
    expect(screen.getByText(/^1 of \d+/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByText(/Nothing recorded yet/)).toBeTruthy();
  });
});

describe("plan: schedule", () => {
  it("shows ready work, then releases newest first", () => {
    openSchedule();
    expect(cols().map(colTitle)).toEqual([READY, "v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
  });

  it("release columns can be reordered with the arrows", () => {
    openSchedule();
    fireEvent.click(screen.getByRole("button", { name: "move v0.23 left" }));
    expect(cols().map(colTitle)).toEqual([READY, "v0.25", "v0.23", "v0.24", "v0.22", "v0.21"]);
    fireEvent.click(screen.getByRole("button", { name: "move v0.23 right" }));
    expect(cols().map(colTitle)).toEqual([READY, "v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
  });

  it("moving a ticket with the column selector moves it between releases", () => {
    openSchedule();
    const card = colByTitle(READY)!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.change(card.querySelector("select")!, { target: { value: "v0.24" } });
    expect(colByTitle("v0.24")!.textContent).toContain(name);
    expect(colByTitle(READY)!.textContent).not.toContain(name);
  });

  it("shows a multi-sprint ticket in every release it spans", () => {
    const s = moveTicketToSprint(readyStore(2), 1, "v0.25");
    openSchedule(s);
    const name = s.tickets.find((t) => t.id === 1)!.name;
    expect(colByTitle("v0.25")!.querySelector(".tcard")!.textContent).toContain(name);
    expect(colByTitle("v0.24")!.querySelector(".tcont")!.textContent).toMatch(/continuing → v0.25/);
    expect(colByTitle("v0.24")!.textContent).toMatch(/1\/8 units/);
  });

  it("adding a release adds its column", () => {
    openSchedule();
    fireEvent.change(screen.getByPlaceholderText(/add release/i), { target: { value: "v0.26" } });
    fireEvent.submit(screen.getByPlaceholderText(/add release/i).closest("form")!);
    expect(colByTitle("v0.26")).toBeTruthy();
  });
});

describe("plan: check", () => {
  /** Three tickets shipping in v0.22, which shipped the day the clock is frozen at. */
  const shipped = () => {
    let s = readyStore();
    for (const id of [1, 2, 3]) s = moveTicketToSprint(s, id, "v0.22");
    return s;
  };

  it("asks about each ticket left in a shipped release, with nothing pre-selected", () => {
    startWith(shipped());
    toStep(/Check/);
    const region = screen.getByRole("region", { name: "Release close-out" });
    const radios = within(region).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(9);
    expect(radios.some((r) => r.checked)).toBe(false);
    expect(within(region).getByRole("button", { name: /Apply 0 choices/ })).toHaveProperty("disabled", true);
  });

  it("applies the choices made and keeps the undecided", () => {
    startWith(shipped());
    toStep(/Check/);
    const region = () => screen.getByRole("region", { name: "Release close-out" });
    const [first, second] = within(region()).getAllByRole("group");
    fireEvent.click(within(first).getByLabelText("Done"));
    fireEvent.click(within(second).getByLabelText(/Carry over to v0.23/));
    fireEvent.click(within(region()).getByRole("button", { name: /Apply 2 choices/ }));
    expect(within(region()).getAllByRole("group")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByText("close out 2 tickets")).toBeTruthy();
  });

  it("reports risks with the reason they matter", () => {
    const s = moveTicketToSprint(readyStore(3), 1, "v0.23");      // would have had to start in v0.21
    startWith(s);
    toStep(/Check/);
    expect(screen.getByText("Starts too late")).toBeTruthy();
    expect(screen.getByText(/would have had to start in v0.21/)).toBeTruthy();
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
    expect(pickerOption().length).toBe(DEFAULT_PROJECTS.length);
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

describe("projects page", () => {
  const openProjects = () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Projects$/ }));
  };
  const list = () => screen.getByRole("complementary", { name: "Project list" });
  const detail = () => screen.getByRole("region", { name: "Project detail" });
  const pick = (name: string) => fireEvent.click(within(list()).getByRole("button", { name: new RegExp(`^${name}`) }));

  it("lists the projects with counts, and shows the first", () => {
    openProjects();
    expect(within(list()).getAllByRole("listitem")).toHaveLength(DEFAULT_PROJECTS.length);
    expect(within(detail()).getByRole("heading", { level: 2 }).textContent).toBe("Atlas");
    expect(within(detail()).getAllByText(/SSO for the partner portal/).length).toBeGreaterThan(0);
  });

  it("switching project switches the tickets", () => {
    openProjects();
    pick("Cinder");
    expect(within(detail()).getByRole("heading", { level: 2 }).textContent).toBe("Cinder");
    expect(within(detail()).getAllByText(/Webhook retries/).length).toBeGreaterThan(0);
  });

  it("searches the list", () => {
    openProjects();
    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "bor" } });
    expect(within(list()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringMatching(/^Borealis/)]);
  });

  it("creates a project from the top of the list and selects it", () => {
    openProjects();
    fireEvent.change(screen.getByLabelText("New project name"), { target: { value: "Aurora" } });
    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    expect(within(detail()).getByRole("heading", { level: 2 }).textContent).toBe("Aurora");
  });

  it("renames in place, carrying the name to its tickets, and refuses a name in use", () => {
    openProjects();
    fireEvent.click(within(detail()).getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("New name");
    fireEvent.change(input, { target: { value: "Cinder" } });
    expect(screen.getByText(/already a project/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save name" })).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: "Atlas 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(within(detail()).getByRole("heading", { level: 2 }).textContent).toBe("Atlas 2");
    expect(within(detail()).getAllByText(/SSO for the partner portal/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByText("rename project Atlas to Atlas 2")).toBeTruthy();
  });

  it("names how many tickets a removal detaches, then detaches them", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    openProjects();
    const used = freshStore().tickets.filter((t) => t.projects.includes("Atlas")).length;
    expect(used).toBeGreaterThan(0);
    fireEvent.click(within(detail()).getByRole("button", { name: "Remove" }));
    expect(confirmSpy.mock.calls[0][0]).toContain(`${used} ticket`);
    expect(within(list()).queryByRole("button", { name: /^Atlas/ })).toBeNull();
    confirmSpy.mockRestore();
  });

  it("edits a due date in the row, recorded in History", () => {
    openProjects();
    const row = within(detail()).getAllByRole("row").find((r) => r.textContent?.includes("SSO for the partner portal"))!;
    fireEvent.change(within(row).getByLabelText("Due date"), { target: { value: "2027-02-01" } });
    expect((within(row).getByLabelText("Due date") as HTMLInputElement).value).toBe("2027-02-01");
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByText(/^due date for \d+$/)).toBeTruthy();
  });

  it("shows a fit warning in Check's words", () => {
    let s = readyStore();
    const id = s.tickets.find((t) => t.projects.includes("Atlas"))!.id;
    s = moveTicketToSprint(s, id, "v0.25");
    s = { ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, dueDate: "2026-11-20", noHardDate: false } : t)) };
    startWith(s);
    fireEvent.click(screen.getByRole("button", { name: /^Projects$/ }));
    expect(within(detail()).getByText("Ships late")).toBeTruthy();
  });

  it("offers to add a project the picker cannot find, and attaches it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /New ticket/ }));
    const input = screen.getByRole("combobox", { name: "Relevant projects" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Aurora" } });
    expect(within(screen.getByRole("listbox")).queryAllByRole("option")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /add .Aurora. to the list/ }));
    expect(screen.getByRole("button", { name: /Aurora ✕/ })).toBeTruthy();
  });

  it("keeps a project name the tickets still carry when the list has forgotten it", () => {
    const s = freshStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, settings: { ...s.settings, projects: ["Atlas"] } }));
    const loaded = load();
    expect(loaded.settings.projects).toContain("Atlas");
    expect(loaded.settings.projects).toContain("Platform");   // reclaimed from the tickets
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
    for (const col of ["TKT", "Name", "Projects", "State", "Ships in", "Due", "Score", "Ticket"]) {
      expect(head).toContain(col);
    }
  });
});

describe("export path for updates", () => {
  it("offers summary, project, and file exports", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    fireEvent.click(screen.getByRole("button", { name: /record decline/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Decisions$/ }));
    expect(screen.getByRole("button", { name: /copy summary/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /by project/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download \.csv/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save as pdf/i })).toBeTruthy();
    expect(screen.getAllByText(/Declined — won't do/).length).toBeGreaterThan(0);
  });
});

describe("board interaction", () => {
  it("drags a ticket between release columns", () => {
    openSchedule();
    const card = colByTitle(READY)!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.dragStart(card);
    const target = colByTitle("v0.24")!.querySelector(".col-body")!;
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(colByTitle("v0.24")!.textContent).toContain(name);
    expect(colByTitle(READY)!.textContent).not.toContain(name);
  });

  it("drags a ticket back to the backlog", () => {
    openSchedule();
    const card = colByTitle(READY)!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.dragStart(card);
    fireEvent.drop(colByTitle("v0.25")!.querySelector(".col-body")!);
    expect(colByTitle("v0.25")!.textContent).toContain(name);
    const moved = colByTitle("v0.25")!.querySelector(".tcard")!;
    fireEvent.dragStart(moved);
    fireEvent.drop(colByTitle(READY)!.querySelector(".col-body")!);
    expect(colByTitle(READY)!.textContent).toContain(name);
  });

  it("auto-optimize previews the moves and only applies on Apply", () => {
    openSchedule();
    fireEvent.click(screen.getByRole("button", { name: /auto-optimize/i }));
    expect(screen.getByText(/Proposed releases/)).toBeTruthy();
    // nothing has moved yet
    expect(colByTitle("v0.23")!.querySelectorAll(".tcard")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/ }));
    expect(screen.queryByText(/Proposed releases/)).toBeNull();
    expect(colByTitle("v0.23")!.querySelectorAll(".tcard").length).toBeGreaterThan(0);
  });

  it("discarding the preview changes nothing", () => {
    openSchedule();
    fireEvent.click(screen.getByRole("button", { name: /auto-optimize/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Discard$/ }));
    expect(colByTitle("v0.23")!.querySelectorAll(".tcard")).toHaveLength(0);
  });
});

describe("release dates and freeze", () => {
  it("shows each release's freeze and ship dates on the board", () => {
    openSchedule();
    const col = colByTitle("v0.23")!.textContent ?? "";
    expect(col).toMatch(/freeze \d{4}-\d{2}-\d{2}/);
    expect(col).toMatch(/ships \d{4}-\d{2}-\d{2}/);
  });

  it("edits a release's dates from the column", () => {
    openSchedule();
    fireEvent.click(screen.getByRole("button", { name: "v0.24" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Release date"), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save dates/i }));
    expect(colByTitle("v0.24")!.textContent).toContain("2027-03-01");
  });

  it("warns about scope after freeze but still allows it", () => {
    openSchedule();

    // freeze v0.24 by hand, then drag something into it
    fireEvent.click(screen.getByRole("button", { name: "v0.24" }));
    fireEvent.change(screen.getByLabelText("Feature freeze"), { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save dates/i }));
    expect(colByTitle("v0.24")!.textContent).toContain("frozen");

    const card = colByTitle(READY)!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.dragStart(card);
    fireEvent.drop(colByTitle("v0.24")!.querySelector(".col-body")!);

    expect(screen.getByRole("status").textContent).toMatch(/scope after freeze/i);
    expect(colByTitle("v0.24")!.textContent).toContain(name);            // it went in
    expect(colByTitle("v0.24")!.textContent).toMatch(/1 after freeze/);  // and is reported
  });

  it("refuses a freeze date that lands after the release date", () => {
    openSchedule();
    fireEvent.click(screen.getByRole("button", { name: "v0.24" }));
    fireEvent.change(screen.getByLabelText("Feature freeze"), { target: { value: "2030-01-01" } });
    expect(screen.getByText(/freeze is after the release date/i)).toBeTruthy();
  });
});

describe("history tab", () => {
  it("records a labelled change and reverts it", () => {
    openSchedule();
    const card = colByTitle(READY)!.querySelector(".tcard")!;
    const name = card.querySelector(".tname")!.textContent!;
    fireEvent.change(card.querySelector("select")!, { target: { value: "v0.22" } });
    expect(colByTitle("v0.22")!.textContent).toContain(name);

    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByText(/move \d+ to v0\.22/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /revert to here/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Plan$/ }));
    expect(colByTitle(READY)!.textContent).toContain(name);
    expect(colByTitle("v0.22")!.querySelectorAll(".tcard")).toHaveLength(0);
  });

  it("offers a file and download path for version control", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    expect(screen.getByRole("button", { name: /save to file/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /load from file/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download json/i })).toBeTruthy();
  });

  it("keeps reset out of the header, and records it so it can be reverted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    expect(within(document.querySelector("header")!).queryByRole("button", { name: /reset/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^History$/ }));
    fireEvent.click(screen.getByRole("button", { name: /reset to demo data/i }));
    expect(screen.getByText("reset to demo data")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /revert to here/i })).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
