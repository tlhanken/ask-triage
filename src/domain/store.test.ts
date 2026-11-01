import { describe, expect, it } from "vitest";
import { isReady } from "./assess";
import { currentRelease, compareSprints } from "./releases";
import { DEFAULT_PROJECTS, type Ticket } from "./schema";
import { editTicket, lastSetAside, recordDecision, revisitDue } from "./decisions";
import { revertTo, withHistory } from "./history";
import { addProject, addSprint, blankTicket, createTicket, deleteTicket, freshStore, moveTicketToSprint, projectTickets, projectUsage, readStore, removeProject, removeSprint, renameProject, serialize, shiftSprint, updateTicket } from "./store";
import { NOW, freezeClock, sprintNames } from "./test-fixtures";

freezeClock();

describe("version sprints", () => {
  it("orders v0.x names numerically, not lexically", () => {
    expect(compareSprints("v0.9", "v0.21")).toBeLessThan(0);
    expect(compareSprints("v0.21", "v0.22")).toBeLessThan(0);
    expect(["v0.22", "v0.9", "v0.21"].sort(compareSprints)).toEqual(["v0.9", "v0.21", "v0.22"]);
  });

  it("the seeded sprint columns run newest-release first", () => {
    const s = freshStore();
    expect(sprintNames(s.settings)).toEqual(["v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
    expect(currentRelease(s.settings, NOW)!.name).toBe("v0.23");
  });

  it("the board order is the stored order, and it is reorderable", () => {
    const s = freshStore();
    const s1 = shiftSprint(s, "v0.23", -1);
    expect(sprintNames(s1.settings)).toEqual(["v0.25", "v0.23", "v0.24", "v0.22", "v0.21"]);
    expect(sprintNames(shiftSprint(s1, "v0.23", 1).settings)).toEqual(sprintNames(s.settings));
  });

  it("a sprint cannot be shifted past either end", () => {
    const s = freshStore();
    expect(sprintNames(shiftSprint(s, "v0.25", -1).settings)).toEqual(sprintNames(s.settings));
    expect(sprintNames(shiftSprint(s, "v0.21", 1).settings)).toEqual(sprintNames(s.settings));
  });

  it("one column per sprint, and a backlog for the unscheduled", () => {
    const s = freshStore();
    const s1 = moveTicketToSprint(s, 1, "v0.24", NOW);
    expect(s1.tickets.filter((t) => t.sprint === "v0.24").map((t) => t.id)).toEqual([1]);
    expect(s1.tickets.find((t) => t.id === 1)!.state).toBe("Committed");
    const s2 = moveTicketToSprint(s1, 1, null, NOW);
    expect(s2.tickets.filter((t) => t.sprint === "v0.24")).toHaveLength(0);
    expect(s2.tickets.find((t) => t.id === 1)!.state).toBe("New");
    expect(s2.tickets.find((t) => t.id === 1)!.sprint).toBeNull();
  });

  it("a new sprint is slotted in by version, newest left", () => {
    const s = freshStore();
    const s1 = addSprint(s, "v0.26");
    expect(sprintNames(s1.settings)[0]).toBe("v0.26");
    const s2 = addSprint(s1, "v0.20");
    const names = sprintNames(s2.settings);
    expect(names[names.length - 1]).toBe("v0.20");
    expect(sprintNames(addSprint(s2, "v0.26").settings)).toHaveLength(names.length);
  });

  it("removing a sprint unschedules its tickets instead of deleting them", () => {
    const s = moveTicketToSprint(freshStore(), 2, "v0.22", NOW);
    const s1 = removeSprint(s, "v0.22");
    expect(sprintNames(s1.settings)).not.toContain("v0.22");
    expect(s1.tickets.find((t) => t.id === 2)!.sprint).toBeNull();
    expect(s1.tickets).toHaveLength(s.tickets.length);
  });
});

describe("projects", () => {
  it("a ticket can belong to several projects at once", () => {
    const s = freshStore();
    const multi = updateTicket(s, 1, { projects: ["Atlas", "Cinder"] }, NOW);
    const on = (p: string) => multi.tickets.filter((t) => t.projects.includes(p)).map((t) => t.id);
    expect(on("Atlas")).toContain(1);
    expect(on("Cinder")).toContain(1);
    expect(on("Delta")).not.toContain(1);
  });
});

describe("editing in the browser (store CRUD)", () => {
  it("creates a ticket with a fresh id", () => {
    const s = freshStore();
    const s1 = createTicket(s, blankTicket());
    expect(s1.tickets).toHaveLength(s.tickets.length + 1);
    expect(s1.nextTicketId).toBeGreaterThan(s.nextTicketId);
    expect(new Set(s1.tickets.map((t) => t.id)).size).toBe(s1.tickets.length);
  });

  it("patches a ticket and re-stamps lastTouched", () => {
    const s = freshStore();
    const s1 = updateTicket(s, 3, { name: "Renamed", priority: "Critical" }, NOW);
    const t = s1.tickets.find((x) => x.id === 3)!;
    expect(t.name).toBe("Renamed");
    expect(t.priority).toBe("Critical");
    expect(t.lastTouched).toBe("2026-10-18");
  });

  it("deletes a ticket but keeps its decisions, which are an append-only record", () => {
    const s = recordDecision(freshStore(), 2, "Defer", "later", null, NOW);
    expect(s.decisions).toHaveLength(1);
    const s1 = deleteTicket(s, 2);
    expect(s1.tickets.some((t) => t.id === 2)).toBe(false);
    expect(s1.decisions).toEqual(s.decisions);
  });

  it("a deferred ticket that is deleted and restored still comes back on its revisit day", () => {
    const s = recordDecision(freshStore(), 2, "Defer", "later", "2026-11-02", NOW);
    const s1 = withHistory(s, "delete 2", (cur) => deleteTicket(cur, 2), NOW);
    const s2 = revertTo(s1, 0, NOW);
    expect(lastSetAside(s2, 2)?.revisit).toBe("2026-11-02");
    expect(revisitDue(s2, new Date(2026, 10, 2)).map((x) => x.ticket.id)).toContain(2);
  });

  it("does not mutate the array it was given", () => {
    const s = freshStore();
    const before = s.tickets.length;
    updateTicket(s, 1, { name: "changed" }, NOW);
    expect(s.tickets).toHaveLength(before);
    expect(s.tickets.find((t) => t.id === 1)!.name).not.toBe("changed");
  });
});

describe("the project list", () => {
  it("starts with the default list", () => {
    expect(freshStore().settings.projects).toEqual([...DEFAULT_PROJECTS]);
  });

  it("adds a project, trimming it and refusing blanks and duplicates", () => {
    let s = freshStore();
    s = addProject(s, "  Aurora  ");
    expect(s.settings.projects).toContain("Aurora");
    expect(addProject(s, "Aurora")).toBe(s);                  // duplicate: unchanged
    expect(addProject(s, "   ")).toBe(s);                    // blank: unchanged
  });

  it("detaches a removed project from every ticket that carried it", () => {
    const s = freshStore();
    const carried = s.tickets.filter((t) => t.projects.includes("Atlas"));
    expect(carried.length).toBeGreaterThan(0);
    expect(projectUsage(s, "Atlas")).toBe(carried.length);

    const after = removeProject(s, "Atlas");
    expect(after.settings.projects).not.toContain("Atlas");
    expect(after.tickets.every((t) => !t.projects.includes("Atlas"))).toBe(true);
    expect(after.tickets.map((t) => t.id)).toEqual(s.tickets.map((t) => t.id));   // nothing lost
  });

  it("makes a removal one revertible action", () => {
    const one = withHistory(freshStore(), "remove project Atlas", (cur) => removeProject(cur, "Atlas"), NOW);
    expect(one.settings.projects).not.toContain("Atlas");
    const back = revertTo(one, one.history.length - 1, NOW);
    expect(back.settings.projects).toContain("Atlas");
    expect(back.tickets.some((t) => t.projects.includes("Atlas"))).toBe(true);
  });
});

describe("the file on disk", () => {
  it("is written indented, so a change reads as a change", () => {
    const out = serialize(freshStore());
    expect(out.endsWith("\n")).toBe(true);                     // a well-formed text file
    expect(out).toContain('\n  "tickets": [');
    expect(out.split("\n").length).toBeGreaterThan(100);       // not one long line
    expect(JSON.parse(out).tickets).toHaveLength(14);          // and still valid JSON
  });

  it("survives a round trip through the parser unchanged", () => {
    const s = freshStore();
    const back = JSON.parse(serialize(s));
    expect(back.tickets).toEqual(s.tickets);
    expect(back.settings).toEqual(s.settings);
  });
});

describe("one way in for every load path", () => {
  it("reads a saved register back", () => {
    const s = freshStore();
    const back = readStore(serialize(s))!;
    expect(back.tickets).toEqual(s.tickets);
    expect(back.settings).toEqual(s.settings);
  });

  it("repairs the project list on the way in", () => {
    const s = freshStore();
    const lost = { ...s, settings: { ...s.settings, projects: ["Atlas"] } };
    const back = readStore(JSON.stringify(lost))!;
    for (const p of new Set(s.tickets.flatMap((t) => t.projects))) expect(back.settings.projects).toContain(p);
  });

  it("refuses an older format whole instead of converting it", () => {
    const s = freshStore();
    const old = { ...s, version: 4, tickets: s.tickets.map(({ noHardDate: _n, planned: _p, ...t }) => t) };
    expect(readStore(JSON.stringify(old))).toBeNull();
    expect(readStore(JSON.stringify({ ...s, version: 4 }))).toBeNull();
  });

  it("refuses what is not a register, rather than half-loading it", () => {
    const s = freshStore();
    expect(readStore("not json")).toBeNull();
    expect(readStore(JSON.stringify({ tickets: [] }))).toBeNull();               // no settings
    expect(readStore(JSON.stringify({ ...s, version: 2 }))).toBeNull();          // unknown version
    expect(readStore(JSON.stringify({ ...s, tickets: [{ id: "x" }] }))).toBeNull();
  });
});

describe("renaming a project", () => {
  it("carries the new name to every ticket, in the same place in the list", () => {
    const s = freshStore();
    const carried = s.tickets.filter((t) => t.projects.includes("Atlas")).map((t) => t.id);
    const r = renameProject(s, "Atlas", "Atlas Prime");
    expect(r.settings.projects.indexOf("Atlas Prime")).toBe(s.settings.projects.indexOf("Atlas"));
    expect(r.settings.projects).not.toContain("Atlas");
    expect(r.tickets.filter((t) => t.projects.includes("Atlas Prime")).map((t) => t.id)).toEqual(carried);
    expect(r.tickets.some((t) => t.projects.includes("Atlas"))).toBe(false);
  });

  it("never merges: a name already in the list, a blank or an unchanged one changes nothing", () => {
    const s = freshStore();
    expect(renameProject(s, "Atlas", "Cinder")).toBe(s);
    expect(renameProject(s, "Atlas", "  ")).toBe(s);
    expect(renameProject(s, "Atlas", "Atlas")).toBe(s);
    expect(renameProject(s, "Nope", "Other")).toBe(s);
    expect(withHistory(s, "rename", (cur) => renameProject(cur, "Atlas", "Cinder"), NOW).history).toHaveLength(0);
  });

  it("is one revertible action, and leaves the decision log alone", () => {
    let s = recordDecision(freshStore(), 1, "Defer", "later", null, NOW);
    const before = s;
    s = withHistory(s, "rename", (cur) => renameProject(cur, "Delta", "Delta 2"), NOW);
    expect(s.decisions).toEqual(before.decisions);
    const back = revertTo(s, 0, NOW);
    expect(back.settings.projects).toEqual(before.settings.projects);
    expect(back.tickets).toEqual(before.tickets);
  });
});

describe("a project's tickets by due date", () => {
  it("puts dated work first by date, then no hard date, then unanswered", () => {
    let s = freshStore();
    const atlas = projectTickets(s, "Atlas").map((t) => t.id);
    expect(atlas.length).toBeGreaterThan(1);
    s = updateTicket(s, atlas[0], { dueDate: null, noHardDate: true }, NOW);
    const sorted = projectTickets(s, "Atlas");
    const rank = (t: Ticket) => (t.dueDate ? 0 : t.noHardDate ? 1 : 2);
    for (let i = 1; i < sorted.length; i++) {
      expect(rank(sorted[i - 1])).toBeLessThanOrEqual(rank(sorted[i]));
      if (sorted[i - 1].dueDate && sorted[i].dueDate) expect(sorted[i - 1].dueDate! <= sorted[i].dueDate!).toBe(true);
    }
  });

  it("an edit anywhere that makes a ticket ready records the accept", () => {
    let s = freshStore();
    const t = s.tickets.find((x) => x.priority && x.type)!;
    s = editTicket(s, t.id, { estimate: 1, noHardDate: false, dueDate: t.dueDate ?? null }, NOW);
    if (!isReady(s.tickets.find((x) => x.id === t.id)!)) s = editTicket(s, t.id, { dueDate: "2027-01-01" }, NOW);
    expect(s.decisions.map((d) => [d.action, d.ticketId])).toEqual([["Accept", t.id]]);
  });
});
