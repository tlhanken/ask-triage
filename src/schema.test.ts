import { describe, expect, it } from "vitest";
import {
  type Sprint, type Ticket, BACKGROUND_FIELDS, CORE_FIELDS, DEFAULT_SETTINGS, OPTIONAL_FIELDS, backlog,
  computeFlags, derive, externalLabel, findSprint, forProject, hasShipped, inSprint, isFrozen, parseDate,
  queueHealth, scoreTicket, sprintNames,
} from "./schema";
import {
  HISTORY_CAP, addSprint, applyPlan, blankTicket, compareSprints, createTicket, deleteTicket, explainPlan,
  fillReleaseDates, freshStore, moveTicketToSprint, optimizePlan, recordDecision, removeSprint, revertTo,
  shiftSprint, slippedIn, stats, acceptedThisSprint, undecided, undoLast, updateSprint, updateTicket,
  withHistory,
} from "./store";
import { decisionsToMarkdown, projectsToMarkdown, registerToCsv, toJson } from "./exporters";

/** A due date N days from the real clock, since derive() defaults to now. */
const isoFromNow = (days: number): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const mk = (over: Partial<Ticket>): Ticket => ({
  id: 1, name: "x", summary: "s", projects: ["Atlas"], externalUrl: null,
  dueDate: null, estimate: 2, type: "Should", stakeholders: ["S"], notes: "",
  state: "New", opened: null, sprint: null, carryovers: 0,
  lastTouched: null, closed: null,
  ...over,
});

// Fixed clock: these numbers are the ones the spreadsheet computed for the same rows.
const NOW = new Date("2026-10-18T12:00:00Z");

describe("derivation matches the spreadsheet", () => {
  const caseA = mk({
    type: "Critical", estimate: 2, state: "In Progress", opened: "2026-09-08",
    dueDate: "2026-11-01", sprint: "v0.23", carryovers: 1, lastTouched: "2026-10-15",
  });
  const caseB = mk({
    type: "Should", estimate: 1, state: "Accepted-Backlog", opened: "2026-06-20",
    dueDate: null, carryovers: 0, lastTouched: "2026-09-23",
  });

  it("scores the critical item at 176 and flags DATE-RISK", () => {
    expect(scoreTicket(caseA, DEFAULT_SETTINGS, NOW)).toBe(176);
    expect(computeFlags(caseA, DEFAULT_SETTINGS, NOW)).toEqual(["DATE-RISK"]);
  });

  it("scores the stale backlog item at 44 and flags STALE + NO-DATE-OLD", () => {
    expect(scoreTicket(caseB, DEFAULT_SETTINGS, NOW)).toBe(44);
    expect(computeFlags(caseB, DEFAULT_SETTINGS, NOW)).toEqual(["STALE", "NO-DATE-OLD"]);
  });

  it("does not flag closed tickets", () => {
    const done = mk({ state: "Done", opened: "2026-01-01", lastTouched: "2026-01-01" });
    expect(computeFlags(done, DEFAULT_SETTINGS, NOW)).toEqual([]);
  });

  it("SLIPPED fires once carryovers reach the threshold", () => {
    expect(computeFlags(mk({ state: "In Progress", carryovers: 1 }), DEFAULT_SETTINGS, NOW))
      .not.toContain("SLIPPED");
    expect(computeFlags(mk({ state: "In Progress", carryovers: 2 }), DEFAULT_SETTINGS, NOW))
      .toContain("SLIPPED");
  });

  it("UNPLANNED fires for a critical with no sprint", () => {
    expect(computeFlags(mk({ type: "Critical", sprint: null }), DEFAULT_SETTINGS, NOW))
      .toContain("UNPLANNED");
  });

  it("Little's Law: 200 open at 5/week is a 40-week wait", () => {
    const tickets = Array.from({ length: 200 }, (_, i) => mk({ id: i + 1 }));
    expect(queueHealth(tickets, DEFAULT_SETTINGS).avgWaitWeeks).toBe(40);
  });

  it("derive exposes a human wait label", () => {
    expect(derive(mk({ opened: "2026-10-08" }), DEFAULT_SETTINGS, NOW).waitedLabel).toBe("10d");
  });

  it("the external ticket label is derived from the link, not stored", () => {
    expect(externalLabel("https://partnerco.atlassian.net/browse/PX-118")).toBe("PX-118");
    expect(externalLabel(null)).toBe("");
    expect(externalLabel(undefined)).toBe("");
  });
});

