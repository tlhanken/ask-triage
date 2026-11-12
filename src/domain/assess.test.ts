import { describe, expect, it } from "vitest";
import { computeFlags, derive, isReady, missingRequired, nudges, queueHealth, scoreTicket } from "./assess";
import { DEFAULT_SETTINGS, externalLabel, type Ticket } from "./schema";
import { editTicket } from "./decisions";
import { fillOutQueue, scheduleQueue } from "./pipeline";
import { blankTicket, freshStore, updateTicket } from "./store";
import { NOW, freezeClock, mk } from "./test-fixtures";

freezeClock();

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
