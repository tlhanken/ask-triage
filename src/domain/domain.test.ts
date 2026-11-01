import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeFlags, derive, isReady, missingRequired, nudges, queueHealth, riskAlerts, scoreTicket } from "./assess";
import { addDays, iso, localStamp, parseDate, REVISIT_WEEK_CHOICES, REVISIT_WEEKDAY, revisitInWeeks, revisitIsDue } from "./dates";
import { beingWorkedOn, currentRelease, defaultSprints, fillState, findSprint, hasShipped, isFrozen, loadUnits, releaseOrder, shipsLate, spanOf, startsTooLate, compareSprints } from "./releases";
import { BACKGROUND_FIELDS, CORE_FIELDS, DEFAULT_PROJECTS, DEFAULT_SETTINGS, externalLabel, matchProjects, OPTIONAL_FIELDS, PROJECT_SUGGESTION_CAP, type Sprint, type Ticket, type Settings } from "./schema";
import { applyCloseOut, defaultRevisit, editTicket, lastSetAside, nextRelease, recordDecision, revisitDue } from "./decisions";
import { HISTORY_CAP, planRevert, revertTo, slippedIn, withHistory } from "./history";
import { applyPlan, explainPlan, fillReleaseDates, optimizePlan } from "./optimize";
import { checkReport, closeOutQueue, fillOutQueue, pipeline, scheduleQueue } from "./pipeline";
import { addProject, addSprint, blankTicket, createTicket, deleteTicket, freshStore, moveTicketToSprint, projectTickets, projectUsage, readStore, removeProject, removeSprint, renameProject, resetToSeed, serialize, shiftSprint, type Store, STORE_VERSION, updateSprint, updateTicket } from "./store";
import { mk, readyStore } from "./test-fixtures";

const sprintNames = (s: Settings): string[] => s.sprints.map((x) => x.name);
import { decisionsToMarkdown, projectsToMarkdown, registerToCsv, stamp, toJson } from "./exporters";

/** A due date N days from now. The clock is frozen at NOW below, so "now" here,
 *  in freshStore(), in the seed, and in every `now = new Date()` default agree. */
const isoFromNow = (days: number): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Fixed clock: these numbers are the ones the spreadsheet computed for the same rows.
const NOW = new Date("2026-10-18T12:00:00Z");

// Freeze the date for the whole file. Fixtures built from the real clock (the seed,
// defaultSprints(), isoFromNow) would otherwise drift away from NOW day by day,
// and tests that compare the two start failing a few days after they were written.
// Only Date is faked; timers stay real.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"], now: NOW }); });
afterAll(() => { vi.useRealTimers(); });