describe("version sprints", () => {
  it("orders v0.x names numerically, not lexically", () => {
    expect(compareSprints("v0.9", "v0.21")).toBeLessThan(0);
    expect(compareSprints("v0.21", "v0.22")).toBeLessThan(0);
    expect(["v0.22", "v0.9", "v0.21"].sort(compareSprints)).toEqual(["v0.9", "v0.21", "v0.22"]);
  });

  it("the seeded sprint columns run newest-release first", () => {
    const s = freshStore();
    expect(sprintNames(s.settings)).toEqual(["v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]);
    expect(s.settings.currentSprint).toBe("v0.23");
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
    expect(inSprint(s1.tickets, "v0.24").map((t) => t.id)).toEqual([1]);
    expect(s1.tickets.find((t) => t.id === 1)!.state).toBe("Committed");
    const s2 = moveTicketToSprint(s1, 1, null, NOW);
    expect(inSprint(s2.tickets, "v0.24")).toHaveLength(0);
    expect(s2.tickets.find((t) => t.id === 1)!.state).toBe("Accepted-Backlog");
    expect(backlog(s2.tickets).some((t) => t.id === 1)).toBe(true);
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
    expect(forProject(multi.tickets, "Atlas").some((t) => t.id === 1)).toBe(true);
    expect(forProject(multi.tickets, "Cinder").some((t) => t.id === 1)).toBe(true);
    expect(forProject(multi.tickets, "Delta").some((t) => t.id === 1)).toBe(false);
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
    const s1 = updateTicket(s, 3, { name: "Renamed", type: "Critical" }, NOW);
    const t = s1.tickets.find((x) => x.id === 3)!;
    expect(t.name).toBe("Renamed");
    expect(t.type).toBe("Critical");
    expect(t.lastTouched).toBe("2026-10-18");
  });

  it("deletes a ticket and the decisions that referenced it", () => {
    const s = recordDecision(freshStore(), 2, "Defer", "later", null, NOW);
    expect(s.decisions).toHaveLength(1);
    const s1 = deleteTicket(s, 2);
    expect(s1.tickets.some((t) => t.id === 2)).toBe(false);
    expect(s1.decisions).toHaveLength(0);
  });

  it("does not mutate the array it was given", () => {
    const s = freshStore();
    const before = s.tickets.length;
    updateTicket(s, 1, { name: "changed" }, NOW);
    expect(s.tickets).toHaveLength(before);
    expect(s.tickets.find((t) => t.id === 1)!.name).not.toBe("changed");
  });
});

describe("field discipline", () => {
  it("stores exactly the core, optional and background fields — nothing more", () => {
    const expected = [...CORE_FIELDS, ...OPTIONAL_FIELDS, ...BACKGROUND_FIELDS].sort();
    expect(Object.keys(blankTicket()).sort()).toEqual(expected);
  });

  it("the three tiers do not overlap", () => {
    const seen = new Set<string>();
    for (const f of [...CORE_FIELDS, ...OPTIONAL_FIELDS, ...BACKGROUND_FIELDS]) {
      expect(seen.has(f)).toBe(false);
      seen.add(f);
    }
  });

  it("carries nothing that was cut", () => {
    const keys = Object.keys(blankTicket());
    for (const gone of ["owner", "ownerType", "size", "nextAction", "externalKey", "expectedDurations"]) {
      expect(keys).not.toContain(gone);
    }
  });

  it("flags an estimate that cannot finish before the due date", () => {
    const soon = mk({ estimate: 3, dueDate: isoFromNow(10) });
    expect(derive(soon, DEFAULT_SETTINGS).overEstimate).toBe(true);
    const comfortable = mk({ estimate: 1, dueDate: isoFromNow(60) });
    expect(derive(comfortable, DEFAULT_SETTINGS).overEstimate).toBe(false);
  });
});

describe("decision loop", () => {
  it("accepting moves the ticket into the sprint and records a decision", () => {
    const s0 = freshStore();
    const first = undecided(s0)[0];
    const s1 = recordDecision(s0, first.id, "Accept", "", null, NOW);
    const moved = s1.tickets.find((t) => t.id === first.id)!;
    expect(moved.state).toBe("Committed");
    expect(moved.sprint).toBe(s0.settings.currentSprint);
    expect(s1.decisions).toHaveLength(1);
    expect(acceptedThisSprint(s1)).toBe(1);
    expect(undecided(s1).length).toBe(undecided(s0).length - 1);
  });

  it("declining closes the ticket", () => {
    const s0 = freshStore();
    const id = undecided(s0)[0].id;
    const s1 = recordDecision(s0, id, "Decline", "not worth it", null, NOW);
    expect(s1.tickets.find((t) => t.id === id)!.state).toBe("Won't Do");
    expect(stats(s1).declined).toBe(1);
  });

  it("undo restores the exact prior ticket and drops the decision", () => {
    const s0 = freshStore();
    const id = undecided(s0)[0].id;
    const before = s0.tickets.find((t) => t.id === id)!;
    const s1 = recordDecision(s0, id, "Defer", "later", "2027-01-01", NOW);
    const s2 = undoLast(s1);
    expect(s2.decisions).toHaveLength(0);
    expect(s2.tickets.find((t) => t.id === id)).toEqual(before);
  });

  it("defer keeps the reason and revisit date for the digest", () => {
    const s0 = freshStore();
    const id = undecided(s0)[0].id;
    const s1 = recordDecision(s0, id, "Defer", "behind SSO", "2027-01-15", NOW);
    const md = decisionsToMarkdown(s1, NOW);
    expect(md).toContain("Revel priority tracker");
    expect(md).toContain("Deferred (1)");
    expect(md).toContain("behind SSO");
    expect(md).toContain("revisit 2027-01-15");
  });
});

describe("exports", () => {
  it("csv carries the ticket fields you named, plus derived score and flags", () => {
    const s = freshStore();
    const lines = registerToCsv(s, NOW).trim().split("\n");
    expect(lines[0]).toContain("id,name,summary,projects");
    expect(lines[0]).toContain("dueDate");
    expect(lines[0]).toContain("externalUrl");
    expect(lines[0]).toContain("notes");
    expect(lines[0]).toContain("estimate");
    for (const gone of ["owner", "size", "nextAction"]) expect(lines[0]).not.toContain(gone);
    expect(lines).toHaveLength(s.tickets.length + 1);
  });

  it("project export groups open tickets under each project", () => {
    const md = projectsToMarkdown(freshStore(), NOW);
    expect(md).toContain("## Atlas (");
    expect(md).toContain("## Cinder (");
  });

  it("json round-trips and carries derived fields", () => {
    const s = freshStore();
    const parsed = JSON.parse(toJson(s, NOW));
    expect(parsed.tickets).toHaveLength(s.tickets.length);
    expect(parsed.tickets[0]).toHaveProperty("score");
    expect(parsed.tickets[0]).toHaveProperty("flags");
  });
});

describe("history and revert", () => {
  it("records the state before a change, under a label", () => {
    const s = freshStore();
    const s1 = withHistory(s, "move 1 to v0.24", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    expect(s1.history).toHaveLength(1);
    expect(s1.history[0].label).toBe("move 1 to v0.24");
    expect(s1.tickets.find((t) => t.id === 1)!.sprint).toBe("v0.24");
  });

  it("a mutation that changes nothing leaves no snapshot behind", () => {
    const s = freshStore();
    expect(withHistory(s, "no-op", (cur) => cur, NOW).history).toHaveLength(0);
  });

  it("reverts tickets and settings to before a change", () => {
    const s = freshStore();
    const s1 = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    expect(revertTo(s1, 0, NOW).tickets.find((t) => t.id === 1)!.sprint).toBeNull();
  });

  it("a revert is itself recorded, so it can be undone", () => {
    const s = freshStore();
    const s1 = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    const s2 = revertTo(s1, 0, NOW);
    expect(s2.history).toHaveLength(2);
    expect(s2.history[1].label).toContain("revert");
    expect(revertTo(s2, 1, NOW).tickets.find((t) => t.id === 1)!.sprint).toBe("v0.24");
  });

  it("keeps the history bounded", () => {
    let s = freshStore();
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, 1, { carryovers: i }, NOW), NOW);
    }
    expect(s.history).toHaveLength(HISTORY_CAP);
    expect(s.history[s.history.length - 1].label).toBe(`change ${HISTORY_CAP + 4}`);
  });

  it("reverting a delete restores the ticket without reusing its id", () => {
    const s = freshStore();
    const nextId = s.nextTicketId;
    const s1 = withHistory(s, "delete 1", (cur) => deleteTicket(cur, 1), NOW);
    const s2 = revertTo(s1, 0, NOW);
    expect(s2.tickets.some((t) => t.id === 1)).toBe(true);
    expect(s2.nextTicketId).toBe(nextId);
  });
});