describe("derivation matches the spreadsheet", () => {
  const caseA = mk({
    priority: "Critical", estimate: 2, state: "Committed", opened: "2026-09-08",
    dueDate: "2026-11-01", sprint: "v0.23", carryovers: 1, lastTouched: "2026-10-15",
  });
  const caseB = mk({
    priority: "Should", estimate: 1, state: "New", opened: "2026-06-20",
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
    expect(computeFlags(mk({ state: "Committed", carryovers: 1 }), DEFAULT_SETTINGS, NOW))
      .not.toContain("SLIPPED");
    expect(computeFlags(mk({ state: "Committed", carryovers: 2 }), DEFAULT_SETTINGS, NOW))
      .toContain("SLIPPED");
  });

  it("UNPLANNED fires for a critical with no sprint", () => {
    expect(computeFlags(mk({ priority: "Critical", sprint: null }), DEFAULT_SETTINGS, NOW))
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

  it("flags a ticket whose ship release ships after its due date", () => {
    const settings = freshStore().settings;                          // v0.23 ships in 14 days
    const late = mk({ sprint: "v0.23", dueDate: isoFromNow(10) });
    expect(derive(late, settings).shipsLate).toBe(true);
    const fine = mk({ sprint: "v0.23", dueDate: isoFromNow(60) });
    expect(derive(fine, settings).shipsLate).toBe(false);
    expect(derive(mk({ dueDate: isoFromNow(10) }), settings).shipsLate).toBe(false);   // not scheduled
  });
});

describe("decisions", () => {
  it("declining closes the ticket", () => {
    const s1 = recordDecision(freshStore(), 1, "Decline", "not worth it", null, NOW);
    expect(s1.tickets.find((t) => t.id === 1)!.state).toBe("Won't Do");
    expect(s1.tickets.find((t) => t.id === 1)!.closed).toBe("2026-10-18");
  });

  it("deferring and blocking take a ticket off the plan", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = moveTicketToSprint(s, 2, "v0.24", NOW);
    s = recordDecision(s, 1, "Defer", "later", "2026-11-16", NOW);
    s = recordDecision(s, 2, "Block", "waiting on partner", "2026-11-02", NOW);
    expect(s.tickets.find((t) => t.id === 1)).toMatchObject({ state: "Deferred", sprint: null });
    expect(s.tickets.find((t) => t.id === 2)).toMatchObject({ state: "Blocked", sprint: null });
  });

  it("the decision log carries no copy of the ticket for undo: History is the undo", () => {
    const s1 = recordDecision(freshStore(), 1, "Defer", "later", "2027-01-04", NOW);
    expect(s1.decisions[0]).not.toHaveProperty("prev");
    const s0 = freshStore();
    const one = withHistory(s0, "defer 1", (cur) => recordDecision(cur, 1, "Defer", "later", "2027-01-04", NOW), NOW);
    expect(revertTo(one, 0, NOW).tickets.find((t) => t.id === 1)).toEqual(s0.tickets.find((t) => t.id === 1));
  });

  it("defer keeps the reason and revisit date for the digest", () => {
    const s1 = recordDecision(freshStore(), 1, "Defer", "behind SSO", "2027-01-15", NOW);
    const md = decisionsToMarkdown(s1, NOW);
    expect(md).toContain("Priority tracker");
    expect(md).toContain("Deferred (1)");
    expect(md).toContain("behind SSO");
    expect(md).toContain("revisit 2027-01-15");
  });

  it("the digest groups done and carried-over work too", () => {
    const now = new Date(2026, 10, 1);                        // v0.22 shipped 2026-10-18
    let s = moveTicketToSprint(readyStore(), 1, "v0.22", NOW);
    s = moveTicketToSprint(s, 2, "v0.22", NOW);
    s = applyCloseOut(s, [{ id: 1, choice: "Done" }, { id: 2, choice: "Carry over" }], now);
    const md = decisionsToMarkdown(s, now);
    expect(md).toContain("## Done (1)");
    expect(md).toContain("shipped in v0.22");
    expect(md).toContain("## Carried over (1)");
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

  it("a reset to demo data is recorded, and reverting it brings the register back", () => {
    const s = createTicket(freshStore(), { ...blankTicket(), name: "real work" });
    const s1 = withHistory(s, "reset to demo data", resetToSeed, NOW);
    expect(s1.history).toHaveLength(1);
    expect(s1.tickets.some((t) => t.name === "real work")).toBe(false);
    expect(revertTo(s1, 0, NOW).tickets.some((t) => t.name === "real work")).toBe(true);
  });

  // ------------------------------------------------- change records, not states

  it("records only the tickets a change touched", () => {
    const s1 = withHistory(freshStore(), "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    expect(Object.keys(s1.history[0].tickets)).toEqual(["1"]);
    expect(s1.history[0].tickets["1"]!.sprint).toBeNull();           // the before-state
    expect(s1.history[0].settings).toBeUndefined();                   // settings untouched
    expect(s1.history[0].order).toBeUndefined();                      // nothing added or removed
  });

  it("records settings only when a change alters them", () => {
    const s1 = withHistory(freshStore(), "add release", (cur) => addSprint(cur, "v0.30"), NOW);
    expect(s1.history[0].tickets).toEqual({});
    expect(s1.history[0].settings!.sprints.some((x) => x.name === "v0.30")).toBe(false);
  });

  it("history does not grow with the number of tickets", () => {
    const fill = (extra: number) => {
      let s = freshStore();
      for (let i = 0; i < extra; i++) s = createTicket(s, { ...blankTicket(), name: `filler ${i}` });
      for (let i = 0; i < HISTORY_CAP; i++) {
        s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, 1, { carryovers: i }, NOW), NOW);
      }
      return JSON.stringify(s.history).length;
    };
    const small = fill(0);
    const large = fill(200);
    expect(large).toBe(small);
    // and no entry is a copy of the register
    let s = freshStore();
    for (let i = 0; i < HISTORY_CAP; i++) {
      s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, 1, { carryovers: i }, NOW), NOW);
    }
    for (const h of s.history) expect(Object.keys(h.tickets).length).toBe(1);
  });

  it("reverts across several changes by stepping back from the current state", () => {
    let s = freshStore();
    const original = structuredClone(s.tickets);
    s = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    s = withHistory(s, "new", (cur) => createTicket(cur, { ...blankTicket(), name: "added" }), NOW);
    s = withHistory(s, "delete 3", (cur) => deleteTicket(cur, 3), NOW);
    s = withHistory(s, "rename 2", (cur) => updateTicket(cur, 2, { name: "renamed" }, NOW), NOW);
    const back = revertTo(s, 0, NOW);
    expect(back.tickets).toEqual(original);                          // same tickets, same order

    const mid = revertTo(s, 2, NOW);                                  // before "delete 3"
    expect(mid.tickets.map((t) => t.id)).toEqual([...original.map((t) => t.id), s.nextTicketId - 1]);
    expect(mid.tickets.find((t) => t.id === 2)!.name).toBe(original.find((t) => t.id === 2)!.name);
  });

  it("puts a restored ticket back where it was", () => {
    const s = freshStore();
    const ids = s.tickets.map((t) => t.id);
    const s1 = withHistory(s, "delete", (cur) => deleteTicket(cur, ids[2]), NOW);
    expect(revertTo(s1, 0, NOW).tickets.map((t) => t.id)).toEqual(ids);
  });

  it("refuses a revert through a damaged entry, and changes nothing", () => {
    let s = freshStore();
    s = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    s = withHistory(s, "move 2", (cur) => moveTicketToSprint(cur, 2, "v0.24", NOW), NOW);
    const damaged = { ...s, history: [s.history[0], { ...s.history[1], tickets: { 2: { id: 99 } } } as never] };
    const plan = planRevert(damaged, 0);
    expect(plan.ok).toBe(false);
    expect(revertTo(damaged, 0, NOW)).toBe(damaged);
  });

  it("says when a revert reaches the oldest state the history holds", () => {
    let s = freshStore();
    s = withHistory(s, "a", (cur) => updateTicket(cur, 1, { carryovers: 1 }, NOW), NOW);
    s = withHistory(s, "b", (cur) => updateTicket(cur, 1, { carryovers: 2 }, NOW), NOW);
    expect(planRevert(s, 0)).toMatchObject({ ok: true, oldest: true });
    expect(planRevert(s, 1)).toMatchObject({ ok: true, oldest: false });
    expect(planRevert(s, 5).ok).toBe(false);
  });

  it("dropping the oldest entries at the cap keeps every later revert exact", () => {
    let s = freshStore();
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, (i % 3) + 1, { carryovers: i }, NOW), NOW);
    }
    // index 0 now holds "change 5"; reverting to it gives the state after "change 4"
    const back = revertTo(s, 0, NOW);
    expect(back.tickets.find((t) => t.id === 2)!.carryovers).toBe(4);
    expect(back.tickets.find((t) => t.id === 3)!.carryovers).toBe(2);
    expect(back.tickets.find((t) => t.id === 1)!.carryovers).toBe(3);
  });

  it("writes history as structured records, not escaped strings, in one file", () => {
    let s = freshStore();
    s = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    const text = serialize(s);
    expect(text).not.toContain('\\"tickets\\"');                   // no JSON-in-a-string
    const again = readStore(text)!;
    expect(again.history).toEqual(s.history);                         // tickets, decisions and history together
    expect(revertTo(again, 0, NOW).tickets.find((t) => t.id === 1)!.sprint).toBeNull();
  });

  it("refuses a save in the full-copy history format whole", () => {
    const old = { ...freshStore(), version: 3 };
    expect(STORE_VERSION).toBe(5);
    expect(readStore(JSON.stringify(old))).toBeNull();
  });

  it("a reset never reuses an id and keeps the decision log", () => {
    let s = freshStore();
    s = recordDecision(s, 1, "Defer", "later", "2026-11-02", NOW);
    const before = s.nextTicketId;
    const s1 = resetToSeed(s);
    expect(Math.min(...s1.tickets.map((t) => t.id))).toBe(before);
    expect(s1.nextTicketId).toBe(before + s1.tickets.length);
    expect(s1.decisions).toEqual(s.decisions);
  });
});