describe("auto-optimize", () => {
  it("only proposes for open tickets that have no release", () => {
    const s = moveTicketToSprint(freshStore(), 1, "v0.24", NOW);
    const plan = optimizePlan(s, NOW).moves;
    expect(plan.map((m) => m.id)).not.toContain(1);
    for (const m of plan) {
      expect(s.tickets.find((t) => t.id === m.id)!.sprint).toBeNull();
    }
  });

  it("never proposes a release that has already shipped", () => {
    const plan = optimizePlan(freshStore(), NOW).moves;
    expect(plan.length).toBeGreaterThan(0);
    for (const m of plan) expect(["v0.23", "v0.24", "v0.25"]).toContain(m.to);
  });

  it("respects capacity per release", () => {
    const s = freshStore();
    const per = new Map<string, number>();
    for (const m of optimizePlan(s, NOW).moves) per.set(m.to, (per.get(m.to) ?? 0) + 1);
    for (const [, n] of per) expect(n).toBeLessThanOrEqual(s.settings.commitTargetPerSprint);
  });

  it("places dated work before undated work", () => {
    const s = freshStore();
    const plan = optimizePlan(s, NOW).moves;
    const dated = plan.map((m) => Boolean(s.tickets.find((t) => t.id === m.id)!.dueDate));
    const firstUndated = dated.indexOf(false);
    const lastDated = dated.lastIndexOf(true);
    if (firstUndated !== -1 && lastDated !== -1) expect(firstUndated).toBeGreaterThan(lastDated);
    expect(plan[0].reason).toMatch(/due \d{4}-\d{2}-\d{2}/);
  });

  it("applying commits the moves and the whole batch is revertible", () => {
    const s = freshStore();
    const plan = optimizePlan(s, NOW).moves;
    const s1 = withHistory(s, "auto-optimize", (cur) => applyPlan(cur, plan, NOW), NOW);
    const moved = s1.tickets.find((t) => t.id === plan[0].id)!;
    expect(moved.sprint).toBe(plan[0].to);
    expect(moved.state).toBe("Committed");
    const s2 = revertTo(s1, s1.history.length - 1, NOW);
    expect(s2.tickets.find((t) => t.id === plan[0].id)!.sprint).toBeNull();
  });
});

describe("release dates and feature freeze", () => {
  it("every release carries a freeze date and a release date", () => {
    for (const sp of freshStore().settings.sprints) {
      expect(sp.freeze).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sp.release).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("a release is frozen once its freeze date arrives", () => {
    const sp = findSprint(freshStore().settings, "v0.23")!;
    expect(isFrozen(sp, parseDate(sp.freeze!))).toBe(true);
    expect(isFrozen(sp, new Date(parseDate(sp.freeze!).getTime() - 86_400_000))).toBe(false);
  });

  it("auto-optimize skips frozen releases", () => {
    let s = freshStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    const r = optimizePlan(s, NOW);
    expect(r.moves.map((m) => m.to)).not.toContain("v0.23");
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it("auto-optimize prefers a release that ships on or before the due date", () => {
    let s = freshStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    s = updateSprint(s, "v0.24", { freeze: "2020-01-01" });
    const r = optimizePlan(s, NOW);
    expect(r.moves.length).toBeGreaterThan(0);
    expect(r.moves.every((m) => m.to === "v0.25")).toBe(true);
    // the dated ones cannot be shipped in time, and the proposal says so
    expect(r.moves.some((m) => m.warning)).toBe(true);
  });

  it("proposes nothing when every eligible release is frozen", () => {
    let s = freshStore();
    for (const sp of s.settings.sprints) s = updateSprint(s, sp.name, { freeze: "2020-01-01" });
    expect(optimizePlan(s, NOW).moves).toEqual([]);
  });

  it("still proposes when releases have no dates, and flags the uncertainty", () => {
    const s = freshStore();
    const undated: Sprint[] = s.settings.sprints.map((sp) => ({ ...sp, freeze: null, release: null }));
    const r = optimizePlan({ ...s, settings: { ...s.settings, sprints: undated } }, NOW);
    expect(r.moves.length).toBeGreaterThan(0);
    expect(r.undated).toHaveLength(undated.length);
    expect(r.moves.some((m) => m.warning === "this release has no date")).toBe(true);
    expect(explainPlan(r)).toMatch(/no release date/);
  });

  it("explains an empty proposal rather than returning nothing", () => {
    const s = freshStore();
    const shipped: Sprint[] = s.settings.sprints.map((sp) => ({
      ...sp, freeze: "2019-12-01", release: "2020-01-01",
    }));
    const r = optimizePlan({ ...s, settings: { ...s.settings, sprints: shipped } }, NOW);
    expect(r.moves).toEqual([]);
    expect(explainPlan(r)).toMatch(/Nothing to place/);
    expect(explainPlan(r)).toMatch(/already shipped/);
  });

  it("explains when everything is already scheduled", () => {
    const s = freshStore();
    const tickets = s.tickets.map((t, i) => ({ ...t, sprint: i % 2 ? "v0.23" : "v0.24" }));
    const r = optimizePlan({ ...s, tickets }, NOW);
    expect(r.moves).toEqual([]);
    expect(r.candidates).toBe(0);
    expect(explainPlan(r)).toMatch(/no open ticket is unscheduled/);
  });

  it("can fill in missing release dates on a cadence, oldest version first", () => {
    const s = freshStore();
    const undated = { ...s, settings: {
      ...s.settings,
      sprints: s.settings.sprints.map((sp) => ({ ...sp, freeze: null, release: null })),
    } };
    const filled = fillReleaseDates(undated, NOW);
    expect(filled.settings.sprints.every((sp) => sp.release && sp.freeze)).toBe(true);
    const byName = Object.fromEntries(filled.settings.sprints.map((sp) => [sp.name, sp.release!]));
    expect(byName["v0.21"] < byName["v0.25"]).toBe(true);
    // A repair must not hand back a release that is already frozen or shipped.
    expect(filled.settings.sprints.every((sp) => !isFrozen(sp, NOW) && !hasShipped(sp, NOW))).toBe(true);
    expect(optimizePlan(filled, NOW).moves.length).toBeGreaterThan(0);
  });

  it("filling dates changes nothing when every release already has them", () => {
    const s = freshStore();
    expect(fillReleaseDates(s, NOW)).toEqual(s);
  });

  it("undated releases fall back to the order the date repair creates", () => {
    const s = freshStore();
    const undated = { ...s, settings: {
      ...s.settings,
      sprints: s.settings.sprints.map((sp) => ({ ...sp, freeze: null, release: null })),
    } };
    // with no dates, the oldest version is treated as next...
    expect(optimizePlan(undated, NOW).eligible[0]).toBe("v0.21");
    // ...and repairing the dates must not change which release comes first
    expect(optimizePlan(fillReleaseDates(undated, NOW), NOW).eligible[0]).toBe("v0.21");
  });

  it("records what was placed into a release after its freeze", () => {
    let s = freshStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    s = withHistory(
      s, "move 2 to v0.23", (cur) => moveTicketToSprint(cur, 2, "v0.23", NOW), NOW,
      { kind: "move", ticketId: 2, sprint: "v0.23" },
    );
    const slips = slippedIn(s, "v0.23", NOW);
    expect(slips).toHaveLength(1);
    expect(slips[0].op?.ticketId).toBe(2);
    expect(slips[0].label).toContain("move 2");
  });

  it("reports no slip for a release that has not frozen", () => {
    const s = withHistory(
      freshStore(), "move 2 to v0.24", (cur) => moveTicketToSprint(cur, 2, "v0.24", NOW), NOW,
      { kind: "move", ticketId: 2, sprint: "v0.24" },
    );
    expect(slippedIn(s, "v0.24", NOW)).toHaveLength(0);
  });

  it("moving a ticket still works as a plain change, with or without an op", () => {
    const s = freshStore();
    const a = withHistory(s, "move 3 to v0.24", (cur) => moveTicketToSprint(cur, 3, "v0.24", NOW), NOW);
    expect(a.history[0].op).toBeUndefined();
    expect(slippedIn(a, "v0.24", NOW)).toHaveLength(0);
  });
});