describe("weekly revisits", () => {
  it("lands every revisit on the weekly day, whatever day you defer from", () => {
    const wed = new Date(2026, 9, 21);                       // Wed 21 Oct 2026
    expect(REVISIT_WEEKDAY).toBe(1);                          // Monday
    expect(revisitInWeeks(1, wed)).toBe("2026-10-26");        // the next Monday, not +7 days
    expect(revisitInWeeks(2, wed)).toBe("2026-11-02");
    for (const n of REVISIT_WEEK_CHOICES) {
      expect(parseDate(revisitInWeeks(n, wed))!.getDay()).toBe(REVISIT_WEEKDAY);
    }
  });

  it("gives a full week when today is already the revisit day", () => {
    const mon = new Date(2026, 9, 19);                       // Mon 19 Oct 2026
    expect(revisitInWeeks(1, mon)).toBe("2026-10-26");
    expect(revisitInWeeks(4, mon)).toBe("2026-11-16");
  });

  it("is due once the day arrives, and not before", () => {
    expect(revisitIsDue("2026-10-26", new Date(2026, 9, 25))).toBe(false);
    expect(revisitIsDue("2026-10-26", new Date(2026, 9, 26))).toBe(true);
    expect(revisitIsDue("2026-10-26", new Date(2026, 9, 30))).toBe(true);
    expect(revisitIsDue(null)).toBe(false);
    expect(revisitIsDue("")).toBe(false);
  });

  it("defaults to the weekly day rather than a date n days out", () => {
    expect(parseDate(defaultRevisit(new Date(2026, 9, 21)))!.getDay()).toBe(REVISIT_WEEKDAY);
  });
});

describe("deferred work comes back", () => {
  const deferOn = new Date(2026, 9, 21);                     // Wed 21 Oct 2026

  it("returns to the queue on its revisit day, and not before", () => {
    const s = freshStore();
    const id = s.tickets[0].id;
    const deferred = recordDecision(s, id, "Defer", "not yet", "2026-11-02", deferOn);
    expect(deferred.tickets.find((t) => t.id === id)!.state).toBe("Deferred");
    expect(revisitDue(deferred, new Date(2026, 9, 26))).toEqual([]);      // still parked
    const due = revisitDue(deferred, new Date(2026, 10, 2));
    expect(due.map((x) => x.ticket.id)).toEqual([id]);
    expect(due[0].revisit).toBe("2026-11-02");
  });

  it("stops coming back once it is decided again", () => {
    const later = new Date(2026, 10, 2);
    let s = freshStore();
    const id = s.tickets[0].id;
    s = recordDecision(s, id, "Defer", "not yet", "2026-11-02", deferOn);
    expect(revisitDue(s, later)).toHaveLength(1);
    s = recordDecision(s, id, "Accept", "", null, later);
    expect(s.tickets.find((t) => t.id === id)!.state).toBe("New");
    expect(lastSetAside(s, id)?.revisit).toBe("2026-11-02");              // the old defer is still on record
    expect(revisitDue(s, later)).toEqual([]);                  // but it is no longer deferred
  });

  it("leads Fill out with work that has come back", () => {
    let s = freshStore();
    const id = s.tickets[0].id;
    s = recordDecision(s, id, "Defer", "later", "2026-11-02", deferOn);
    // before its day it is not in the queue at all
    expect(fillOutQueue(s, new Date(2026, 9, 26)).map((x) => x.ticket.id)).not.toContain(id);
    // on its day it leads, ahead of the incomplete
    const on = fillOutQueue(s, new Date(2026, 10, 2));
    expect(on[0].ticket.id).toBe(id);
    expect(on[0].returned!.reason).toBe("later");
    expect(on.length).toBeGreaterThan(1);
  });

  it("brings blocked work back too, with its block reason", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = recordDecision(s, 1, "Block", "waiting on partner sizing", "2026-11-02", deferOn);
    expect(fillOutQueue(s, new Date(2026, 9, 26)).map((x) => x.ticket.id)).not.toContain(1);
    const back = fillOutQueue(s, new Date(2026, 10, 2));
    expect(back[0]).toMatchObject({ ticket: { id: 1, state: "Blocked" }, returned: { reason: "waiting on partner sizing" } });
    // taking it on clears it: it is ready, so it moves to Schedule
    s = recordDecision(s, 1, "Accept", "", null, new Date(2026, 10, 2));
    expect(fillOutQueue(s, new Date(2026, 10, 2)).map((x) => x.ticket.id)).not.toContain(1);
    expect(scheduleQueue(s, new Date(2026, 10, 2)).map((t) => t.id)).toContain(1);
  });

  it("reports the most recent defer, so deferring again pushes the date out", () => {
    let s = freshStore();
    const id = s.tickets[0].id;
    s = recordDecision(s, id, "Defer", "first", "2026-10-26", deferOn);
    s = recordDecision(s, id, "Defer", "again", "2026-11-23", new Date(2026, 9, 26));
    expect(lastSetAside(s, id)?.revisit).toBe("2026-11-23");
    expect(revisitDue(s, new Date(2026, 10, 2))).toEqual([]);   // pushed out, so not due
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

describe("project picker", () => {
  const many = Array.from({ length: 500 }, (_, i) => `Project ${String(i).padStart(3, "0")}`);

  it("caps what it renders, and counts what it left out", () => {
    const m = matchProjects("", [], many);
    expect(m.shown).toHaveLength(PROJECT_SUGGESTION_CAP);
    expect(m.total).toBe(500);
    expect(m.available).toBe(500);
  });

  it("stays capped however many match", () => {
    const m = matchProjects("project", [], many);
    expect(m.shown).toHaveLength(PROJECT_SUGGESTION_CAP);
    expect(m.total).toBe(500);
  });

  it("narrows by substring", () => {
    const m = matchProjects("Project 01", [], many);
    expect(m.total).toBe(10);                                  // 010 through 019
    expect(m.shown).toHaveLength(10);
  });

  it("puts prefix matches first, so a short query finds the obvious one", () => {
    const list = ["WebPlatform", "Platform", "Platform Tools"];
    expect(matchProjects("plat", [], list).shown).toEqual(["Platform", "Platform Tools", "WebPlatform"]);
  });

  it("never offers what is already attached", () => {
    const m = matchProjects("", ["Atlas"], DEFAULT_PROJECTS);
    expect(m.shown).not.toContain("Atlas");
    expect(m.available).toBe(DEFAULT_PROJECTS.length - 1);
  });

  it("honours a custom cap", () => {
    expect(matchProjects("", [], many, 5).shown).toHaveLength(5);
  });
});

describe("ready to schedule", () => {
  const filled = (over: Partial<Ticket> = {}): Ticket =>
    mk({ priority: "Should", type: "Back-end", estimate: 1, dueDate: null, noHardDate: true, ...over });

  it("needs priority, type, estimate, and a date or an explicit no-hard-date", () => {
    expect(isReady(filled())).toBe(true);
    expect(missingRequired(filled({ priority: null }))).toEqual(["priority"]);
    expect(missingRequired(filled({ type: null }))).toEqual(["type"]);
    expect(missingRequired(filled({ estimate: null }))).toEqual(["estimate"]);
    expect(missingRequired(filled({ noHardDate: false }))).toEqual(["dueDate"]);
    expect(isReady(filled({ noHardDate: false, dueDate: "2026-12-01" }))).toBe(true);
  });

  it("project, summary and stakeholders are nudges, never gates", () => {
    const t = filled({ projects: [], summary: "", stakeholders: [] });
    expect(isReady(t)).toBe(true);
    const kinds = nudges(t).map((a) => a.kind);
    expect(kinds).toEqual(["NO-SUMMARY", "NO-PROJECTS", "NO-STAKEHOLDERS"]);
    expect(nudges(t).every((a) => a.why.length > 0)).toBe(true);
  });

  it("a new ticket starts blank, and so is not ready", () => {
    const b = blankTicket();
    expect(b).toMatchObject({ estimate: null, priority: null, type: null, dueDate: null, noHardDate: false });
    expect(isReady({ ...b, id: 1 })).toBe(false);
  });

  it("every seed ticket starts in Fill out: nobody chose an estimate", () => {
    const s = freshStore();
    expect(s.tickets.every((t) => t.estimate === null)).toBe(true);
    expect(fillOutQueue(s, NOW)).toHaveLength(s.tickets.length);
    expect(scheduleQueue(s, NOW)).toEqual([]);
  });

  it("a date and no-hard-date never both hold: the newer answer wins", () => {
    let s = updateTicket(freshStore(), 1, { noHardDate: true }, NOW);
    expect(s.tickets[0]).toMatchObject({ noHardDate: true, dueDate: null });
    s = updateTicket(s, 1, { dueDate: "2026-12-01" }, NOW);
    expect(s.tickets[0]).toMatchObject({ noHardDate: false, dueDate: "2026-12-01" });
  });

  it("filling the last required field accepts the ticket and moves it to Schedule", () => {
    let s = freshStore();
    const id = s.tickets.find((t) => t.priority !== null && t.type !== null)!.id;
    s = editTicket(s, id, { estimate: 2 }, NOW);
    const t = s.tickets.find((x) => x.id === id)!;
    if (!t.dueDate) s = editTicket(s, id, { noHardDate: true }, NOW);
    expect(scheduleQueue(s, NOW).map((x) => x.id)).toContain(id);
    expect(fillOutQueue(s, NOW).map((x) => x.ticket.id)).not.toContain(id);
    expect(s.decisions.filter((d) => d.action === "Accept").map((d) => d.ticketId)).toEqual([id]);
    // a further edit records no second accept
    s = editTicket(s, id, { estimate: 3 }, NOW);
    expect(s.decisions.filter((d) => d.action === "Accept")).toHaveLength(1);
  });

  it("an estimate is a whole number of sprints", () => {
    expect(missingRequired(filled({ estimate: 0 }))).toEqual(["estimate"]);
    expect(missingRequired(filled({ estimate: 1.5 }))).toEqual(["estimate"]);
    expect(missingRequired(filled({ estimate: 7 }))).toEqual([]);
  });
});

describe("spans", () => {
  // freshStore's releases, in ship order: v0.21, v0.22 (shipped), v0.23 (current), v0.24, v0.25
  const settings = () => freshStore().settings;

  it("counts releases in ship-date order, not display order", () => {
    expect(releaseOrder(settings().sprints).map((x) => x.name)).toEqual(["v0.21", "v0.22", "v0.23", "v0.24", "v0.25"]);
    const undated = [...settings().sprints, { name: "v0.30", freeze: null, release: null }, { name: "v0.26", freeze: null, release: null }];
    expect(releaseOrder(undated).slice(-2).map((x) => x.name)).toEqual(["v0.26", "v0.30"]);
  });

  it("a ticket occupies as many releases as its estimate, ending where it ships", () => {
    expect(spanOf(mk({ sprint: "v0.24", estimate: 2 }), settings())).toEqual({ releases: ["v0.23", "v0.24"], short: 0 });
    expect(spanOf(mk({ sprint: "v0.22", estimate: 3 }), settings())).toEqual({ releases: ["v0.21", "v0.22"], short: 1 });
    expect(spanOf(mk({ sprint: null, estimate: 3 }), settings()).releases).toEqual([]);
    expect(spanOf(mk({ sprint: "v0.24", estimate: null }), settings()).releases).toEqual(["v0.24"]);
  });

  it("costs one unit in each release it spans", () => {
    const t: Ticket[] = [
      mk({ id: 1, estimate: 2, state: "Committed", sprint: "v0.24" }),
      mk({ id: 2, estimate: 3, state: "Committed", sprint: "v0.25" }),
    ];
    const st = settings();
    expect(loadUnits(t, "v0.23", st)).toBe(2);
    expect(loadUnits(t, "v0.24", st)).toBe(2);
    expect(loadUnits(t, "v0.25", st)).toBe(1);
    expect(fillState(t, "v0.24", { ...st, commitTargetPerSprint: 2 }).state).toBe("full");
    expect(fillState(t, "v0.24", { ...st, commitTargetPerSprint: 1 })).toEqual({ load: 2, room: -1, state: "over" });
  });

  it("a growing estimate keeps the ship release and reaches further back", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.25", NOW);
    s = updateTicket(s, 1, { estimate: 2 }, NOW);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(t.sprint).toBe("v0.25");
    expect(spanOf(t, s.settings).releases).toEqual(["v0.24", "v0.25"]);
  });

  it("the current release is derived: the earliest neither shipped nor frozen", () => {
    expect(currentRelease(settings(), NOW)!.name).toBe("v0.23");
    expect(currentRelease(settings(), new Date(2026, 10, 2))!.name).toBe("v0.24");   // v0.23 ships 2026-11-01
  });
});

describe("starting too late", () => {
  it("is reported for work placed where it would have had to start in a shipped release", () => {
    // three sprints shipping in the current release: it would have started in v0.21
    const s = updateTicket(moveTicketToSprint(readyStore(3), 1, "v0.23", NOW), 1, {}, NOW);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(t.planned).toBe("2026-10-18");
    expect(startsTooLate(t, s.settings)).toBe(true);
    expect(riskAlerts(t, s.settings, NOW).map((a) => a.kind)).toContain("STARTS-LATE");
  });

  it("is not reported once a span has simply progressed", () => {
    // two sprints, planned in time to ship in v0.24: spans v0.23 and v0.24
    const s = moveTicketToSprint(readyStore(2), 1, "v0.24", NOW);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(startsTooLate(t, s.settings)).toBe(false);
    // later, v0.23 has shipped: progress, not lateness
    expect(hasShipped(findSprint(s.settings, "v0.23"), new Date(2026, 10, 5))).toBe(true);
    expect(startsTooLate(t, s.settings)).toBe(false);
    expect(beingWorkedOn(t, s.settings, NOW)).toBe(true);
  });

  it("is reported when the span runs off the front of the board", () => {
    const s = moveTicketToSprint(readyStore(9), 1, "v0.25", NOW);
    expect(startsTooLate(s.tickets.find((x) => x.id === 1)!, s.settings)).toBe(true);
  });

  it("carrying over does not make work late", () => {
    const shipped = new Date(2026, 10, 2);                         // v0.23 has shipped
    let s = moveTicketToSprint(readyStore(2), 1, "v0.23", new Date(2026, 9, 1));
    s = { ...s, tickets: s.tickets.map((t) => (t.id === 1 ? { ...t, planned: "2026-09-01" } : t)) };
    s = applyCloseOut(s, [{ id: 1, choice: "Carry over" }], shipped);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(t).toMatchObject({ sprint: "v0.24", carryovers: 1, planned: "2026-09-01" });
    expect(startsTooLate(t, s.settings)).toBe(false);
  });
});

describe("Check", () => {
  it("reports work that ships after its due date, with why", () => {
    let s = readyStore();
    s = updateTicket(s, 1, { dueDate: isoFromNow(20), noHardDate: false }, NOW);
    s = moveTicketToSprint(s, 1, "v0.24", NOW);                    // ships in 42 days
    const rel = checkReport(s, NOW).find((r) => r.release === "v0.24")!;
    const alert = rel.rows[0].alerts.find((a) => a.kind === "WONT-FIT")!;
    expect(alert.why).toMatch(/after its due date/);
    expect(shipsLate(s.tickets.find((t) => t.id === 1)!, s.settings)).toBe(true);
  });

  it("reports a release over capacity, and closed tickets raise nothing", () => {
    let s = readyStore();
    s = { ...s, settings: { ...s.settings, commitTargetPerSprint: 1 } };
    s = moveTicketToSprint(s, 1, "v0.24", NOW);
    s = moveTicketToSprint(s, 2, "v0.24", NOW);
    const rel = checkReport(s, NOW).find((r) => r.release === "v0.24")!;
    expect(rel.alerts.map((a) => a.kind)).toContain("OVER-CAPACITY");
    s = recordDecision(s, 2, "Decline", "no", null, NOW);
    expect(checkReport(s, NOW).find((r) => r.release === "v0.24")?.alerts ?? []).toEqual([]);
  });

  it("catches a due date that has already passed", () => {
    const t = mk({ dueDate: isoFromNow(-5), state: "New" });
    expect(riskAlerts(t, freshStore().settings, NOW).map((a) => a.kind)).toContain("PAST-DUE");
    expect(riskAlerts({ ...t, state: "Done" }, freshStore().settings, NOW)).toEqual([]);
  });

  it("does not check work still in Fill out: its card already shows its risks", () => {
    const s = freshStore();                                            // nothing is ready
    expect(checkReport(s, NOW)).toEqual([]);
    expect(pipeline(s, NOW).check).toBe(0);
  });

  it("the header counts each step", () => {
    const s = readyStore();
    const p = pipeline(s, NOW);
    expect(p.fillOut).toBe(0);
    expect(p.schedule).toBe(s.tickets.length);
    expect(pipeline(freshStore(), NOW).fillOut).toBe(freshStore().tickets.length);
  });
});

describe("release close-out", () => {
  const after = new Date(2026, 10, 2);                             // v0.23 shipped 2026-11-01

  const placed = () => {
    let s = readyStore();
    s = moveTicketToSprint(s, 1, "v0.23", NOW);
    s = moveTicketToSprint(s, 2, "v0.23", NOW);
    s = moveTicketToSprint(s, 3, "v0.23", NOW);
    s = moveTicketToSprint(s, 4, "v0.24", NOW);
    return updateTicket(s, 4, { estimate: 2 }, NOW);              // v0.24 spans v0.23
  };

  it("lists the open work that ships in a shipped release, and only that", () => {
    const q = closeOutQueue(placed(), after);
    expect(q.map((c) => c.release)).toEqual(["v0.23"]);
    expect(q[0].tickets.map((t) => t.id)).toEqual([1, 2, 3]);    // 4 only continues through v0.23
    expect(q[0].next).toBe("v0.24");
    expect(closeOutQueue(placed(), NOW)).toEqual([]);            // not shipped yet
  });

  it("applies each choice, and leaves the undecided where they are", () => {
    const s = applyCloseOut(placed(), [{ id: 1, choice: "Done" }, { id: 2, choice: "Carry over" }], after);
    expect(s.tickets.find((t) => t.id === 1)).toMatchObject({ state: "Done", closed: "2026-11-02" });
    expect(s.tickets.find((t) => t.id === 2)).toMatchObject({ state: "Committed", sprint: "v0.24", carryovers: 1 });
    expect(closeOutQueue(s, after)[0].tickets.map((t) => t.id)).toEqual([3]);
    const back = applyCloseOut(s, [{ id: 3, choice: "Unschedule" }], after);
    expect(back.tickets.find((t) => t.id === 3)).toMatchObject({ state: "New", sprint: null, planned: null });
    expect(closeOutQueue(back, after)).toEqual([]);
  });

  it("is one revertible action", () => {
    const s0 = placed();
    const s1 = withHistory(s0, "close out", (cur) => applyCloseOut(cur, [{ id: 1, choice: "Done" }, { id: 2, choice: "Done" }], after), after);
    expect(s1.history).toHaveLength(1);
    expect(revertTo(s1, 0, after).tickets).toEqual(s0.tickets);
  });

  it("cannot carry over when there is no later release", () => {
    let s = readyStore();
    s = moveTicketToSprint(s, 1, "v0.25", NOW);
    const later = new Date(2027, 0, 1);                            // everything has shipped
    expect(nextRelease(s.settings, "v0.25", later)).toBeNull();
    expect(closeOutQueue(s, later)[0].next).toBeNull();
    expect(applyCloseOut(s, [{ id: 1, choice: "Carry over" }], later)).toBe(s);
  });
});

describe("auto-optimize", () => {
  it("only proposes for ready, open tickets that have no release", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = updateTicket(s, 2, { estimate: null }, NOW);              // not ready any more
    const plan = optimizePlan(s, NOW).moves;
    expect(plan.map((m) => m.id)).not.toContain(1);
    expect(plan.map((m) => m.id)).not.toContain(2);
    for (const m of plan) expect(s.tickets.find((t) => t.id === m.id)!.sprint).toBeNull();
    expect(optimizePlan(freshStore(), NOW).candidates).toBe(0);    // nothing in the seed is ready
  });

  it("never proposes a span that includes a release that has already shipped", () => {
    const plan = optimizePlan(readyStore(2), NOW).moves;
    expect(plan.length).toBeGreaterThan(0);
    // two sprints: the earliest it can ship is v0.24 (spanning v0.23–v0.24)
    for (const m of plan) expect(["v0.24", "v0.25"]).toContain(m.to);
  });

  it("respects capacity in every release a ticket spans", () => {
    const s = readyStore(2);
    const applied = applyPlan(s, optimizePlan(s, NOW).moves, NOW);
    for (const name of ["v0.23", "v0.24", "v0.25"]) {
      expect(loadUnits(applied.tickets, name, applied.settings)).toBeLessThanOrEqual(s.settings.commitTargetPerSprint);
    }
  });

  it("will not ship a ticket where any release of its span is full", () => {
    const s = freshStore();
    const tight: Store = {
      ...s,
      settings: { ...s.settings, commitTargetPerSprint: 1 },
      tickets: [
        { ...mk({ id: 100, estimate: 1, state: "Committed", sprint: "v0.23", priority: "Should", type: "Driver" }), noHardDate: true },
        { ...mk({ id: 101, estimate: 2, state: "New", sprint: null, priority: "Should", type: "Driver" }), noHardDate: true },
      ],
    };
    const move = optimizePlan(tight, NOW).moves.find((m) => m.id === 101)!;
    expect(move.to).toBe("v0.25");                    // v0.24 would span the full v0.23
    expect(move.reason).toMatch(/v0.24–v0.25/);
  });

  it("reports work longer than the releases left", () => {
    const s = freshStore();
    const r = optimizePlan({
      ...s,
      tickets: [{ ...mk({ id: 100, estimate: 4, priority: "Should", type: "Driver" }), noHardDate: true }],
    }, NOW);
    expect(r.moves).toEqual([]);
    expect(r.tooBig).toBe(1);
    expect(explainPlan(r)).toMatch(/longer than the releases left/);
  });

  it("places dated work before undated work", () => {
    const s = readyStore();
    const plan = optimizePlan(s, NOW).moves;
    const dated = plan.map((m) => Boolean(s.tickets.find((t) => t.id === m.id)!.dueDate));
    const firstUndated = dated.indexOf(false);
    const lastDated = dated.lastIndexOf(true);
    if (firstUndated !== -1 && lastDated !== -1) expect(firstUndated).toBeGreaterThan(lastDated);
    expect(plan[0].reason).toMatch(/due \d{4}-\d{2}-\d{2}/);
  });

  it("applying commits the moves and the whole batch is revertible", () => {
    const s = readyStore();
    const plan = optimizePlan(s, NOW).moves;
    const s1 = withHistory(s, "auto-optimize", (cur) => applyPlan(cur, plan, NOW), NOW);
    const moved = s1.tickets.find((t) => t.id === plan[0].id)!;
    expect(moved).toMatchObject({ sprint: plan[0].to, state: "Committed", planned: "2026-10-18" });
    const s2 = revertTo(s1, s1.history.length - 1, NOW);
    expect(s2.tickets.find((t) => t.id === plan[0].id)!.sprint).toBeNull();
  });

  it("never proposes a placement that starts too late", () => {
    const s = readyStore(3);
    const applied = applyPlan(s, optimizePlan(s, NOW).moves, NOW);
    expect(applied.tickets.filter((t) => t.sprint).length).toBeGreaterThan(0);
    for (const t of applied.tickets) expect(startsTooLate(t, applied.settings)).toBe(false);
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
    let s = readyStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    const r = optimizePlan(s, NOW);
    expect(r.moves.map((m) => m.to)).not.toContain("v0.23");
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it("auto-optimize prefers a release that ships on or before the due date", () => {
    let s = readyStore();
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
    const s = readyStore();
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
    const s = readyStore();
    const tickets = s.tickets.map((t, i) => ({ ...t, sprint: i % 2 ? "v0.23" : "v0.24" }));
    const r = optimizePlan({ ...s, tickets }, NOW);
    expect(r.moves).toEqual([]);
    expect(r.candidates).toBe(0);
    expect(explainPlan(r)).toMatch(/no ready ticket is unscheduled/);
  });

  it("can fill in missing release dates on a cadence, oldest version first", () => {
    const s = readyStore();
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

  // The suite runs in a negative-offset timezone (see vite.config.ts), so an
  // evening timestamp is already the next day in UTC.
  const frozenOn = (freeze: string) =>
    updateSprint(freshStore(), "v0.23", { freeze, release: "2026-12-01" });
  const moveAt = (s: ReturnType<typeof freshStore>, at: Date) =>
    withHistory(s, "move 2 to v0.23", (cur) => moveTicketToSprint(cur, 2, "v0.23", at), at,
      { kind: "move", ticketId: 2, sprint: "v0.23" });

  it("counts a move made on the freeze day itself, since the release is frozen that day", () => {
    const s = moveAt(frozenOn("2026-10-10"), new Date(2026, 9, 10, 9, 0));
    expect(slippedIn(s, "v0.23", NOW)).toHaveLength(1);
  });

  it("judges a move by its local date, not its UTC one", () => {
    // 23:30 local on the 9th is already the 10th in UTC.
    const s = moveAt(frozenOn("2026-10-10"), new Date(2026, 9, 9, 23, 30));
    expect(new Date(2026, 9, 9, 23, 30).toISOString().slice(0, 10)).toBe("2026-10-10");
    expect(slippedIn(s, "v0.23", NOW)).toHaveLength(0);
  });
});

describe("timestamps are shown in local time", () => {
  const evening = new Date(2026, 9, 20, 23, 30);       // already the 21st in UTC

  it("adds calendar days, not 24-hour blocks, so a DST change cannot skip a date", () => {
    // US clocks spring forward on 2027-03-14: 23:30 on the 13th + 24h is 00:30 on the 15th.
    const lateNight = new Date(2027, 2, 14 - 1, 23, 30);
    expect(iso(addDays(lateNight, 1))).toBe("2027-03-14");
    expect(iso(addDays(lateNight, -1))).toBe("2027-03-12");
    expect(defaultSprints(lateNight).find((sp) => sp.name === "v0.23")!.release).toBe("2027-03-27");
  });

  it("formats a stored timestamp as the local date and time", () => {
    expect(localStamp(evening.toISOString())).toBe("2026-10-20 23:30");
  });

  it("dates exports and their filenames by the local day", () => {
    expect(stamp(evening)).toBe("2026-10-20");
    expect(decisionsToMarkdown(freshStore(), evening)).toContain("— 2026-10-20 (");
    expect(projectsToMarkdown(freshStore(), evening)).toContain("— 2026-10-20");
  });
});
